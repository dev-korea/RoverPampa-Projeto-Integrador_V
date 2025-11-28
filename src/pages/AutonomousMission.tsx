import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBLE } from '@/hooks/useBLE';
import { useMissions } from '@/hooks/useMissions';
import { useDHT11 } from '@/hooks/useDHT11';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Pause,
  Square,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Bot,
  Image as ImageIcon,
  FolderOpen,
  Thermometer,
  Droplets,
} from 'lucide-react';
import { toast } from 'sonner';
import { dataViewToNumbers } from '@capacitor-community/bluetooth-le';

interface AutonomousMissionProps {
  bleService: ReturnType<typeof useBLE>;
}

type MissionState = 'idle' | 'starting' | 'running' | 'paused' | 'stopped';

const AutonomousMission = ({ bleService }: AutonomousMissionProps) => {
  const navigate = useNavigate();
  const { state: bleState, writeCommand, connectedDevice, stopKeepAlive } = bleService;
  const { missions, activeMission, createMission, setActiveMission, finishMission } = useMissions();
  const [missionState, setMissionState] = useState<MissionState>('idle');
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [photoReceiving, setPhotoReceiving] = useState(false);
  const [photoProgress, setPhotoProgress] = useState<{ received: number; total: number } | null>(null);
  const [feedPhotos, setFeedPhotos] = useState<Array<{ id: string; dataUrl: string; filename: string; createdAt: string }>>([]);
  const MAX_PHOTOS_PER_OBSTACLE = 1;
  const photoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [currentMissionId, setCurrentMissionId] = useState<string | null>(null);
  const [dhtPush, setDhtPush] = useState<{ temp: number | null; hum: number | null; ok: boolean; timestamp: number } | null>(null);

  const isConnected = bleState === 'connected';
  const [obstacleSessionId, setObstacleSessionId] = useState<string | null>(null);
  const [obstaclePhotoCount, setObstaclePhotoCount] = useState(0);
  const dht11 = useDHT11(connectedDevice?.deviceId || null);
  const { state: dhtState, reading: dhtReading, isTelemetryActive, startTelemetry, stopTelemetry } = dht11;

  const metaRef = useRef<{ size: number; chunks: number; width?: number; height?: number } | null>(null);
  const chunksRef = useRef<Uint8Array[]>([]);
  const currentPhotoSeqRef = useRef<number | null>(null);
  const photoDoneRef = useRef<boolean>(false);
  const bytesReceivedRef = useRef<number>(0);

  const parseMeta = (text: string) => {
    const match = text.match(/META:size=(\d+),chunks=(\d+)(?:,w=(\d+))?(?:,h=(\d+))?/);
    if (!match) return null;
    return {
      size: parseInt(match[1]),
      chunks: parseInt(match[2]),
      width: match[3] ? parseInt(match[3]) : undefined,
      height: match[4] ? parseInt(match[4]) : undefined,
    };
  };

  const decodeCH = (data: Uint8Array) => {
    if (data.length < 4 || data[0] !== 67 || data[1] !== 72) return null;
    const seq = (data[2] << 8) | data[3];
    const payload = data.slice(4);
    return { seq, payload };
  };

  const saveMissionPhoto = async (missionId: string | null, jpeg: Uint8Array, meta: any, extra: any) => {
    const now = new Date();
    const filename = `roverpampa_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.jpg`;
    const buffer = new Uint8Array(jpeg).buffer;
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });

    let dht: any = null;
    try {
      const last = localStorage.getItem('roverpampa_last_dht');
      if (last) dht = JSON.parse(last);
    } catch {}

    const photoData: any = {
      id: Date.now().toString(),
      filename,
      dataUrl,
      size: jpeg.length,
      width: meta?.width,
      height: meta?.height,
      createdAt: now.toISOString(),
      missionId: missionId || localStorage.getItem('active_mission_id'),
      telemetry: {
        temp: typeof dht?.temp === 'number' ? dht.temp : null,
        hum: typeof dht?.hum === 'number' ? dht.hum : null,
        ok: Boolean(dht?.ok),
        timestamp: typeof dht?.timestamp === 'number' ? dht.timestamp : Date.now(),
        obstacleSessionId: extra?.obstacleSessionId || null,
        seq: extra?.seq ?? null,
        source: 'auto',
        ts: Date.now(),
      },
    };

    const stored = localStorage.getItem('roverpampa_photos');
    const photos = stored ? JSON.parse(stored) : [];
    photos.unshift(photoData);
    localStorage.setItem('roverpampa_photos', JSON.stringify(photos));
    try { window.dispatchEvent(new CustomEvent('photos-updated', { detail: { missionId: photoData.missionId, photoId: photoData.id } })); } catch {}

    try {
      const telemetryListRaw = localStorage.getItem('roverpampa_telemetry');
      const telemetryList = telemetryListRaw ? JSON.parse(telemetryListRaw) : [];
      telemetryList.unshift({
        temp: typeof dht?.temp === 'number' ? dht.temp : null,
        hum: typeof dht?.hum === 'number' ? dht.hum : null,
        ok: Boolean(dht?.ok),
        timestamp: Date.now(),
        mission_id: missionId || localStorage.getItem('active_mission_id'),
        device_id: (bleService as any)?.connectedDevice?.deviceId || null,
        state: {
          obstacle_session_id: extra?.obstacleSessionId || null,
          seq: extra?.seq ?? null,
          source: 'auto',
          photo_filename: filename,
        },
      });
      localStorage.setItem('roverpampa_telemetry', JSON.stringify(telemetryList));
      try { window.dispatchEvent(new CustomEvent('telemetry-updated', { detail: { missionId: missionId || localStorage.getItem('active_mission_id') } })); } catch {}
    } catch {}
    return photoData;
  };

  useEffect(() => {
    // Se há missão ativa e é diferente da atual, usa ela
    if (activeMission && currentMissionId !== activeMission.id) {
      setCurrentMissionId(activeMission.id);
    }
  }, [activeMission, currentMissionId]);

  // Cria missão automaticamente ao entrar na página
  useEffect(() => {
    let mounted = true;
    const createAutoMission = async () => {
      try {
        const now = new Date();
        const missionName = `Autônoma ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        const newMission = await createMission(missionName, 'Missão autônoma criada automaticamente');
        if (mounted && newMission) {
          await setActiveMission(newMission.id);
          setCurrentMissionId(newMission.id);
        }
      } catch (err) {
        console.warn('Falha ao criar missão autônoma automaticamente:', err);
      }
    };
    // Sempre cria uma nova missão ao acessar esta página
    createAutoMission();
    return () => { mounted = false; };
  }, [createMission, setActiveMission]);

  useEffect(() => {
    const { setNotifyCallback, setNotifyRawCallback, setOnPhotoMeta, setOnPhotoChunk, setOnPhotoDone, setOnPhotoBegin, setOnPhotoEnd } = bleService as any;
    if (!isConnected || !setNotifyCallback || !setNotifyRawCallback || !setOnPhotoMeta || !setOnPhotoChunk || !setOnPhotoDone || !setOnPhotoBegin || !setOnPhotoEnd) return;

    const onText = (msg: string) => {
      if (msg.startsWith('MISSION:OBSTACLE')) {
        setObstacleSessionId((crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).slice(2));
        setObstaclePhotoCount(0);
        localStorage.setItem('roverpampa_last_obstacle_ts', Date.now().toString());
        if (missionState === 'running' && obstaclePhotoCount < MAX_PHOTOS_PER_OBSTACLE && !photoReceiving && currentPhotoSeqRef.current === null) {
          setTimeout(() => { try { writeCommand('PHOTO'); } catch {} }, 200);
        }
        return;
      }
      if (msg.startsWith('ACK:TURN')) {
        setObstacleSessionId(null);
        setObstaclePhotoCount(0);
        return;
      }
      if (msg.startsWith('MISSION:END') || msg.startsWith('MISSION:DONE') || msg.startsWith('MISSION:FINISHED') || msg.startsWith('MISSION:STOP')) {
        (async () => {
          try {
            try { stopKeepAlive(); } catch {}
            try { await writeCommand('MISSION:PAUSE'); } catch {}
            await writeCommand('S');
          } catch {}
          setMissionState('stopped');
          setObstacleSessionId(null);
          setObstaclePhotoCount(0);
          metaRef.current = null;
          chunksRef.current = [];
          if (currentMissionId) {
            try { await finishMission(currentMissionId); } catch {}
          }
          toast.success('Missão autônoma finalizada pelo rover');
          if (currentMissionId) {
            setTimeout(() => navigate(`/gallery?mission=${currentMissionId}`), 800);
          }
          setTimeout(() => { try { writeCommand('S'); } catch {} }, 200);
          setTimeout(() => {
            setMissionState('idle');
            setStartTime(null);
          }, 2000);
        })();
        return;
      }
      if (msg.startsWith('DHT:')) {
        const m = msg.match(/^DHT:T=([^,]+),H=([^,]+)/);
        if (m) {
          const temp = isNaN(parseFloat(m[1])) ? null : parseFloat(m[1]);
          const hum = isNaN(parseFloat(m[2])) ? null : parseFloat(m[2]);
          const reading = { temp, hum, ok: true, timestamp: Date.now() };
          localStorage.setItem('roverpampa_last_dht', JSON.stringify(reading));
          setDhtPush(reading);
        }
        return;
      }
      // Métrica de distância removida
      if (missionState !== 'running') return;
      if (!obstacleSessionId || obstaclePhotoCount >= MAX_PHOTOS_PER_OBSTACLE) return;
      if (msg.startsWith('PHOTO:BEGIN') || msg.startsWith('PHOTO:END') || msg.startsWith('META:') || msg === 'DONE') return;
    };

    const onBegin = (seq: number) => {
      if (missionState !== 'running') return;
      if (currentPhotoSeqRef.current !== null && currentPhotoSeqRef.current !== seq) return;
      currentPhotoSeqRef.current = seq;
      if (!obstacleSessionId) {
        setObstacleSessionId((crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).slice(2));
        setObstaclePhotoCount(0);
      }
      metaRef.current = null;
      chunksRef.current = [];
      bytesReceivedRef.current = 0;
      photoDoneRef.current = false;
      if (photoTimeoutRef.current) clearTimeout(photoTimeoutRef.current);
      photoTimeoutRef.current = setTimeout(() => {
        console.log('PHOTO TIMEOUT: aborting');
        metaRef.current = null;
        chunksRef.current = [];
        currentPhotoSeqRef.current = null;
        setPhotoReceiving(false);
        setPhotoProgress(null);
      }, 6000);
      setPhotoReceiving(true);
      setPhotoProgress(null);
      console.log('BEGIN', seq);
    };

    const onMeta = (meta: { size: number; chunks: number; width?: number; height?: number }) => {
      if (missionState !== 'running') return;
      if (currentPhotoSeqRef.current === null) return;
      metaRef.current = meta;
      chunksRef.current = new Array(meta.chunks);
      setPhotoReceiving(true);
      setPhotoProgress({ received: 0, total: meta.chunks });
      bytesReceivedRef.current = 0;
      if (photoTimeoutRef.current) clearTimeout(photoTimeoutRef.current);
      photoTimeoutRef.current = setTimeout(() => {
        console.log('PHOTO TIMEOUT after META: aborting');
        metaRef.current = null;
        chunksRef.current = [];
        currentPhotoSeqRef.current = null;
        setPhotoReceiving(false);
        setPhotoProgress(null);
      }, 6000);
      console.log('META', meta);
    };

    const onChunk = (seq: number, payload: Uint8Array) => {
      if (missionState !== 'running') return;
      const meta = metaRef.current;
      const chunks = chunksRef.current;
      if (!meta || !chunks || !Array.isArray(chunks)) return;
      let idx = seq;
      if (idx >= meta.chunks && seq - 1 >= 0 && seq - 1 < meta.chunks) idx = seq - 1;
      if (idx >= 0 && idx < meta.chunks && !chunks[idx]) {
        chunks[idx] = payload;
        const received = chunks.filter(c => !!c).length;
        setPhotoProgress({ received, total: meta.chunks });
        bytesReceivedRef.current += payload.length;
        console.log('CH', seq, payload.length);
        if (photoTimeoutRef.current) clearTimeout(photoTimeoutRef.current);
        photoTimeoutRef.current = setTimeout(() => {
          console.log('PHOTO TIMEOUT after CH: aborting');
          metaRef.current = null;
          chunksRef.current = [];
          currentPhotoSeqRef.current = null;
          setPhotoReceiving(false);
          setPhotoProgress(null);
        }, 6000);
      }
    };

    const onDone = () => {
      if (missionState !== 'running') return;
      photoDoneRef.current = true;
      console.log('DONE');
      const meta = metaRef.current;
      const chunks = chunksRef.current;
      if (!meta || !chunks || chunks.some(c => !c)) return;
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      if (meta.size && totalSize !== meta.size) return;
      const jpeg = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of chunks) {
        jpeg.set(chunk, offset);
        offset += chunk.length;
      }
      metaRef.current = null;
      chunksRef.current = [];
      currentPhotoSeqRef.current = null;
      if (photoTimeoutRef.current) { clearTimeout(photoTimeoutRef.current); photoTimeoutRef.current = null; }
      setPhotoReceiving(false);
      setPhotoProgress(null);
      saveMissionPhoto(currentMissionId, jpeg, meta, { obstacleSessionId, seq: obstaclePhotoCount + 1 }).then((p: any) => {
        setPhotoCount(prev => prev + 1);
        setObstaclePhotoCount(prev => prev + 1);
        setFeedPhotos(prev => [
          { id: p.id, dataUrl: p.dataUrl, filename: p.filename, createdAt: p.createdAt },
          ...prev
        ].slice(0, 12));
      });
    };

    const onEnd = (endSeq: number) => {
      if (missionState !== 'running') return;
      if (currentPhotoSeqRef.current === null || currentPhotoSeqRef.current !== endSeq) return;
      const meta = metaRef.current;
      const chunks = chunksRef.current;
      if (!meta || !chunks || chunks.some(c => !c)) { console.log('END missing chunks'); return; }
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      console.log('END', endSeq, 'bytes', totalSize, 'expected', meta.size);
      if (meta.size && totalSize !== meta.size) { console.log('Size mismatch'); }
      const jpeg = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of chunks) {
        jpeg.set(chunk, offset);
        offset += chunk.length;
      }
      metaRef.current = null;
      chunksRef.current = [];
      currentPhotoSeqRef.current = null;
      if (photoTimeoutRef.current) { clearTimeout(photoTimeoutRef.current); photoTimeoutRef.current = null; }
      setPhotoReceiving(false);
      setPhotoProgress(null);
      saveMissionPhoto(currentMissionId, jpeg, meta, { obstacleSessionId, seq: obstaclePhotoCount + 1 }).then((p: any) => {
        setPhotoCount(prev => prev + 1);
        setObstaclePhotoCount(prev => prev + 1);
        setFeedPhotos(prev => [
          { id: p.id, dataUrl: p.dataUrl, filename: p.filename, createdAt: p.createdAt },
          ...prev
        ].slice(0, 12));
      });
    };

    setNotifyCallback(onText);
    setOnPhotoBegin(onBegin);
    setOnPhotoMeta(onMeta);
    setOnPhotoChunk(onChunk);
    setOnPhotoDone(onDone);
    setOnPhotoEnd(onEnd);
    return () => {
      setNotifyCallback(null);
      setOnPhotoBegin(null);
      setOnPhotoMeta(null);
      setOnPhotoChunk(null);
      setOnPhotoDone(null);
      setOnPhotoEnd(null);
    };
  }, [bleService, isConnected, missionState, currentMissionId, obstacleSessionId, obstaclePhotoCount]);

  useEffect(() => {
    if (!isConnected) return;
  }, [isConnected]);

  useEffect(() => {
    const setNotifyCallback = (bleService as ReturnType<typeof useBLE>).setNotifyCallback;
    if (!setNotifyCallback) return;

    const onMsg = (msg: string) => {
      if (missionState !== 'running') return;
      if (msg.startsWith('META:') || msg.startsWith('PHOTO:')) return;
    };

    setNotifyCallback(onMsg);
    return () => setNotifyCallback(null);
  }, [bleService, missionState]);

  const handleStartMission = async () => {
    if (!isConnected) {
      toast.error('Conecte-se ao rover primeiro');
      return;
    }

    setMissionState('starting');
    try {
      // Envia o comando no formato que o ESP entende
      if (currentMissionId) {
        await writeCommand(`MISSION:START:AUTONOMOUS:${currentMissionId}`);
      } else {
        await writeCommand('MISSION:AUTO');
      }

      setMissionState('running');
      setStartTime(new Date());
      setPhotoCount(0);
      toast.success('Missão autônoma iniciada!');
    } catch (error) {
      console.error('Erro ao iniciar missão:', error);
      toast.error('Erro ao iniciar missão autônoma');
      setMissionState('idle');
    }
  };

  const handlePauseMission = async () => {
    try {
      try { stopKeepAlive(); } catch {}
      await writeCommand('MISSION:PAUSE');
      try { await writeCommand('S'); } catch {}
      setMissionState('paused');
      toast.info('Missão pausada');
    } catch (error) {
      console.error('Erro ao pausar:', error);
      toast.error('Erro ao pausar missão');
    }
  };

  const handleResumeMission = async () => {
    try {
      await writeCommand('RESUME');
      setMissionState('running');
      toast.success('Missão retomada');
    } catch (error) {
      console.error('Erro ao retomar:', error);
      toast.error('Erro ao retomar missão');
    }
  };

  const handleStopMission = async () => {
    try {
      try { stopKeepAlive(); } catch {}
      await writeCommand('MISSION:PAUSE');
      try { await writeCommand('MISSION:STOP'); } catch {}
      try { await writeCommand('S'); } catch {}
      setMissionState('stopped');
      toast.success('Missão finalizada!');

      // Após 2 segundos, voltar ao idle
      setTimeout(() => {
        setMissionState('idle');
        setStartTime(null);
      }, 2000);
    } catch (error) {
      console.error('Erro ao parar:', error);
      toast.error('Erro ao parar missão');
    }
  };

  useEffect(() => {
    if (!isConnected) return;
    if (missionState === 'paused' || missionState === 'stopped' || missionState === 'idle') {
      try { stopKeepAlive(); } catch {}
      try { writeCommand('S'); } catch {}
    }
  }, [missionState, isConnected, stopKeepAlive, writeCommand]);

  const handleViewMission = () => {
    if (currentMissionId) {
      navigate(`/gallery?mission=${currentMissionId}`);
    } else {
      navigate('/missions');
    }
  };

  const getElapsedTime = () => {
    if (!startTime) return '00:00:00';
    const now = new Date();
    const diff = now.getTime() - startTime.getTime();
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const getStateInfo = () => {
    switch (missionState) {
      case 'idle':
        return { label: 'Pronta para iniciar', color: 'text-muted-foreground', icon: Bot };
      case 'starting':
        return { label: 'Iniciando...', color: 'text-primary', icon: Loader2 };
      case 'running':
        return { label: 'Em execução', color: 'text-success', icon: CheckCircle2 };
      case 'paused':
        return { label: 'Pausada', color: 'text-warning', icon: Pause };
      case 'stopped':
        return { label: 'Finalizada', color: 'text-muted-foreground', icon: CheckCircle2 };
    }
  };

  const stateInfo = getStateInfo();
  const StateIcon = stateInfo.icon;

  const isDbgHelpful = Boolean(connectedDevice); // placeholder se quiser exibir logs depois

  return (
    <div className="min-h-screen bg-background p-4 pt-6 pb-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Missão Autônoma</h1>
            <p className="text-sm text-muted-foreground">
              Exploração automática do rover
            </p>
          </div>
        </div>

        {/* Connection Status */}
        {!isConnected && (
          <Card className="p-4 bg-destructive/10 border-destructive">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">
                  Rover não conectado
                </p>
                <p className="text-xs text-destructive/80 mt-1">
                  Conecte-se ao rover via Bluetooth para iniciar a missão
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Mission Status */}
        <Card className="p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className={`p-4 rounded-xl bg-background border-2`}>
              <StateIcon
                className={`w-8 h-8 ${stateInfo.color} ${missionState === 'starting' ? 'animate-spin' : ''}`}
              />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold">Status da Missão</h2>
                <Badge variant={missionState === 'running' ? 'default' : 'secondary'}>
                  {stateInfo.label}
                </Badge>
                {missionState === 'running' && photoReceiving && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Capturando fotos…
                  </Badge>
                )}
              </div>
              {currentMissionId && activeMission && (
                <p className="text-sm text-muted-foreground">
                  {activeMission.name}
                </p>
              )}
            </div>
          </div>

          {/* Mission Stats */}
        {(missionState === 'running' || missionState === 'paused') && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Card className="p-4 bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Tempo Decorrido</p>
              <p className="text-2xl font-bold font-mono">{getElapsedTime()}</p>
            </Card>
            <Card className="p-4 bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Fotos Capturadas</p>
              <p className="text-2xl font-bold">{photoCount}</p>
            </Card>
            <Card className={`p-4 ${(dhtPush && !dhtPush.ok) || (dhtReading && !dhtReading?.ok) ? 'bg-destructive/10 border-destructive' : 'bg-muted/30'} col-span-2`}>
              <div className="grid grid-cols-2 gap-4 items-center">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Thermometer className={`w-4 h-4 ${(dhtPush && !dhtPush.ok) || (dhtReading && !dhtReading?.ok) ? 'text-destructive' : 'text-primary'}`} />
                    <span className="text-xs text-muted-foreground">Temp</span>
                  </div>
                  <div className="text-xl font-bold">
                    {(dhtPush?.temp ?? dhtReading?.temp) !== undefined && (dhtPush?.temp ?? dhtReading?.temp) !== null ? (
                      <>{((dhtPush?.temp ?? dhtReading?.temp) as number).toFixed(1)}<span className="text-sm text-muted-foreground">°C</span></>
                    ) : (
                      <span className="text-muted-foreground text-sm">--</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Droplets className={`w-4 h-4 ${(dhtPush && !dhtPush.ok) || (dhtReading && !dhtReading?.ok) ? 'text-destructive' : 'text-primary'}`} />
                    <span className="text-xs text-muted-foreground">Umid</span>
                  </div>
                  <div className="text-xl font-bold">
                    {(dhtPush?.hum ?? dhtReading?.hum) !== undefined && (dhtPush?.hum ?? dhtReading?.hum) !== null ? (
                      <>{((dhtPush?.hum ?? dhtReading?.hum) as number).toFixed(1)}<span className="text-sm text-muted-foreground">%</span></>
                    ) : (
                      <span className="text-muted-foreground text-sm">--</span>
                    )}
                  </div>
                </div>
                {/* Distância removida */}
              </div>
              {(dhtPush || dhtReading) && (
                <p className="text-xs text-muted-foreground mt-2">Última: {new Date((dhtPush?.timestamp ?? dhtReading?.timestamp) as number).toLocaleTimeString('pt-BR')}</p>
              )}
            </Card>
            {photoReceiving && photoProgress && (
              <Card className="p-4 bg-muted/30 col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Recebendo foto</p>
                <p className="text-sm font-mono">Chunks: {photoProgress.received}/{photoProgress.total}</p>
              </Card>
            )}
          </div>
        )}

        {(missionState === 'running' || missionState === 'paused') && feedPhotos.length > 0 && (
          <Card className="p-4">
            <h3 className="font-bold mb-3">Feed de Fotos</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {feedPhotos.map(fp => (
                <div key={fp.id} className="aspect-square overflow-hidden rounded border">
                  <img src={fp.dataUrl} alt={fp.filename} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </Card>
        )}

          {/* Controls */}
          <div className="flex gap-3 flex-wrap">
            {missionState === 'idle' && (
              <Button
                onClick={handleStartMission}
                disabled={!isConnected}
                className="flex-1 h-14 text-lg w-full sm:w-auto"
              >
                <Play className="w-6 h-6 mr-2" />
                Iniciar Missão Autônoma
              </Button>
            )}

            {missionState === 'starting' && (
              <Button disabled className="flex-1 h-14 w-full sm:w-auto">
                <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                Iniciando...
              </Button>
            )}

            {missionState === 'running' && (
              <>
                <Button
                  onClick={handlePauseMission}
                  variant="outline"
                  className="flex-1 h-14 w-full sm:w-auto"
                >
                  <Pause className="w-5 h-5 mr-2" />
                  Pausar
                </Button>
                <Button
                  onClick={handleStopMission}
                  variant="destructive"
                  className="flex-1 h-14 w-full sm:w-auto"
                >
                  <Square className="w-5 h-5 mr-2" />
                  Finalizar
                </Button>
              </>
            )}

            {missionState === 'paused' && (
              <>
                <Button
                  onClick={handleResumeMission}
                  className="flex-1 h-14 w-full sm:w-auto"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Retomar
                </Button>
                <Button
                  onClick={handleStopMission}
                  variant="destructive"
                  className="flex-1 h-14 w-full sm:w-auto"
                >
                  <Square className="w-5 h-5 mr-2" />
                  Finalizar
                </Button>
              </>
            )}

            {missionState === 'stopped' && (
              <>
                <Button
                  onClick={handleStartMission}
                  disabled={!isConnected}
                  className="flex-1 h-14 w-full sm:w-auto"
                >
                  <Play className="w-6 h-6 mr-2" />
                  Nova Missão
                </Button>
                <Button
                  onClick={handleViewMission}
                  variant="outline"
                  className="flex-1 h-14 w-full sm:w-auto"
                >
                  <ImageIcon className="w-5 h-5 mr-2" />
                  Ver Fotos
                </Button>
              </>
            )}
          </div>
        </Card>

        {/* Mission Info */}
        <Card className="p-6">
          <h3 className="font-bold mb-3">Como funciona?</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              <span>O rover irá explorar automaticamente o ambiente</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              <span>Fotos serão capturadas ao encontrar obstáculos</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              <span>Uma nova pasta será criada automaticamente para esta missão</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary">•</span>
              <span>Você pode pausar e retomar a missão a qualquer momento</span>
            </li>
          </ul>
        </Card>

        {/* View Gallery */}
        {currentMissionId && (
          <Button
            variant="outline"
            className="w-full"
            onClick={handleViewMission}
          >
            <FolderOpen className="w-4 h-4 mr-2" />
            Ver Pasta da Missão
          </Button>
        )}
      </div>
    </div>
  );
};

export default AutonomousMission;
