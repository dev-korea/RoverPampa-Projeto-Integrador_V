import { useState, useCallback, useEffect, useRef } from 'react';
import { BleClient, dataViewToText } from '@capacitor-community/bluetooth-le';

const NUS_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const NUS_RX_CHAR_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';
const NUS_TX_CHAR_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';

const STORAGE_KEY = 'roverpampa_last_dht';

export type DHTState = 'idle' | 'requesting' | 'received' | 'error' | 'telemetry-on';

export interface DHTReading {
  temp: number | null;
  hum: number | null;
  ok: boolean;
  timestamp: number;
}

export const useDHT11 = (deviceId: string | null) => {
  const [state, setState] = useState<DHTState>('idle');
  const [reading, setReading] = useState<DHTReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTelemetryActive, setIsTelemetryActive] = useState(false);

  const requestTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const notificationHandlerRef = useRef<((data: DataView) => void) | null>(null);

  // Load last reading from storage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as DHTReading;
        setReading(parsed);
      }
    } catch (err) {
      console.error('Failed to load DHT reading:', err);
    }
  }, []);

  // Save reading to storage
  const saveReading = useCallback((r: DHTReading) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
    } catch (err) {
      console.error('Failed to save DHT reading:', err);
    }
  }, []);

  // Parse DHT response: supports
  // - "DHT:T=26.3,H=48.0"
  // - "DHT:temp=26.3,hum=48.0,ok=1"
  const parseDHTLine = useCallback((line: string): DHTReading | null => {
    if (!line.startsWith('DHT:')) return null;
    // New short format
    const mShort = /^DHT:T=([^,]+),H=([^,]+)/.exec(line);
    if (mShort) {
      const temp = isNaN(parseFloat(mShort[1])) ? null : parseFloat(mShort[1]);
      const hum = isNaN(parseFloat(mShort[2])) ? null : parseFloat(mShort[2]);
      return { temp, hum, ok: true, timestamp: Date.now() };
    }
    // Legacy format
    const mLegacy = /temp=([^,]+),hum=([^,]+),ok=(\d)/.exec(line);
    if (mLegacy) {
      const temp = isNaN(parseFloat(mLegacy[1])) ? null : parseFloat(mLegacy[1]);
      const hum = isNaN(parseFloat(mLegacy[2])) ? null : parseFloat(mLegacy[2]);
      const ok = mLegacy[3] === '1';
      return { temp, hum, ok, timestamp: Date.now() };
    }
    return null;
  }, []);

  // Handle incoming notification
  const handleNotification = useCallback((value: DataView) => {
    const text = dataViewToText(value);
    console.log('[DHT11] Received:', text);
    
    const parsed = parseDHTLine(text);
    if (parsed) {
      setReading(parsed);
      saveReading(parsed);
      
      if (state === 'requesting') {
        setState('received');
        if (requestTimeoutRef.current) {
          clearTimeout(requestTimeoutRef.current);
          requestTimeoutRef.current = null;
        }
      }
      
      if (!parsed.ok) {
        setError('Sensor indisponível (ok=0)');
      } else {
        setError(null);
      }
    }
  }, [parseDHTLine, saveReading, state]);

  // Setup notification handler
  useEffect(() => {
    if (!deviceId) {
      setState('idle');
      setIsTelemetryActive(false);
      return;
    }

    notificationHandlerRef.current = handleNotification;
  }, [deviceId, handleNotification]);

  // Write command helper
  const writeCommand = useCallback(async (command: string) => {
    if (!deviceId) {
      throw new Error('Nenhum dispositivo conectado');
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(command);
      const dataView = new DataView(data.buffer);

      await BleClient.writeWithoutResponse(
        deviceId,
        NUS_SERVICE_UUID,
        NUS_RX_CHAR_UUID,
        dataView
      );
    } catch (err) {
      console.error('[DHT11] Write error:', err);
      throw err;
    }
  }, [deviceId]);

  // Start notifications if not already
  const ensureNotifications = useCallback(async () => {
    if (!deviceId) return;

    try {
      await BleClient.startNotifications(
        deviceId,
        NUS_SERVICE_UUID,
        NUS_TX_CHAR_UUID,
        (value) => {
          if (notificationHandlerRef.current) {
            notificationHandlerRef.current(value);
          }
        }
      );
    } catch (err) {
      // Notifications might already be active
      console.log('[DHT11] Notifications:', err);
    }
  }, [deviceId]);

  // Read once
  const readOnce = useCallback(async () => {
    if (!deviceId) {
      setError('Sem conexão BLE');
      return;
    }

    try {
      setState('requesting');
      setError(null);

      await ensureNotifications();
      await writeCommand('HUM?');

      // Set timeout for response
      requestTimeoutRef.current = setTimeout(() => {
        if (state === 'requesting') {
          setState('error');
          setError('Timeout: Nenhuma resposta do sensor em 3s');
        }
      }, 3000);

    } catch (err) {
      setState('error');
      setError(`Erro ao ler sensor: ${err}`);
    }
  }, [deviceId, ensureNotifications, writeCommand, state]);

  // Start telemetry
  const startTelemetry = useCallback(async () => {
    if (!deviceId) {
      setError('Sem conexão BLE');
      return;
    }

    try {
      setError(null);
      await ensureNotifications();
      setIsTelemetryActive(true);
      setState('telemetry-on');
    } catch (err) {
      setError(`Erro ao iniciar telemetria: ${err}`);
    }
  }, [deviceId, ensureNotifications]);

  // Stop telemetry
  const stopTelemetry = useCallback(async () => {
    if (!deviceId) return;

    try {
      setIsTelemetryActive(false);
      setState('idle');
    } catch (err) {
      console.error('[DHT11] Error stopping telemetry:', err);
    }
  }, [deviceId]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
    if (state === 'error') {
      setState('idle');
    }
  }, [state]);

  // Cleanup on unmount or disconnect
  useEffect(() => {
    return () => {
      if (requestTimeoutRef.current) {
        clearTimeout(requestTimeoutRef.current);
      }
    };
  }, []);

  // Auto-stop telemetry on disconnect
  useEffect(() => {
    if (!deviceId && isTelemetryActive) {
      setIsTelemetryActive(false);
      setState('idle');
    }
  }, [deviceId, isTelemetryActive]);

  return {
    state,
    reading,
    error,
    isTelemetryActive,
    readOnce,
    startTelemetry,
    stopTelemetry,
    clearError,
  };
};
