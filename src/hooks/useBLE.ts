import { useState, useCallback, useEffect, useRef } from 'react';
import { BleClient, BleDevice, numbersToDataView, dataViewToText, dataViewToNumbers } from '@capacitor-community/bluetooth-le';

// Nordic UART Service UUIDs
const NUS_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const NUS_RX_CHAR_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';
const NUS_TX_CHAR_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';

export type ConnectionState = 'idle' | 'scanning' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type Command = 'F' | 'B' | 'L' | 'R' | 'S' | 'U' | 'D';

interface BLEDevice {
  device: BleDevice;
  rssi: number;
  name?: string;
}

export const useBLE = () => {
  const [state, setState] = useState<ConnectionState>('idle');
  const [devices, setDevices] = useState<BLEDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<BleDevice | null>(null);
  const [lastCommand, setLastCommand] = useState<Command>('S');
  const [rssi, setRssi] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const keepAliveInterval = useRef<NodeJS.Timeout | null>(null);
  const onNotifyCallbackRef = useRef<((data: string) => void) | null>(null);
  const onNotifyRawCallbackRef = useRef<((dv: DataView) => void) | null>(null);
  const onPhotoMetaRef = useRef<((meta: { size: number; chunks: number; width?: number; height?: number }) => void) | null>(null);
  const onPhotoChunkRef = useRef<((seq: number, payload: Uint8Array) => void) | null>(null);
  const onPhotoDoneRef = useRef<(() => void) | null>(null);
  const onPhotoBeginRef = useRef<((seq: number) => void) | null>(null);
  const onPhotoEndRef = useRef<((seq: number) => void) | null>(null);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-50), `[${timestamp}] ${message}`]);
    console.log(message);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const setNotifyCallback = useCallback((callback: ((data: string) => void) | null) => {
    onNotifyCallbackRef.current = callback;
  }, []);

  const setNotifyRawCallback = useCallback((cb: ((dv: DataView) => void) | null) => {
    onNotifyRawCallbackRef.current = cb;
  }, []);

  const setOnPhotoMeta = useCallback((cb: ((meta: { size: number; chunks: number; width?: number; height?: number }) => void) | null) => {
    onPhotoMetaRef.current = cb;
  }, []);

  const setOnPhotoChunk = useCallback((cb: ((seq: number, payload: Uint8Array) => void) | null) => {
    onPhotoChunkRef.current = cb;
  }, []);

  const setOnPhotoDone = useCallback((cb: (() => void) | null) => {
    onPhotoDoneRef.current = cb;
  }, []);

  const setOnPhotoBegin = useCallback((cb: ((seq: number) => void) | null) => {
    onPhotoBeginRef.current = cb;
  }, []);

  const setOnPhotoEnd = useCallback((cb: ((seq: number) => void) | null) => {
    onPhotoEndRef.current = cb;
  }, []);

  const parseMeta = useCallback((text: string): { size: number; chunks: number; width?: number; height?: number } | null => {
    const m = text.match(/META:size=(\d+),chunks=(\d+)(?:,seq=(\d+))?(?:,w=(\d+))?(?:,h=(\d+))?/);
    if (!m) return null;
    return {
      size: parseInt(m[1]),
      chunks: parseInt(m[2]),
      width: m[4] ? parseInt(m[4]) : undefined,
      height: m[5] ? parseInt(m[5]) : undefined,
    };
  }, []);

  const initialize = useCallback(async () => {
    try {
      addLog('Initializing BLE...');
      await BleClient.initialize({ androidNeverForLocation: false });
      addLog('BLE initialized successfully');
      return true;
    } catch (err) {
      addLog(`BLE initialization error: ${err}`);
      setError(`Failed to initialize Bluetooth: ${err}`);
      return false;
    }
  }, [addLog]);

  const requestPermissions = useCallback(async () => {
    try {
      addLog('Requesting Bluetooth permissions...');
      const initialized = await initialize();
      if (!initialized) return false;
      
      addLog('Bluetooth permissions granted');
      return true;
    } catch (err) {
      addLog(`Permission error: ${err}`);
      setError('Bluetooth permissions denied. Please enable Bluetooth in settings.');
      return false;
    }
  }, [addLog, initialize]);

  const scanForDevices = useCallback(async (deviceName?: string, scanByUUID?: boolean, showAll: boolean = false) => {
    try {
      setState('scanning');
      setDevices([]);
      setError(null);
      
      const scanMode = showAll ? 'todos dispositivos' : scanByUUID ? 'por UUID' : deviceName ? `para ${deviceName}` : 'todos dispositivos';
      addLog(`Iniciando busca (${scanMode})...`);

      // Ensure BLE is initialized
      const initialized = await initialize();
      if (!initialized) {
        setState('idle');
        return;
      }

      const foundDevices: BLEDevice[] = [];
      const scanOptions: any = {};

      // Configure scan filters - ROVER PAMPA specific
      if (!showAll) {
        if (scanByUUID) {
          scanOptions.services = [NUS_SERVICE_UUID];
          addLog('Procurando com filtro UUID do serviço NUS');
        } else if (deviceName) {
          scanOptions.namePrefix = deviceName;
          addLog(`Procurando com prefixo: ${deviceName}`);
        }
      } else {
        addLog('Procurando todos os dispositivos (sem filtros)');
      }

      await BleClient.requestLEScan(
        scanOptions,
        (result) => {
          const exists = foundDevices.find(d => d.device.deviceId === result.device.deviceId);
          if (!exists) {
            const bleDevice = {
              device: result.device,
              rssi: result.rssi || 0,
              name: result.localName || result.device.name || 'Unknown',
            };
            foundDevices.push(bleDevice);
            setDevices([...foundDevices]);
            addLog(`Found: ${bleDevice.name} (RSSI: ${bleDevice.rssi} dBm)`);
          }
        }
      );

      // 15 second scan for better discovery
      setTimeout(async () => {
        await BleClient.stopLEScan();
        addLog(`Busca concluída. Encontrado(s) ${foundDevices.length} dispositivo(s)`);
        if (foundDevices.length === 0) {
          setError('Nenhum dispositivo encontrado. Certifique-se de que o ROVER PAMPA está ligado e próximo.');
        }
        setState('idle');
      }, 15000);
    } catch (err) {
      addLog(`Scan error: ${err}`);
      setError(`Scan failed: ${err}. Make sure Bluetooth is enabled and permissions granted.`);
      setState('idle');
    }
  }, [addLog, initialize]);

  const connect = useCallback(async (device: BleDevice) => {
    try {
      setState('connecting');
      setError(null);
      addLog(`Connecting to ${device.name || device.deviceId}...`);

      await BleClient.connect(device.deviceId, (deviceId) => {
        addLog(`Disconnected from ${deviceId}`);
        setConnectedDevice(null);
        setState('disconnected');
        // Start auto-reconnect
        reconnectAttempts.current = 0;
      });

      addLog('Connected! Discovering services...');
      
      // Discover services
      const services = await BleClient.getServices(device.deviceId);
      addLog(`Found ${services.length} service(s)`);

      // Enable notifications on TX characteristic
      await BleClient.startNotifications(
        device.deviceId,
        NUS_SERVICE_UUID,
        NUS_TX_CHAR_UUID,
        (value) => {
          if (onNotifyRawCallbackRef.current) {
            onNotifyRawCallbackRef.current(value);
          }
          let text = '';
          try { text = dataViewToText(value); } catch {}
          if (text) {
            addLog(`Received: ${text}`);
            if (onNotifyCallbackRef.current) {
              onNotifyCallbackRef.current(text.trim());
            }
            if (text.startsWith('PHOTO:START')) {
              addLog('PHOTO START');
              if (onPhotoBeginRef.current) onPhotoBeginRef.current(NaN as any);
            } else if (text.startsWith('PHOTO:BEGIN:')) {
              const parts = text.split(':');
              const seq = parseInt(parts[parts.length - 1]);
              addLog(`PHOTO BEGIN seq=${seq}`);
              if (!isNaN(seq) && onPhotoBeginRef.current) onPhotoBeginRef.current(seq);
            } else if (text.startsWith('META:')) {
              const meta = parseMeta(text);
              addLog('META line');
              if (meta && onPhotoMetaRef.current) onPhotoMetaRef.current(meta);
            } else if (text.startsWith('DONE')) {
              addLog('PHOTO DONE');
              if (onPhotoDoneRef.current) onPhotoDoneRef.current();
            } else if (text.startsWith('PHOTO:DONE')) {
              addLog('PHOTO DONE (END)');
              if (onPhotoEndRef.current) onPhotoEndRef.current(NaN as any);
            } else if (text.startsWith('PHOTO:END:')) {
              const parts = text.split(':');
              const seq = parseInt(parts[parts.length - 1]);
              addLog(`PHOTO END seq=${seq}`);
              if (!isNaN(seq) && onPhotoEndRef.current) onPhotoEndRef.current(seq);
            }
            if (text === 'F' || text === 'U') setLastCommand('F');
            else if (text === 'B' || text === 'D') setLastCommand('B');
            else if (text === 'L') setLastCommand('L');
            else if (text === 'R') setLastCommand('R');
            else if (text === 'S') setLastCommand('S');
          }
          const nums = dataViewToNumbers(value);
          if (nums && nums.length >= 4 && nums[0] === 67 && nums[1] === 72) {
            const seq = (nums[2] << 8) | nums[3];
            const payload = new Uint8Array(nums.slice(4));
            addLog(`PHOTO CH seq=${seq} size=${payload.length}`);
            if (onPhotoChunkRef.current) onPhotoChunkRef.current(seq, payload);
          }
        }
      );

      setConnectedDevice(device);
      setState('connected');
      reconnectAttempts.current = 0;
      addLog('Ready to control!');
    } catch (err) {
      addLog(`Connection error: ${err}`);
      setError(`Failed to connect: ${err}`);
      setState('idle');
    }
  }, [addLog]);

  const writeCommand = useCallback(async (command: Command | string) => {
    if (!connectedDevice) {
      addLog('No device connected');
      throw new Error('No device connected');
    }

    try {
      // Suporte a comandos string (para servos) ou char (para direção)
      // Para comandos multi-caractere (ex.: SV1:90, PHOTO, HUM:ON), adiciona terminador '\n' se não houver
      const commandStr = typeof command === 'string' ? command : command;
      const needsTerminator = typeof commandStr === 'string' && commandStr.length > 1 && !commandStr.endsWith('\n');
      const payload = needsTerminator ? `${commandStr}\n` : commandStr;

      const encoder = new TextEncoder();
      const bytes = encoder.encode(payload as string);
      const data = numbersToDataView(Array.from(bytes));

      // Primeiro tenta writeWithoutResponse; se falhar, faz fallback para write
      try {
        await BleClient.writeWithoutResponse(
          connectedDevice.deviceId,
          NUS_SERVICE_UUID,
          NUS_RX_CHAR_UUID,
          data
        );
        addLog(`Sent: ${typeof commandStr === 'string' ? payload : commandStr}`);
      } catch (e) {
        addLog(`writeWithoutResponse failed, trying write: ${e}`);
        await BleClient.write(
          connectedDevice.deviceId,
          NUS_SERVICE_UUID,
          NUS_RX_CHAR_UUID,
          data
        );
        addLog(`Sent (write): ${typeof commandStr === 'string' ? payload : commandStr}`);
      }
      
      // Só atualiza lastCommand se for um comando de direção
      if (typeof command !== 'string' || ['F', 'B', 'L', 'R', 'S', 'U', 'D'].includes(command)) {
        setLastCommand(command as Command);
      }
    } catch (err) {
      addLog(`Write error: ${err}`);
      throw err;
    }
  }, [connectedDevice, addLog]);

  const startKeepAlive = useCallback((command: Command, intervalMs: number = 100) => {
    if (keepAliveInterval.current) {
      clearInterval(keepAliveInterval.current);
    }

    // Send immediately
    writeCommand(command);

    // Keep sending at interval (ESP32 timeout is 220ms, so 100ms is safe)
    keepAliveInterval.current = setInterval(() => {
      writeCommand(command);
    }, intervalMs);

    addLog(`Keep-alive started: ${command} every ${intervalMs}ms`);
  }, [writeCommand, addLog]);

  const stopKeepAlive = useCallback(() => {
    if (keepAliveInterval.current) {
      clearInterval(keepAliveInterval.current);
      keepAliveInterval.current = null;
      writeCommand('S');
      addLog('Keep-alive stopped');
    }
  }, [writeCommand, addLog]);

  const disconnect = useCallback(async () => {
    if (!connectedDevice) return;

    try {
      addLog('Disconnecting...');
      await writeCommand('S'); // Stop before disconnect
      await BleClient.disconnect(connectedDevice.deviceId);
      setConnectedDevice(null);
      setState('idle');
      addLog('Disconnected');
    } catch (err) {
      addLog(`Disconnect error: ${err}`);
    }
  }, [connectedDevice, writeCommand, addLog]);

  const attemptReconnect = useCallback(async () => {
    if (!connectedDevice || state === 'reconnecting' || state === 'connected') return;

    const delays = [1000, 2000, 5000, 10000];
    const delay = delays[Math.min(reconnectAttempts.current, delays.length - 1)];

    setState('reconnecting');
    addLog(`Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts.current + 1})`);

    reconnectTimeout.current = setTimeout(async () => {
      try {
        await connect(connectedDevice);
        reconnectAttempts.current = 0;
      } catch {
        reconnectAttempts.current++;
        attemptReconnect();
      }
    }, delay);
  }, [connectedDevice, state, connect, addLog]);

  useEffect(() => {
    if (state === 'disconnected' && connectedDevice) {
      attemptReconnect();
    }

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [state, connectedDevice, attemptReconnect]);

  useEffect(() => {
    return () => {
      if (keepAliveInterval.current) {
        clearInterval(keepAliveInterval.current);
      }
    };
  }, []);

  return {
    state,
    devices,
    connectedDevice,
    lastCommand,
    rssi,
    error,
    logs,
    initialize,
    scanForDevices,
    connect,
    disconnect,
    writeCommand,
    startKeepAlive,
    stopKeepAlive,
    clearError,
    requestPermissions,
    setNotifyCallback,
    setNotifyRawCallback,
    setOnPhotoMeta,
    setOnPhotoChunk,
    setOnPhotoDone,
    setOnPhotoBegin,
    setOnPhotoEnd,
  };
};
