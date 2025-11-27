// ===== Arduino MEGA — L9110S + 2 Servos + Ultrassônico + DHT11 (Versão Otimizada) =====
// Foco: Envio de pacotes curtos para não engarrafar o Bluetooth do ESP32.

#include <Arduino.h>
#include <Servo.h>
#include <DHT.h>

// -------- DHT11 (Telemetria) --------
#define DHTPIN  12        
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

unsigned long lastDhtMs = 0;
const unsigned long DHT_INTERVAL_MS = 3000; // 3 segundos

// -------- Ponte H (L9110S) --------
const uint8_t IN1 = 10;
const uint8_t IN2 = 4;
const uint8_t IN3 = 6;
const uint8_t IN4 = 5;

// Configuração de Inversão (Ajuste conforme sua fiação)
const bool INVERT_A = false; 
const bool INVERT_B = true;

inline void driveA(int d){
  int s = INVERT_A ? -d : d;
  digitalWrite(IN1, s > 0);
  digitalWrite(IN2, s < 0);
}
inline void driveB(int d){
  int s = INVERT_B ? -d : d;
  digitalWrite(IN3, s > 0);
  digitalWrite(IN4, s < 0);
}
inline void Stop(){ driveA(0); driveB(0); }
inline void Fwd(){  driveA(+1); driveB(+1); }
inline void Back(){ driveA(-1); driveB(-1); }
inline void Left(){ driveA(+1); driveB(-1); }
inline void Right(){driveA(-1); driveB(+1); }

// -------- FSM de giro 90° --------
enum TurnState { T_IDLE, T_RIGHT, T_LEFT };
TurnState tstate = T_IDLE;
unsigned long tStartMs = 0;
unsigned long tDurationMs = 0;
bool ackTurnPending = false;

const unsigned long TURN_90_MS_R = 500;
const unsigned long TURN_90_MS_L = 500;

void startTurnRight90() {
  Right();
  tstate = T_RIGHT;
  tStartMs = millis();
  tDurationMs = TURN_90_MS_R;
  ackTurnPending = true;
}
void startTurnLeft90() {
  Left();
  tstate = T_LEFT;
  tStartMs = millis();
  tDurationMs = TURN_90_MS_L;
  ackTurnPending = true;
}
void tickTurn() {
  if (tstate == T_IDLE) return;
  if (millis() - tStartMs >= tDurationMs) {
    Stop();
    tstate = T_IDLE;
    if (ackTurnPending) {
      Serial1.println("ACK:TURN");
      ackTurnPending = false;
    }
  }
}

// -------- Servos (Não bloqueante) --------
const uint8_t SERVO_PAN_PIN  = 8;
const uint8_t SERVO_TILT_PIN = 9;
Servo sPan, sTilt;
int panDeg  = 90;
int tiltDeg = 90;

// Move direto sem delay para não travar comunicação
void servoMove(Servo &s, int &cur, int target) {
  if (target < 0) target = 0;
  if (target > 180) target = 180;
  s.write(target);
  cur = target;
}

// -------- Ultrassônico --------
const uint8_t US_TRIG = 2;
const uint8_t US_ECHO = 3;

long measureUScm(){
  digitalWrite(US_TRIG, LOW); delayMicroseconds(2);
  digitalWrite(US_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(US_TRIG, LOW);
  unsigned long dur = pulseIn(US_ECHO, HIGH, 25000UL); // Timeout curto (25ms)
  if (dur == 0) return -1;
  return dur / 58;
}

// -------- Parser --------
bool parseIntAfter(const String &l, char sep, int &out){
  int p = l.indexOf(sep);
  if (p < 0) return false;
  out = l.substring(p+1).toInt();
  return true;
}

void handleLine(String l){
  l.trim(); if (!l.length()) return;
  String u = l; u.toUpperCase();

  // Comandos de Movimento
  if (u == "B"){ Fwd();  Serial1.println("OK:FWD");  return; } // Invertido conforme seu setup
  if (u == "F"){ Back(); Serial1.println("OK:BACK"); return; }
  if (u == "L"){ Left(); Serial1.println("OK:LEFT"); return; }
  if (u == "R"){ Right();Serial1.println("OK:RIGHT");return; }
  if (u == "S"){ Stop(); Serial1.println("OK:STOP"); return; }

  // Protocolo Autônomo
  if (u == "DRV:FWD:ON"){  Fwd();  Serial1.println("OK:DRV:FWD:ON");  return; }
  if (u == "DRV:FWD:OFF"){ Stop(); Serial1.println("OK:DRV:FWD:OFF"); return; }
  if (u == "DRV:TURN:90R"){ startTurnRight90(); Serial1.println("OK:TURN:REQ:R"); return; }
  if (u == "DRV:TURN:90L"){ startTurnLeft90();  Serial1.println("OK:TURN:REQ:L"); return; }

  // Servos (Simplificado para evitar bloqueio)
  int v=0;
  if (u.startsWith("SV1:")){ if (parseIntAfter(l,':',v)) servoMove(sPan, panDeg, v); return; }
  if (u.startsWith("SV2:")){ if (parseIntAfter(l,':',v)) servoMove(sTilt, tiltDeg, v); return; }
  if (u.startsWith("PAN")){ if (parseIntAfter(l,',',v)) servoMove(sPan, panDeg, v); return; }
  if (u.startsWith("TILT")){ if (parseIntAfter(l,',',v)) servoMove(sTilt, tiltDeg, v); return; }

  // Solicitação de Ultrassom
  if (u == "US?"){
    long cm = measureUScm();
    if (cm < 0) cm = 999;
    Serial1.print("US:dist="); Serial1.println(cm);
    return;
  }
}

void setup(){
  pinMode(IN1,OUTPUT); pinMode(IN2,OUTPUT);
  pinMode(IN3,OUTPUT); pinMode(IN4,OUTPUT);
  Stop();

  sPan.attach(SERVO_PAN_PIN);
  sTilt.attach(SERVO_TILT_PIN);
  sPan.write(panDeg); sTilt.write(tiltDeg);

  pinMode(US_TRIG,OUTPUT);
  pinMode(US_ECHO,INPUT);
  digitalWrite(US_TRIG,LOW);

  dht.begin();

  Serial.begin(115200);  
  Serial1.begin(115200); 
  Serial.println("MEGA Otimizado Pronto");
}

void loop(){
  // 1. Leitura Serial (Alta prioridade)
  if (Serial1.available()){
    String l = Serial1.readStringUntil('\n');
    handleLine(l);
  }

  // 2. FSM de Giro
  tickTurn();

  // 3. Telemetria (Baixa prioridade)
  if (millis() - lastDhtMs > DHT_INTERVAL_MS) {
    lastDhtMs = millis();
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    
    // Envia PACOTE COMPACTO (< 20 bytes) para garantir envio no BLE
    if (!isnan(h) && !isnan(t)) {
      Serial1.print("DHT:T=");
      Serial1.print(t, 1);
      Serial1.print(",H=");
      Serial1.println(h, 1);
    }
  }
}