import { useState, useEffect } from 'react';
import { useBLE } from '@/hooks/useBLE';
import { usePhotoCapture } from '@/hooks/usePhotoCapture';
import { useDHT11 } from '@/hooks/useDHT11';
import { useMissions } from '@/hooks/useMissions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Square,
  Camera,
  Loader2,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
  Thermometer,
  Droplets,
  AlertCircle,
  FolderOpen,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
// import { toast } from 'sonner';

interface ManualMissionProps {
  bleService: ReturnType<typeof useBLE>;
}

const ManualMission = ({ bleService }: ManualMissionProps) => {
  const navigate = useNavigate();
  const [activeButton, setActiveButton] = useState<string | null>(null);
  const keepAliveInterval = 100;

  const {
    state,
    lastCommand,
    startKeepAlive,
    stopKeepAlive,
    connectedDevice,
    writeCommand,
    setNotifyCallback,
  } = bleService;

  const photoCapture = usePhotoCapture(connectedDevice?.deviceId || null);
  const { captureState, progress, error, currentPhoto, capturePhoto, cancelCapture, clearError } = photoCapture;

  const dht11 = useDHT11(connectedDevice?.deviceId || null);
  const { 
    state: dhtState, 
    reading: dhtReading, 
    error: dhtError, 
    isTelemetryActive,
    readOnce: readDHT,
    startTelemetry,
    stopTelemetry,
    clearError: clearDHTError 
  } = dht11;

  const { missions, activeMission, createMission, setActiveMission, finishMission } = useMissions();

  // Criar missão automaticamente ao entrar na página
  useEffect(() => {
    let mounted = true;
    const ensureMission = async () => {
      try {
        const now = new Date();
        const missionName = `Manual ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        const newMission = await createMission(missionName, 'Missão manual criada automaticamente');
        if (mounted && newMission) {
          await setActiveMission(newMission.id);
        }
      } catch (err) {
        console.warn('Falha ao criar missão manual automaticamente:', err);
      }
    };
    // Sempre cria uma nova missão ao acessar esta página
    ensureMission();
    return () => { mounted = false; };
  }, [createMission, setActiveMission]);

  // Removido: controle de servos e callbacks relacionados

  const handlePressIn = (command: 'F' | 'B' | 'L' | 'R', buttonId: string) => {
    if (state !== 'connected') return;
    setActiveButton(buttonId);
    startKeepAlive(command, keepAliveInterval);
    if (window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }
  };

  const handlePressOut = (buttonId: string) => {
    setActiveButton(null);
    stopKeepAlive();
    if (window.navigator.vibrate) {
      window.navigator.vibrate(30);
    }
  };

  const handleStop = () => {
    stopKeepAlive();
    if (window.navigator.vibrate) {
      window.navigator.vibrate(30);
    }
  };

  const handleCapture = async () => {
    if (!isConnected) return;
    await capturePhoto();
    if (window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }
  };

  const handleCancel = () => {
    cancelCapture();
  };

  const handleViewGallery = () => {
    if (activeMission) {
      navigate(`/gallery?mission=${activeMission.id}`);
    } else {
      navigate('/missions');
    }
  };

  // Removido: finalizar missão pela página manual. Finalização ocorre via página de Missões.

  const getStateLabel = () => {
    switch (captureState) {
      case 'idle': return 'Pronto';
      case 'requesting': return 'Solicitando foto...';
      case 'receiving': return 'Recebendo dados...';
      case 'saving': return 'Salvando...';
      case 'done': return 'Foto capturada!';
      case 'error': return 'Erro';
      default: return '';
    }
  };

  const getCommandLabel = (cmd: string) => {
    switch (cmd) {
      case 'F':
      case 'U':
        return 'Frente';
      case 'B':
      case 'D':
        return 'Trás';
      case 'L':
        return 'Esquerda';
      case 'R':
        return 'Direita';
      case 'S':
        return 'Parar';
      default:
        return 'Desconhecido';
    }
  };

  const isConnected = state === 'connected';
  const isCapturing = captureState === 'requesting' || captureState === 'receiving' || captureState === 'saving';
  const controlButtonClass = "w-20 h-20 rounded-xl transition-all touch-none select-none";
  const activeClass = "shadow-control-pressed scale-95 bg-accent";
  const inactiveClass = "shadow-control-glow bg-secondary hover:bg-secondary/80";
  const disabledClass = "opacity-50 cursor-not-allowed";

  // Criar missão automaticamente quando entrar na página pela primeira vez
  useEffect(() => {
    const initMission = async () => {
      if (!activeMission && isConnected) {
        try {
          const now = new Date();
          const missionName = `Manual ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
          const newMission = await createMission(missionName, 'Missão manual criada automaticamente');
          if (newMission) {
            await setActiveMission(newMission.id);
          }
        } catch (error) {
          console.error('Erro ao criar missão:', error);
        }
      }
    };
    initMission();
  }, [isConnected, activeMission, createMission, setActiveMission]); // Dependências corretas

  return (
    <div className="min-h-screen bg-background p-4 pt-6 pb-6">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold">Missão Manual</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Controle e captura de fotos
          </p>
        </div>

        {/* Connection Alert */}
        {!isConnected && (
          <Card className="p-4 bg-warning/10 border-warning">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-warning shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-warning">
                  Rover não conectado
                </p>
                <p className="text-xs text-warning/80 mt-0.5">
                  Clique em "Conectar" no topo para iniciar
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Active Mission Indicator */}
        {activeMission ? (
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-center gap-3">
              <FolderOpen className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">Missão Ativa</p>
                <p className="font-semibold text-primary truncate">
                  {activeMission.name}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/missions')}
              >
                Alterar
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-4 bg-muted/30 border-dashed">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">
                  Nenhuma missão ativa
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Fotos serão salvas sem missão associada
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/missions')}
              >
                Criar
              </Button>
            </div>
          </Card>
        )}

        {/* Command Status */}
        {isConnected && (
          <div className="flex items-center justify-center p-3 bg-card/30 backdrop-blur rounded-lg border border-border">
            <span className="text-sm text-muted-foreground mr-2">Último comando:</span>
            <span className="text-sm font-mono font-semibold text-primary">
              {lastCommand} - {getCommandLabel(lastCommand)}
            </span>
          </div>
        )}

        {/* D-Pad Controls */}
        <div className="flex flex-col items-center justify-center space-y-6 py-8">
          {/* Up Button */}
          <Button
            onPointerDown={() => handlePressIn('F', 'up')}
            onPointerUp={() => handlePressOut('up')}
            onPointerLeave={() => activeButton === 'up' && handlePressOut('up')}
            disabled={!isConnected}
            className={`${controlButtonClass} ${
              !isConnected ? disabledClass :
              activeButton === 'up' ? activeClass : inactiveClass
            }`}
          >
            <ArrowUp className="w-8 h-8" />
          </Button>

          {/* Left, Center (Stop), Right */}
          <div className="flex items-center gap-6">
            <Button
              onPointerDown={() => handlePressIn('L', 'left')}
              onPointerUp={() => handlePressOut('left')}
              onPointerLeave={() => activeButton === 'left' && handlePressOut('left')}
              disabled={!isConnected}
              className={`${controlButtonClass} ${
                !isConnected ? disabledClass :
                activeButton === 'left' ? activeClass : inactiveClass
              }`}
            >
              <ArrowLeft className="w-8 h-8" />
            </Button>

            <Button
              onClick={handleStop}
              disabled={!isConnected}
              className={`w-20 h-20 rounded-xl ${
                !isConnected ? `${disabledClass} bg-destructive` :
                'bg-destructive hover:bg-destructive/90'
              } shadow-control-glow`}
            >
              <Square className="w-8 h-8 fill-current" />
            </Button>

            <Button
              onPointerDown={() => handlePressIn('R', 'right')}
              onPointerUp={() => handlePressOut('right')}
              onPointerLeave={() => activeButton === 'right' && handlePressOut('right')}
              disabled={!isConnected}
              className={`${controlButtonClass} ${
                !isConnected ? disabledClass :
                activeButton === 'right' ? activeClass : inactiveClass
              }`}
            >
              <ArrowRight className="w-8 h-8" />
            </Button>
          </div>

          {/* Down Button */}
          <Button
            onPointerDown={() => handlePressIn('B', 'down')}
            onPointerUp={() => handlePressOut('down')}
            onPointerLeave={() => activeButton === 'down' && handlePressOut('down')}
            disabled={!isConnected}
            className={`${controlButtonClass} ${
              !isConnected ? disabledClass :
              activeButton === 'down' ? activeClass : inactiveClass
            }`}
          >
            <ArrowDown className="w-8 h-8" />
          </Button>
        </div>

        {/* Photo Capture Section */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Captura de Foto</h2>
          
          {/* Error Message */}
          {error && (
            <Card className="p-4 mb-4 bg-destructive/10 border-destructive">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-destructive text-sm font-medium">Erro</p>
                  <p className="text-destructive/80 text-xs mt-1">{error}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearError}
                  className="h-6 px-2"
                >
                  ✕
                </Button>
              </div>
            </Card>
          )}

          <div className="space-y-6">
            {/* Status */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
                {captureState === 'done' ? (
                  <CheckCircle2 className="w-10 h-10 text-success" />
                ) : isCapturing ? (
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                ) : (
                  <Camera className="w-10 h-10 text-primary" />
                )}
              </div>
              <p className="font-medium text-lg">{getStateLabel()}</p>
              {!isConnected && (
                <p className="text-xs text-muted-foreground mt-2">
                  Conecte ao ROVER PAMPA primeiro
                </p>
              )}
            </div>

            {/* Progress */}
            {captureState === 'receiving' && progress.total > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-mono font-semibold">
                    {progress.received} / {progress.total} ({progress.percentage}%)
                  </span>
                </div>
                <Progress value={progress.percentage} className="h-2" />
              </div>
            )}

            {/* Photo Preview */}
            {captureState === 'done' && currentPhoto && (
              <div className="space-y-3">
                <img
                  src={currentPhoto.dataUrl}
                  alt="Capturada"
                  className="w-full rounded-lg border border-border"
                />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Tamanho: {(currentPhoto.size / 1024).toFixed(1)} KB</p>
                  {currentPhoto.width && currentPhoto.height && (
                    <p>Dimensões: {currentPhoto.width} × {currentPhoto.height}</p>
                  )}
                  <p>Salva: {new Date(currentPhoto.createdAt).toLocaleString('pt-BR')}</p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              {captureState === 'done' ? (
                <>
                  <Button
                    onClick={handleCapture}
                    disabled={!isConnected}
                    className="flex-1 h-12"
                  >
                    <Camera className="w-5 h-5 mr-2" />
                    Capturar Outra
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleViewGallery}
                    className="flex-1 h-12"
                  >
                    <ImageIcon className="w-5 h-5 mr-2" />
                    Ver Galeria
                  </Button>
                </>
              ) : isCapturing ? (
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  className="flex-1 h-12"
                >
                  Cancelar
                </Button>
              ) : (
                <Button
                  onClick={handleCapture}
                  disabled={!isConnected}
                  className="flex-1 h-12 text-lg"
                >
                  <Camera className="w-6 h-6 mr-2" />
                  Tirar Foto (BLE)
                </Button>
              )}
            </div>
          </div>

        </Card>

        {/* DHT11 Environment Section */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Ambiente (DHT11)</h2>
          
          {/* DHT Error Message */}
          {dhtError && (
            <Card className="p-4 mb-4 bg-destructive/10 border-destructive">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-destructive text-sm font-medium">Erro</p>
                  <p className="text-destructive/80 text-xs mt-1">{dhtError}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDHTError}
                  className="h-6 px-2"
                >
                  ✕
                </Button>
              </div>
            </Card>
          )}

          {!isConnected ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Sem conexão BLE</p>
              <p className="text-xs text-muted-foreground mt-1">
                Conecte ao ROVER PAMPA primeiro
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Readings Display */}
              <div className="grid grid-cols-2 gap-4">
                {/* Temperature */}
                <Card className={`p-4 ${dhtReading && !dhtReading.ok ? 'bg-destructive/10 border-destructive' : 'bg-card/50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Thermometer className={`w-5 h-5 ${dhtReading && !dhtReading.ok ? 'text-destructive' : 'text-primary'}`} />
                    <span className="text-sm font-medium text-muted-foreground">Temperatura</span>
                  </div>
                  <div className="text-3xl font-bold">
                    {dhtReading && dhtReading.temp !== null ? (
                      <>{dhtReading.temp.toFixed(1)}<span className="text-xl text-muted-foreground">°C</span></>
                    ) : (
                      <span className="text-muted-foreground text-xl">--</span>
                    )}
                  </div>
                </Card>

                {/* Humidity */}
                <Card className={`p-4 ${dhtReading && !dhtReading.ok ? 'bg-destructive/10 border-destructive' : 'bg-card/50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Droplets className={`w-5 h-5 ${dhtReading && !dhtReading.ok ? 'text-destructive' : 'text-primary'}`} />
                    <span className="text-sm font-medium text-muted-foreground">Umidade</span>
                  </div>
                  <div className="text-3xl font-bold">
                    {dhtReading && dhtReading.hum !== null ? (
                      <>{dhtReading.hum.toFixed(1)}<span className="text-xl text-muted-foreground">%</span></>
                    ) : (
                      <span className="text-muted-foreground text-xl">--</span>
                    )}
                  </div>
                </Card>
              </div>

              {/* Status and Timestamp */}
              <div className="text-center space-y-1">
                {dhtReading ? (
                  <>
                    <div className="flex items-center justify-center gap-2">
                      {dhtReading.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-success" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive" />
                      )}
                      <span className={`text-sm font-medium ${dhtReading.ok ? 'text-success' : 'text-destructive'}`}>
                        {dhtReading.ok ? 'Sensor OK' : 'Sensor indisponível'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Última leitura: {new Date(dhtReading.timestamp).toLocaleTimeString('pt-BR')}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Aguardando leitura...</p>
                )}
              </div>

              {/* Controls */}
              <div className="space-y-4">
                {/* Read Now Button */}
                <Button
                  onClick={readDHT}
                  disabled={!isConnected || dhtState === 'requesting' || isTelemetryActive}
                  className="w-full h-12"
                >
                  {dhtState === 'requesting' ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Lendo sensor...
                    </>
                  ) : (
                    <>
                      <Thermometer className="w-5 h-5 mr-2" />
                      Ler Agora
                    </>
                  )}
                </Button>

                {/* Telemetry Toggle */}
                <div className="flex items-center justify-between p-4 bg-card/50 rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${isTelemetryActive ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
                    <div>
                      <p className="font-medium">Telemetria Automática</p>
                      <p className="text-xs text-muted-foreground">Atualizar a cada ~5s</p>
                    </div>
                  </div>
                  <Switch
                    checked={isTelemetryActive}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        startTelemetry();
                      } else {
                        stopTelemetry();
                      }
                    }}
                    disabled={!isConnected}
                  />
                </div>
              </div>

              {/* Info */}
              {isCapturing && (
                <Card className="p-3 bg-muted/50">
                  <p className="text-xs text-muted-foreground text-center">
                    Leitura pausada durante captura de foto
                  </p>
                </Card>
              )}
            </div>
          )}
        </Card>

        {/* Removido: seção Pan & Tilt (servos) */}

      </div>
    </div>
  );
};

export default ManualMission;
