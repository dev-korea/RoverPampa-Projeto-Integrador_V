import { useState, useCallback, useRef } from 'react';
import { BleClient, dataViewToText, dataViewToNumbers } from '@capacitor-community/bluetooth-le';

const NUS_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const NUS_RX_CHAR_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';
const NUS_TX_CHAR_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';

export type CaptureState = 'idle' | 'requesting' | 'receiving' | 'saving' | 'done' | 'error';

interface PhotoMeta {
  size: number;
  chunks: number;
  width?: number;
  height?: number;
}

interface CaptureProgress {
  received: number;
  total: number;
  percentage: number;
}

export interface PhotoData {
  id: string;
  filename: string;
  dataUrl: string;
  size: number;
  width?: number;
  height?: number;
  createdAt: string;
  missionId?: string | null;
  telemetry?: {
    temp: number | null;
    hum: number | null;
    ok: boolean;
    timestamp: number;
  } | null;
}

export const usePhotoCapture = (deviceId: string | null) => {
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [progress, setProgress] = useState<CaptureProgress>({ received: 0, total: 0, percentage: 0 });
  const [error, setError] = useState<string | null>(null);
  const [currentPhoto, setCurrentPhoto] = useState<PhotoData | null>(null);

  const metaRef = useRef<PhotoMeta | null>(null);
  const chunksRef = useRef<Uint8Array[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const notificationHandlerRef = useRef<((data: DataView) => void) | null>(null);

  const clearState = useCallback(() => {
    metaRef.current = null;
    chunksRef.current = [];
    setProgress({ received: 0, total: 0, percentage: 0 });
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const parseMeta = useCallback((text: string): PhotoMeta | null => {
    try {
      // META:size=12345,chunks=67,w=640,h=480
      const match = text.match(/META:size=(\d+),chunks=(\d+)(?:,w=(\d+))?(?:,h=(\d+))?/);
      if (!match) return null;
      return {
        size: parseInt(match[1]),
        chunks: parseInt(match[2]),
        width: match[3] ? parseInt(match[3]) : undefined,
        height: match[4] ? parseInt(match[4]) : undefined,
      };
    } catch {
      return null;
    }
  }, []);

  const decodeCH = useCallback((data: Uint8Array): { seq: number; payload: Uint8Array } | null => {
    // Format: ['C','H', seq_hi, seq_lo, payload...]
    if (data.length < 4 || data[0] !== 67 || data[1] !== 72) return null; // 'C'=67, 'H'=72
    const seq = (data[2] << 8) | data[3];
    const payload = data.slice(4);
    return { seq, payload };
  }, []);

  const saveToGallery = useCallback(async (jpegData: Uint8Array, meta: PhotoMeta): Promise<PhotoData> => {
    const now = new Date();
    const filename = `roverpampa_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.jpg`;
    
    // Convert to base64 data URL
    const buffer = new Uint8Array(jpegData).buffer;
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });

    // Get active mission ID from localStorage
    const activeMissionId = localStorage.getItem('active_mission_id');

    let telemetry: PhotoData['telemetry'] = null;
    try {
      const last = localStorage.getItem('roverpampa_last_dht');
      if (last) {
        const parsed = JSON.parse(last);
        telemetry = {
          temp: typeof parsed.temp === 'number' ? parsed.temp : null,
          hum: typeof parsed.hum === 'number' ? parsed.hum : null,
          ok: Boolean(parsed.ok),
          timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now(),
        };
      }
    } catch {}

    const photoData: PhotoData = {
      id: Date.now().toString(),
      filename,
      dataUrl,
      size: jpegData.length,
      width: meta.width,
      height: meta.height,
      createdAt: now.toISOString(),
      missionId: activeMissionId,
      telemetry,
    };

    // Save to localStorage
    const stored = localStorage.getItem('roverpampa_photos');
    const photos: PhotoData[] = stored ? JSON.parse(stored) : [];
    photos.unshift(photoData); // Add to beginning
    localStorage.setItem('roverpampa_photos', JSON.stringify(photos));

    return photoData;
  }, []);

  const capturePhoto = useCallback(async () => {
    if (!deviceId) {
      setError('No device connected');
      return;
    }

    try {
      setCaptureState('requesting');
      setError(null);
      clearState();

      // Setup notification handler
      const handleNotification = async (dataView: DataView) => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // Reset timeout (5 seconds)
        timeoutRef.current = setTimeout(() => {
          setError('Timeout: no data received');
          setCaptureState('error');
          clearState();
        }, 5000);

        // Try to parse as text first
        try {
          const text = dataViewToText(dataView);
          
          if (text.startsWith('META:')) {
            const meta = parseMeta(text);
            if (!meta) {
              setError('Invalid META format');
              setCaptureState('error');
              return;
            }
            metaRef.current = meta;
            chunksRef.current = new Array(meta.chunks);
            setProgress({ received: 0, total: meta.chunks, percentage: 0 });
            setCaptureState('receiving');
            console.log('META received:', meta);
            return;
          }

          if (text.startsWith('DONE')) {
            if (!metaRef.current || chunksRef.current.some(c => !c)) {
              setError('Image incomplete');
              setCaptureState('error');
              clearState();
              return;
            }

            setCaptureState('saving');
            
            // Concatenate all chunks
            const totalSize = chunksRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
            const jpeg = new Uint8Array(totalSize);
            let offset = 0;
            for (const chunk of chunksRef.current) {
              jpeg.set(chunk, offset);
              offset += chunk.length;
            }

            const photoData = await saveToGallery(jpeg, metaRef.current);
            setCurrentPhoto(photoData);
            setCaptureState('done');
            clearState();
            console.log('Photo saved:', photoData.filename);
            return;
          }

          if (text.startsWith('BUSY')) {
            setError('Device busy. Try again.');
            setCaptureState('error');
            clearState();
            return;
          }
        } catch {
          // Not text, try binary
        }

        // Try to parse as binary chunk
        const bytes = dataViewToNumbers(dataView);
        const decoded = decodeCH(new Uint8Array(bytes));
        if (decoded && metaRef.current) {
          if (decoded.seq < metaRef.current.chunks && !chunksRef.current[decoded.seq]) {
            chunksRef.current[decoded.seq] = decoded.payload;
            const received = chunksRef.current.filter(c => c).length;
            const percentage = Math.round((received / metaRef.current.chunks) * 100);
            setProgress({ received, total: metaRef.current.chunks, percentage });
            console.log(`Chunk ${decoded.seq} received (${received}/${metaRef.current.chunks})`);
          }
        }
      };

      notificationHandlerRef.current = handleNotification;

      // Enable notifications
      await BleClient.startNotifications(
        deviceId,
        NUS_SERVICE_UUID,
        NUS_TX_CHAR_UUID,
        handleNotification
      );

      // Send PHOTO command
      const photoCmd = new TextEncoder().encode('PHOTO');
      const dataView = new DataView(photoCmd.buffer);
      await BleClient.writeWithoutResponse(
        deviceId,
        NUS_SERVICE_UUID,
        NUS_RX_CHAR_UUID,
        dataView
      );

      console.log('PHOTO command sent');

      // Initial timeout
      timeoutRef.current = setTimeout(() => {
        setError('Timeout: no response from device');
        setCaptureState('error');
        clearState();
      }, 5000);

    } catch (err) {
      console.error('Capture error:', err);
      setError(`Capture failed: ${err}`);
      setCaptureState('error');
      clearState();
    }
  }, [deviceId, parseMeta, decodeCH, saveToGallery, clearState]);

  const cancelCapture = useCallback(() => {
    clearState();
    setCaptureState('idle');
    setError(null);
  }, [clearState]);

  return {
    captureState,
    progress,
    error,
    currentPhoto,
    capturePhoto,
    cancelCapture,
    clearError: () => setError(null),
  };
};
