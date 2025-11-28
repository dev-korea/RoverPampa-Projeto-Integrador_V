import { useState, useEffect, useCallback, useRef } from 'react';

interface ServoState {
  pan: number;
  tilt: number;
  lastCommand: string;
  status: 'idle' | 'sending' | 'success' | 'error';
  error: string | null;
}

interface UseServoControlProps {
  writeCommand: (cmd: string) => Promise<void>;
  isConnected: boolean;
}

const STORAGE_KEY = 'roverpampa_servo_angles';
const DEBOUNCE_MS = 120;
const MAX_COMMANDS_PER_SECOND = 10;
const ECHO_TIMEOUT_MS = 500;

export function useServoControl({ writeCommand, isConnected }: UseServoControlProps) {
  const [state, setState] = useState<ServoState>({
    pan: 90,
    tilt: 90,
    lastCommand: '',
    status: 'idle',
    error: null,
  });

  const debounceTimerRef = useRef<NodeJS.Timeout>();
  const lastCommandTimeRef = useRef<number>(0);
  const echoTimerRef = useRef<NodeJS.Timeout>();

  // Carregar ângulos salvos
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { pan, tilt } = JSON.parse(saved);
        setState(prev => ({ ...prev, pan, tilt }));
      } catch (e) {
        console.error('Erro ao carregar ângulos salvos:', e);
      }
    }
  }, []);

  // Salvar ângulos
  const saveAngles = useCallback((pan: number, tilt: number) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pan, tilt }));
  }, []);

  const clamp = (value: number, min = 0, max = 180) => {
    return Math.max(min, Math.min(max, Math.round(value)));
  };

  const sendCommand = useCallback(async (command: string) => {
    if (!isConnected) {
      setState(prev => ({ ...prev, error: 'Não conectado', status: 'error' }));
      return;
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastCommand = now - lastCommandTimeRef.current;
    if (timeSinceLastCommand < 1000 / MAX_COMMANDS_PER_SECOND) {
      return;
    }
    lastCommandTimeRef.current = now;

    setState(prev => ({ ...prev, status: 'sending', lastCommand: command, error: null }));

    // Configurar timeout para echo
    if (echoTimerRef.current) {
      clearTimeout(echoTimerRef.current);
    }
    echoTimerRef.current = setTimeout(() => {
      setState(prev => ({ 
        ...prev, 
        status: 'idle',
        error: 'Comando enviado (sem eco)'
      }));
    }, ECHO_TIMEOUT_MS);

    try {
      await writeCommand(command);
    } catch (error) {
      clearTimeout(echoTimerRef.current);
      setState(prev => ({ 
        ...prev, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Erro ao enviar comando'
      }));
    }
  }, [isConnected, writeCommand]);

  const setPan = useCallback((angle: number, immediate = false) => {
    const clampedAngle = clamp(angle);
    setState(prev => ({ ...prev, pan: clampedAngle }));

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (immediate) {
      sendCommand(`SV1:${clampedAngle}`);
      saveAngles(clampedAngle, state.tilt);
    } else {
      debounceTimerRef.current = setTimeout(() => {
        sendCommand(`SV1:${clampedAngle}`);
        saveAngles(clampedAngle, state.tilt);
      }, DEBOUNCE_MS);
    }
  }, [sendCommand, saveAngles, state.tilt]);

  const setTilt = useCallback((angle: number, immediate = false) => {
    const clampedAngle = clamp(angle);
    setState(prev => ({ ...prev, tilt: clampedAngle }));

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (immediate) {
      sendCommand(`SV2:${clampedAngle}`);
      saveAngles(state.pan, clampedAngle);
    } else {
      debounceTimerRef.current = setTimeout(() => {
        sendCommand(`SV2:${clampedAngle}`);
        saveAngles(state.pan, clampedAngle);
      }, DEBOUNCE_MS);
    }
  }, [sendCommand, saveAngles, state.pan]);

  const reset = useCallback(async () => {
    setState(prev => ({ ...prev, pan: 90, tilt: 90 }));
    await sendCommand('SV1:90');
    await sendCommand('SV2:90');
    saveAngles(90, 90);
  }, [sendCommand, saveAngles]);

  const handleOkResponse = useCallback(() => {
    if (echoTimerRef.current) {
      clearTimeout(echoTimerRef.current);
    }
    setState(prev => ({ ...prev, status: 'success', error: null }));
    setTimeout(() => {
      setState(prev => ({ ...prev, status: 'idle' }));
    }, 1000);
  }, []);

  const handleErrorResponse = useCallback((errorMsg: string) => {
    if (echoTimerRef.current) {
      clearTimeout(echoTimerRef.current);
    }
    setState(prev => ({ ...prev, status: 'error', error: errorMsg }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null, status: 'idle' }));
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (echoTimerRef.current) {
        clearTimeout(echoTimerRef.current);
      }
    };
  }, []);

  return {
    pan: state.pan,
    tilt: state.tilt,
    lastCommand: state.lastCommand,
    status: state.status,
    error: state.error,
    setPan,
    setTilt,
    reset,
    handleOkResponse,
    handleErrorResponse,
    clearError,
  };
}
