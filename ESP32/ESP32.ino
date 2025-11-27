// ===== ESP32-CAM — BLE (NUS) + FOTO + UART bridge + Missão Autônoma =====
// ATUALIZAÇÃO: Telemetria (DHT) removida daqui e delegada ao Arduino MEGA.
// Este código agora atua apenas como "ponte" para os dados do sensor.

#include <Arduino.h>
#include <esp_camera.h>
#include <HardwareSerial.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include "esp_bt.h"

// ===== Pinagem câmera (AI-Thinker) =====
#define CAM_PIN_PWDN  32
#define CAM_PIN_RESET -1
#define CAM_PIN_XCLK   0
#define CAM_PIN_SIOD  26
#define CAM_PIN_SIOC  27
#define CAM_PIN_D7    35
#define CAM_PIN_D6    34
#define CAM_PIN_D5    39
#define CAM_PIN_D4    36
#define CAM_PIN_D3    21
#define CAM_PIN_D2    19
#define CAM_PIN_D1    18
#define CAM_PIN_D0     5
#define CAM_PIN_VSYNC 25
#define CAM_PIN_HREF  23
#define CAM_PIN_PCLK  22

// ===== UART com o MEGA =====
HardwareSerial MEGA(0);          // UART0
const int MEGA_TX = 1;           // ESP32 TX0 -> Mega RX1 (pino 19)
const int MEGA_RX = 3;           // ESP32 RX0 <- Mega TX1 (pino 18)
const uint32_t MEGA_BAUD = 115200;

// ===== BLE (Nordic UART Service) =====
static BLEUUID SERVICE_UUID("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
static BLEUUID RX_CHAR_UUID("6E400002-B5A3-F393-E0A9-E50E24DCCA9E");
static BLEUUID TX_CHAR_UUID("6E400003-B5A3-F393-E0A9-E50E24DCCA9E");

BLECharacteristic* txChar = nullptr;
bool deviceConnected = false;

inline void bleNotify(const char* msg) {
  if (deviceConnected && txChar) {
    txChar->setValue(std::string(msg));
    txChar->notify();
  }
}

// ===== Câmera =====
bool initCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = CAM_PIN_D0;
  config.pin_d1       = CAM_PIN_D1;
  config.pin_d2       = CAM_PIN_D2;
  config.pin_d3       = CAM_PIN_D3;
  config.pin_d4       = CAM_PIN_D4;
  config.pin_d5       = CAM_PIN_D5;
  config.pin_d6       = CAM_PIN_D6;
  config.pin_d7       = CAM_PIN_D7;
  config.pin_xclk     = CAM_PIN_XCLK;
  config.pin_pclk     = CAM_PIN_PCLK;
  config.pin_vsync    = CAM_PIN_VSYNC;
  config.pin_href     = CAM_PIN_HREF;
  config.pin_sccb_sda = CAM_PIN_SIOD;
  config.pin_sccb_scl = CAM_PIN_SIOC;
  config.pin_pwdn     = CAM_PIN_PWDN;
  config.pin_reset    = CAM_PIN_RESET;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  config.frame_size   = FRAMESIZE_QQVGA;   // 160x120
  config.jpeg_quality = 15;
  config.fb_count     = 1;

  if (psramFound()) {
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.grab_mode   = CAMERA_GRAB_LATEST;
  } else {
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.grab_mode   = CAMERA_GRAB_WHEN_EMPTY;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf(" Camera init err=0x%x\n", err);
    return false;
  }
  Serial.println(" Camera OK");
  return true;
}

// ===== Foto via BLE =====
volatile bool busyPhoto = false;

void captureAndSendPhoto() {
  if (busyPhoto) { bleNotify("BUSY"); return; }
  busyPhoto = true;

  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    bleNotify("ERR:CAM_CAPTURE");
    busyPhoto = false;
    return;
  }

  const size_t len = fb->len;
  const uint16_t PAY = 120;
  const uint16_t chunks = (len + PAY - 1) / PAY;

  bleNotify("PHOTO:START");
  char meta[64];
  snprintf(meta, sizeof(meta), "META:size=%u,chunks=%u", (unsigned)len, (unsigned)chunks);
  bleNotify(meta);

  uint8_t pkt[4 + PAY];
  pkt[0] = 'C'; pkt[1] = 'H';
  uint16_t seq = 0;

  for (size_t off = 0; off < len && deviceConnected; off += PAY, seq++) {
    size_t n = min((size_t)PAY, len - off);
    pkt[2] = (uint8_t)(seq >> 8);
    pkt[3] = (uint8_t)(seq & 0xFF);
    memcpy(pkt + 4, fb->buf + off, n);
    txChar->setValue(pkt, 4 + n);
    txChar->notify();
    delay(4); 
  }

  esp_camera_fb_return(fb);
  bleNotify("DONE");
  bleNotify("PHOTO:DONE");
  busyPhoto = false;
}

