import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ArrowLeft, Trash2, X, Loader2, RefreshCw, FolderOpen } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGallery, GalleryPhoto } from '@/hooks/useGallery';
import { useMissions } from '@/hooks/useMissions';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const Gallery = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const missionId = searchParams.get('mission');
  
  const { photos, loading, error, loadPhotos, deletePhoto, movePhotoToMission } = useGallery(missionId);
  const { missions } = useMissions();
  const [selectedPhoto, setSelectedPhoto] = useState<GalleryPhoto | null>(null);
  const [selectedTelemetry, setSelectedTelemetry] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [moveTargetMissionId, setMoveTargetMissionId] = useState<string | null>(null);

  const currentMission = missions.find(m => m.id === missionId);

  useEffect(() => {
    loadPhotos();
  }, [missionId]);

  useEffect(() => {
    const loadTelemetry = async () => {
      if (!selectedPhoto) {
        setSelectedTelemetry(null);
        return;
      }
      if (selectedPhoto.isLocal && (selectedPhoto as any).telemetry) {
        setSelectedTelemetry((selectedPhoto as any).telemetry);
        return;
      }
      if (!selectedPhoto.isLocal && selectedPhoto.file_path) {
        try {
          const telemetryPath = selectedPhoto.file_path.replace(/\.jpg$/i, '.telemetry.json');
          const { data, error } = await supabase.storage.from('photos').download(telemetryPath);
          if (error || !data) {
            setSelectedTelemetry(null);
            return;
          }
          const text = await data.text();
          const json = JSON.parse(text);
          setSelectedTelemetry(json);
        } catch {
          setSelectedTelemetry(null);
        }
      }
    };
    loadTelemetry();
  }, [selectedPhoto]);

  const handleDelete = async (photo: GalleryPhoto) => {
    if (deleting) return;
    
    setDeleting(true);
    try {
      await deletePhoto(photo.id, photo.file_path, photo.isLocal);
      toast.success('Foto deletada com sucesso');
      if (selectedPhoto?.id === photo.id) {
        setSelectedPhoto(null);
      }
    } catch (err) {
      toast.error('Erro ao deletar foto');
      console.error('Erro ao deletar:', err);
    } finally {
      setDeleting(false);
    }
  };


  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-background p-4 pt-6 pb-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(missionId ? '/missions' : '/')}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">
                {currentMission ? currentMission.name : 'Todas as Fotos'}
              </h1>
              {currentMission && currentMission.description && (
                <p className="text-sm text-muted-foreground">
                  {currentMission.description}
                </p>
              )}
              {!currentMission && (
                <p className="text-sm text-muted-foreground">
                  Fotos de todas as missões
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!missionId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/missions')}
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                Missões
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={loadPhotos}
              disabled={loading}
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <p className="text-sm text-muted-foreground">
              {photos.length} {photos.length === 1 ? 'foto' : 'fotos'}
            </p>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <Card className="p-12 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando fotos...</p>
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Card className="p-12 text-center bg-destructive/10">
            <X className="w-12 h-12 text-destructive mx-auto mb-4" />
            <p className="font-medium text-destructive mb-2">Erro ao carregar fotos</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button onClick={loadPhotos} variant="outline">
              Tentar novamente
            </Button>
          </Card>
        )}

        {/* Empty State */}
        {!loading && !error && photos.length === 0 && (
          <Card className="p-12 text-center">
            <div className="space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted">
                <X className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Nenhuma foto ainda</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Capture fotos e sincronize para vê-las aqui
                </p>
              </div>
              <Button onClick={() => navigate('/')}>
                Ir para Missão Manual
              </Button>
            </div>
          </Card>
        )}

        {/* Photo Grid */}
        {!loading && !error && photos.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {photos.map((photo) => (
              <Card
                key={photo.id}
                className="overflow-hidden cursor-pointer hover:shadow-control-glow transition-all group"
                onClick={() => setSelectedPhoto(photo)}
              >
                <div className="aspect-square relative">
                  <img
                    src={photo.isLocal ? (photo.dataUrl || photo.publicUrl) : photo.publicUrl}
                    alt={photo.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(photo);
                      }}
                      disabled={deleting}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="p-2 space-y-1">
                  <p className="text-xs font-mono truncate">{photo.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(photo.capture_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(photo.file_size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Photo Viewer Dialog */}
        <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
          <DialogContent className="max-w-4xl p-0">
            {selectedPhoto && (
              <div className="relative">
                <img
                  src={selectedPhoto.isLocal ? (selectedPhoto.dataUrl || selectedPhoto.publicUrl) : selectedPhoto.publicUrl}
                  alt={selectedPhoto.filename}
                  className="w-full h-auto max-h-[80vh] object-contain"
                />
                <div className="p-4 space-y-2 border-t border-border">
                  <p className="font-medium">{selectedPhoto.filename}</p>
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>Tamanho: {(selectedPhoto.file_size / 1024).toFixed(1)} KB</span>
                    <span>Data: {formatDate(selectedPhoto.capture_at)}</span>
                  </div>
                  {selectedTelemetry && (
                    <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground pt-2">
                      <div>
                        <p className="font-medium">Temperatura</p>
                        <p className="text-sm">{selectedTelemetry.temp ?? '--'} °C</p>
                      </div>
                      <div>
                        <p className="font-medium">Umidade</p>
                        <p className="text-sm">{selectedTelemetry.hum ?? '--'} %</p>
                      </div>
                      <div>
                        <p className="font-medium">Distância</p>
                        <p className="text-sm">{selectedTelemetry.dist_cm ?? '--'} cm</p>
                      </div>
                      <div className="col-span-3 grid grid-cols-3 gap-3">
                        <div>
                          <p className="font-medium">Sessão</p>
                          <p className="text-xs break-all">{selectedTelemetry.obstacle_session_id ?? '-'}</p>
                        </div>
                        <div>
                          <p className="font-medium">Seq</p>
                          <p className="text-xs">{selectedTelemetry.seq ?? '-'}</p>
                        </div>
                        <div>
                          <p className="font-medium">Fonte</p>
                          <p className="text-xs">{selectedTelemetry.source ?? '-'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Ações para foto local */}
                  {selectedPhoto.isLocal && (
                    <div className="flex items-center gap-2 pt-2">
                      <select
                        className="border rounded px-2 py-1 text-sm"
                        value={moveTargetMissionId || ''}
                        onChange={(e) => setMoveTargetMissionId(e.target.value || null)}
                      >
                        <option value="">Sem missão</option>
                        {missions.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                      <Button variant="outline" size="sm" onClick={async () => {
                        if (!selectedPhoto) return;
                        await movePhotoToMission(selectedPhoto.id, moveTargetMissionId);
                        toast.success('Foto movida para missão');
                        setSelectedPhoto(prev => prev ? { ...prev, mission_id: moveTargetMissionId } : prev);
                      }}>
                        Mover para missão
                      </Button>
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => selectedPhoto && handleDelete(selectedPhoto)}
                      disabled={deleting}
                      className="w-full"
                    >
                      {deleting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 mr-2" />
                      )}
                      Excluir
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
