import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMissions } from '@/hooks/useMissions';
import { useSync } from '@/hooks/useSync';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Plus, FolderOpen, Trash2, CheckCircle2, Loader2, ImageIcon, CloudUpload, Cloud, Database, Camera } from 'lucide-react';
import { toast } from 'sonner';

const Missions = () => {
  const navigate = useNavigate();
  const { missions, activeMission, loading, createMission, setActiveMission, deleteMission, loadMissions } = useMissions();
  const { syncState, syncResult, error: syncError, sync, clearError: clearSyncError } = useSync();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newMissionName, setNewMissionName] = useState('');
  const [newMissionDescription, setNewMissionDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [unsyncedPhotosCount, setUnsyncedPhotosCount] = useState(0);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});

  // Verificar fotos não sincronizadas
  useEffect(() => {
    const checkUnsyncedPhotos = () => {
      const stored = localStorage.getItem('roverpampa_photos');
      if (stored) {
        const photos = JSON.parse(stored);
        const unsynced = photos.filter((photo: any) => !photo.synced);
        setUnsyncedPhotosCount(unsynced.length);
      }
    };
    
    checkUnsyncedPhotos();
    // Verificar a cada 5 segundos
    const interval = setInterval(checkUnsyncedPhotos, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('roverpampa_photos');
    const localPhotos = stored ? JSON.parse(stored) : [];
    const counts: Record<string, number> = {};
    for (const p of localPhotos) {
      const mid = p.missionId || 'nomission';
      counts[mid] = (counts[mid] || 0) + 1;
    }
    setPhotoCounts(counts);
  }, [missions]);

  useEffect(() => {
    const onUpdated = () => {
      const stored = localStorage.getItem('roverpampa_photos');
      const localPhotos = stored ? JSON.parse(stored) : [];
      const counts: Record<string, number> = {};
      for (const p of localPhotos) {
        const mid = p.missionId || 'nomission';
        counts[mid] = (counts[mid] || 0) + 1;
      }
      setPhotoCounts(counts);
    };
    window.addEventListener('photos-updated', onUpdated);
    return () => window.removeEventListener('photos-updated', onUpdated);
  }, []);

  const handleSync = async () => {
    if (syncState === 'syncing') return;
    await sync();
    if (syncError) {
      toast.error('Erro na sincronização', { description: String(syncError) });
    }
    if (syncResult) {
      toast.success('Sincronização concluída', {
        description: `${syncResult.missionsSynced} missões, ${syncResult.photosSynced} fotos, ${syncResult.telemetrySynced} leituras enviadas`,
      });
      await loadMissions();
    }
  };

  const handleCreateMission = async () => {
    if (!newMissionName.trim()) {
      toast.error('Digite um nome para a missão');
      return;
    }

    setIsCreating(true);
    try {
      await createMission(newMissionName.trim(), newMissionDescription.trim());
      toast.success('Missão criada com sucesso!');
      setNewMissionName('');
      setNewMissionDescription('');
      setIsCreateDialogOpen(false);
    } catch (error) {
      toast.error('Erro ao criar missão');
      console.error(error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSetActive = async (missionId: string) => {
    try {
      await setActiveMission(missionId);
      toast.success(missionId ? 'Missão ativada!' : 'Missão pausada!');
    } catch (error) {
      toast.error(missionId ? 'Erro ao ativar missão' : 'Erro ao pausar missão');
      console.error(error);
    }
  };

  const handleDeleteMission = async (missionId: string, missionName: string) => {
    try {
      await deleteMission(missionId);
      toast.success(`Missão "${missionName}" deletada`);
    } catch (error) {
      toast.error('Erro ao deletar missão');
      console.error(error);
    }
  };

  const handleViewMissionPhotos = (missionId: string) => {
    navigate(`/gallery?mission=${missionId}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-background p-4 pt-6 pb-24">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Missões</h1>
            <p className="text-sm text-muted-foreground">
              Organize suas fotos por missão
            </p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Nova Missão
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Nova Missão</DialogTitle>
                <DialogDescription>
                  Dê um nome e descrição para sua missão
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Nome *</label>
                  <Input
                    value={newMissionName}
                    onChange={(e) => setNewMissionName(e.target.value)}
                    placeholder="Ex: Mapeamento Área Sul"
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Descrição</label>
                  <Textarea
                    value={newMissionDescription}
                    onChange={(e) => setNewMissionDescription(e.target.value)}
                    placeholder="Descrição opcional da missão"
                    rows={3}
                    maxLength={500}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                    disabled={isCreating}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateMission} disabled={isCreating}>
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      'Criar Missão'
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Active Mission */}
        {activeMission && (
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-primary">Missão Ativa</p>
                <p className="font-bold mt-1">{activeMission.name}</p>
                {activeMission.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {activeMission.description}
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
            <p className="text-sm text-muted-foreground">Carregando missões...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && missions.length === 0 && (
          <Card className="p-12">
            <div className="text-center">
              <FolderOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma missão criada</h3>
              <p className="text-muted-foreground mb-6">
                Crie sua primeira missão para organizar as fotos
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeira Missão
              </Button>
            </div>
          </Card>
        )}

        {/* Sync Section */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-primary" />
              <div>
                <p className="font-medium text-sm">Sincronização</p>
                <p className="text-xs text-muted-foreground">
                  {unsyncedPhotosCount > 0 
                    ? `${unsyncedPhotosCount} ${unsyncedPhotosCount === 1 ? 'foto pendente' : 'fotos pendentes'}`
                    : 'Tudo sincronizado'}
                </p>
              </div>
            </div>
            <Button
              onClick={handleSync}
              disabled={syncState === 'syncing'}
              size="sm"
              variant="outline"
            >
              {syncState === 'syncing' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CloudUpload className="w-4 h-4" />
              )}
            </Button>
          </div>
          {syncError && (
            <p className="text-xs text-destructive mt-2">{syncError}</p>
          )}
          {syncState === 'success' && syncResult && (
            <p className="text-xs text-success mt-2">
              ✓ {syncResult.photosSynced} {syncResult.photosSynced === 1 ? 'foto sincronizada' : 'fotos sincronizadas'}
            </p>
          )}
        </Card>

        {/* Missions List */}
        {!loading && missions.length > 0 && (
          <div className="space-y-3">
            {missions.map((mission) => (
              <Card key={mission.id} className="p-4">
                <div className="flex items-start gap-4">
                  <FolderOpen className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{mission.name}</h3>
                      {mission.is_active && (
                        <Badge variant="default" className="shrink-0">Ativa</Badge>
                      )}
                      <Badge variant="secondary" className="shrink-0 inline-flex items-center gap-1">
                        <Camera className="w-3 h-3" />
                        {photoCounts[mission.id] || 0}
                      </Badge>
                    </div>
                    {mission.description && (
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {mission.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Criada em {formatDate(mission.created_at)}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleViewMissionPhotos(mission.id)}
                      title="Ver fotos"
                    >
                      <ImageIcon className="w-4 h-4" />
                    </Button>
                    {mission.is_active ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetActive('')}
                      >
                        Pausar
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetActive(mission.id)}
                      >
                        Ativar
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="icon" className="text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Deletar Missão?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja deletar a missão "{mission.name}"?
                            As fotos não serão deletadas, apenas desvinculadas desta missão.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteMission(mission.id, mission.name)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Deletar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Missions;