// ===== Missão: modos e FSM =====
enum MissionMode { MODE_MANUAL, MODE_AUTO, MODE_PAUSED };
MissionMode missionMode = MODE_MANUAL;

enum AutoState { ST_IDLE, ST_AUTO_FWD, ST_AUTO_PHOTOS, ST_AUTO_TURN };
AutoState autoState = ST_IDLE;

// ---- Parâmetros de navegação AUTO ----
const uint16_t OBST_THRESHOLD_CM       = 25;
const uint32_t PHOTO_FINAL_COOLDOWN_MS = 800;
uint8_t  photoCount = 0;
bool     turnLeft   = true;
uint32_t nextPhotoAtMs = 0;
uint32_t phaseTimer = 0;
uint8_t  obstLowCount = 0;

// US e ACK
uint16_t lastUSDist = 999;
uint32_t lastUSUpdateMs = 0;
bool     waitingTurnAck = false;
uint32_t turnTimeoutMs = 2500;

const bool AUTO_INVERT_DIR = true;

inline void megaSend(const char* s) {
  MEGA.write((const uint8_t*)s, strlen(s));
  MEGA.write('\n');
}

inline bool usFresh(uint32_t maxAgeMs = 600) {
  return (millis() - lastUSUpdateMs) <= maxAgeMs;
}

inline void requestUSIfDue(uint32_t periodMs = 120) {
  static uint32_t lastPoll = 0;
  if (millis() - lastPoll >= periodMs) {
    lastPoll = millis();
    if (!busyPhoto) {
      megaSend("US?");
    }
  }
}

inline void driveForward(bool on) {
  if (AUTO_INVERT_DIR) {
    if (on) megaSend("F");
    else    megaSend("S");
  } else {
    if (on) megaSend("DRV:FWD:ON");
    else    megaSend("DRV:FWD:OFF");
  }
}

inline void turn90(bool left) {
  waitingTurnAck = true;
  if (left) megaSend("DRV:TURN:90L");
  else      megaSend("DRV:TURN:90R");
}

inline void stopAuto() {
  missionMode     = MODE_MANUAL;
  autoState       = ST_IDLE;
  waitingTurnAck  = false;
  photoCount      = 0;
  obstLowCount    = 0;
  driveForward(false);
  megaSend("S");
  bleNotify("MODE:MANUAL");
  bleNotify("MISSION:STOPPED");
}

void runAutoFSM() {
  if (missionMode != MODE_AUTO) {
    if (autoState != ST_IDLE) { autoState = ST_IDLE; waitingTurnAck = false; megaSend("S"); }
    return;
  }

  requestUSIfDue(120);

  switch (autoState) {
    case ST_IDLE:
      driveForward(true);
      autoState = ST_AUTO_FWD;
      break;

    case ST_AUTO_FWD: {
      if (usFresh()) {
        if ((int)lastUSDist <= OBST_THRESHOLD_CM) {
          obstLowCount++;
        } else {
          obstLowCount = 0;
        }
        if (obstLowCount >= 2) { 
          megaSend("S");
          bleNotify("MISSION:OBSTACLE");
          photoCount    = 0;
          obstLowCount  = 0;
          nextPhotoAtMs = millis() + 1000; 
          autoState     = ST_AUTO_PHOTOS;
        }
      }
    } break;

    case ST_AUTO_PHOTOS:
      if (photoCount < 1 && !busyPhoto && millis() >= nextPhotoAtMs) {
        captureAndSendPhoto();
        photoCount++;
        phaseTimer = millis() + 2000; 
      }
      if (photoCount >= 1 && millis() - phaseTimer >= PHOTO_FINAL_COOLDOWN_MS && !busyPhoto) {
        turn90(turnLeft);
        phaseTimer = millis();
        autoState  = ST_AUTO_TURN;
      }
      break;

    case ST_AUTO_TURN:
      if (!waitingTurnAck || (millis() - phaseTimer >= turnTimeoutMs)) {
        turnLeft = !turnLeft;
        driveForward(true);
        autoState = ST_AUTO_FWD;
      }
      break;
  }
}

// ===== BLE Callbacks =====
class RxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    std::string v = c->getValue();
    if (v.empty()) return;

    if (v.rfind("MISSION:START:AUTONOMOUS", 0) == 0) {
      missionMode = MODE_AUTO;
      autoState   = ST_IDLE;
      bleNotify("MODE:AUTO");
      return;
    }

    if (v == "AUTO_STOP" || v == "MISSION:STOP") { stopAuto(); return; }
    if (v == "MISSION:MANUAL") { stopAuto(); return; }
    if (v == "MISSION:AUTO")   { missionMode = MODE_AUTO; autoState = ST_IDLE; bleNotify("MODE:AUTO"); return; }
    if (v == "MISSION:PAUSE")  { missionMode = MODE_PAUSED; autoState = ST_IDLE; megaSend("S"); bleNotify("MODE:PAUSED"); return; }
    if (v == "RESUME")         { missionMode = MODE_AUTO;   autoState = ST_IDLE; bleNotify("MODE:AUTO"); return; }
    if (v == "PHOTO")          { captureAndSendPhoto(); return; }

    // NOTA: Comandos de DHT (HUM:ON, etc) agora caem aqui e são repassados ao Mega
    MEGA.write((const uint8_t*)v.data(), v.size());
    MEGA.write('\n');

    Serial.printf("➡ MEGA: %s\n", v.c_str());
  }
};

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    deviceConnected = true;
    Serial.println("🔗 BLE conectado");
  }
  void onDisconnect(BLEServer*) override {
    deviceConnected = false;
    busyPhoto = false;
    stopAuto();
    Serial.println(" BLE desconectado — reanunciando");
    BLEDevice::startAdvertising();
  }
};

void startBLE() {
  esp_bt_controller_mem_release(ESP_BT_MODE_CLASSIC_BT);
  BLEDevice::init("ESP32-CAR");
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService* svc = server->createService(SERVICE_UUID);
  txChar = svc->createCharacteristic(TX_CHAR_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  txChar->addDescriptor(new BLE2902());
  BLECharacteristic* rx = svc->createCharacteristic(
      RX_CHAR_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(new RxCallbacks());
  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println(" BLE advertising: 'ESP32-CAR'");
}

// ===== UART parsing (Mega -> ESP/App) =====
static char megaLineBuf[96];
static uint8_t megaLineLen = 0;

void parseMegaLine(const char* line) {
  // Lógica Autônoma: Distância
  if (strncmp(line, "US:dist=", 8) == 0) {
    int d = atoi(line + 8);
    if (d > 0 && d < 2000) {
      lastUSDist = (uint16_t)d;
      lastUSUpdateMs = millis();
    }
  }
  // Lógica Autônoma: ACK de Giro
  else if (strcmp(line, "ACK:TURN") == 0) {
    waitingTurnAck = false;
  }
  // Telemetria (DHT): Repassa direto ao App
  else if (strncmp(line, "DHT:", 4) == 0) {
    bleNotify(line);
  }
}

void setup() {
  pinMode(4, INPUT);
  Serial.begin(115200);
  delay(400);
  Serial.println("\n Boot ESP32-CAM (BLE + FOTO + UART + AUTO)");

  MEGA.begin(MEGA_BAUD, SERIAL_8N1, MEGA_RX, MEGA_TX);
  delay(200);
  Serial.println(" UART Mega on GPIO3/1");

  if (!initCamera()) Serial.println("⚠ Camera falhou (seguindo)");

  // DHT removido do ESP32. Agora é função do Mega.
  
  startBLE();
  Serial.println(" Sistema pronto");
}

void loop() {
  while (MEGA.available()) {
    char c = (char)MEGA.read();

    /* ECO MANUAL DESATIVADO: 
       Como agora temos telemetria vindo automaticamente do Mega (DHT:...),
       não devemos ecoar byte a byte para não sujar o canal BLE.
       O 'parseMegaLine' cuida de enviar as mensagens completas.
    */
    // if (!busyPhoto && deviceConnected && txChar) {
    //   txChar->setValue((uint8_t*)&c, 1);
    //   txChar->notify();
    // }

    // Montar linha
    if (c == '\n' || c == '\r') {
      if (megaLineLen > 0) {
        megaLineBuf[megaLineLen] = '\0';
        parseMegaLine(megaLineBuf);
        megaLineLen = 0;
      }
    } else if (megaLineLen < sizeof(megaLineBuf) - 1) {
      megaLineBuf[megaLineLen++] = c;
    } else {
      megaLineLen = 0;
    }
  }

  runAutoFSM();

  static uint32_t hb = 0;
  if (millis() - hb > 2000) {
    hb = millis();
    Serial.println(deviceConnected ? " BLE conectado" : " advertising...");
  }
  delay(5);
}