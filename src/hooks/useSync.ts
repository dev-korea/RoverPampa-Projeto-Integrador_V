import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { PhotoData } from './usePhotoCapture';
import type { Mission } from './useMissions';

export type SyncState = 'idle' | 'syncing' | 'success' | 'error';

interface SyncResult {
  photosSynced: number;
  telemetrySynced: number;
  missionsSynced: number;
}

export const useSync = () => {
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const syncPhotos = useCallback(async (): Promise<number> => {
    // Buscar fotos do localStorage
    const stored = localStorage.getItem('roverpampa_photos');
    if (!stored) return 0;

    const photos: PhotoData[] = JSON.parse(stored);
    const unsyncedPhotos = photos.filter(photo => !(photo as any).synced);

    if (unsyncedPhotos.length === 0) return 0;

    let syncedCount = 0;

    for (const photo of unsyncedPhotos) {
      try {
        // Converter dataUrl para blob
        const response = await fetch(photo.dataUrl);
        const blob = await response.blob();

        // Obter user (opcional) e criar caminho com estrutura
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        const filePath = user
          ? `${user.id}/${photo.missionId || 'nomission'}/${photo.filename}`
          : `public/${photo.missionId || 'nomission'}/${photo.filename}`;
        
        // Upload para o bucket photos
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(filePath, blob, {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (uploadError) {
          console.error('Erro ao fazer upload da foto:', uploadError);
          continue;
        }

        // Obter URL pública/assinada (tratado na galeria)
        const { data: urlData } = supabase.storage
          .from('photos')
          .getPublicUrl(filePath);

        // Inserir metadados na tabela photos (com fallback)
        const { error: dbError } = await supabase
          .from('photos')
          .insert({
            user_id: user?.id ?? null,
            filename: photo.filename,
            file_path: filePath,
            file_size: photo.size,
            capture_at: new Date(photo.createdAt).toISOString(),
            mission_id: photo.missionId || null,
          });

        if (dbError) {
          // Tentar inserção mínima se colunas não existirem em algumas migrações
          const minimal = await supabase
            .from('photos')
            .insert({
              user_id: user?.id ?? null,
              filename: photo.filename,
              capture_at: new Date(photo.createdAt).toISOString(),
              mission_id: photo.missionId || null,
            });
          if (minimal.error) {
            console.error('Erro ao inserir metadados da foto:', dbError, minimal.error);
            // Tentar deletar o arquivo do storage se falhou inserir no DB
            await supabase.storage.from('photos').remove([filePath]);
            continue;
          }
        }

        // Upload de sidecar de telemetria (se disponível)
        if ((photo as any).telemetry) {
          const telemetryPath = filePath.replace(/\.jpg$/i, '.telemetry.json');
          const telemetryBlob = new Blob([
            JSON.stringify({
              mission_id: photo.missionId || null,
              captured_at: new Date(photo.createdAt).toISOString(),
              temp: (photo as any).telemetry?.temp ?? null,
              hum: (photo as any).telemetry?.hum ?? null,
              ok: (photo as any).telemetry?.ok ?? false,
              dist_cm: (photo as any).telemetry?.distCm ?? null,
              obstacle_session_id: (photo as any).telemetry?.obstacleSessionId ?? null,
              seq: (photo as any).telemetry?.seq ?? null,
              source: (photo as any).telemetry?.source ?? 'auto',
              sensor_timestamp: (photo as any).telemetry?.timestamp ?? null,
              ts: (photo as any).telemetry?.ts ?? null,
            })
          ], { type: 'application/json' });
          const { error: teleErr } = await supabase.storage
            .from('photos')
            .upload(telemetryPath, telemetryBlob, { contentType: 'application/json', upsert: false });
          if (teleErr) {
            console.error('Erro ao subir sidecar de telemetria:', teleErr);
          }

          const { error: telDbErr } = await supabase
            .from('telemetry_readings')
            .insert({
              user_id: user?.id ?? null,
              mission_id: photo.missionId || null,
              captured_at: new Date(photo.createdAt).toISOString(),
              temperature_c: (photo as any).telemetry?.temp ?? null,
              humidity_pct: (photo as any).telemetry?.hum ?? null,
              rover_state: {
                dist_cm: (photo as any).telemetry?.distCm ?? null,
                obstacle_session_id: (photo as any).telemetry?.obstacleSessionId ?? null,
                seq: (photo as any).telemetry?.seq ?? null,
                source: (photo as any).telemetry?.source ?? 'auto',
              },
            });
          if (telDbErr) {
            console.error('Erro ao inserir telemetria vinculada à foto:', telDbErr);
          }
        }

        // Marcar como sincronizado
        (photo as any).synced = true;
        (photo as any).supabaseUrl = urlData.publicUrl;
        syncedCount++;
      } catch (err) {
        console.error('Erro ao sincronizar foto:', err);
      }
    }

    // Salvar de volta no localStorage
    localStorage.setItem('roverpampa_photos', JSON.stringify(photos));

    return syncedCount;
  }, []);

  const syncTelemetry = useCallback(async (): Promise<number> => {
    const listStored = localStorage.getItem('roverpampa_telemetry');
    const lastStored = localStorage.getItem('roverpampa_last_dht');
    const readings = listStored
      ? JSON.parse(listStored)
      : lastStored
        ? [JSON.parse(lastStored)]
        : [];
    if (readings.length === 0) return 0;
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    const activeMissionId = localStorage.getItem('active_mission_id');
    const missionId = activeMissionId || null;

    const inserts = readings.map((r: any) => ({
      user_id: user?.id ?? null,
      mission_id: r.mission_id ?? missionId,
      device_id: r.device_id ?? null,
      captured_at: new Date(r.timestamp).toISOString(),
      temperature_c: r.temp ?? null,
      humidity_pct: r.hum ?? null,
      battery_v: r.batt ?? null,
      rover_state: r.state || null,
    }));

    const { error } = await supabase.from('telemetry_readings').insert(inserts);
    if (error) {
      console.error('Erro ao inserir telemetria:', error);
      return 0;
    }
    if (listStored) localStorage.removeItem('roverpampa_telemetry');
    if (lastStored) localStorage.removeItem('roverpampa_last_dht');
    return inserts.length;
  }, []);

  const syncMissions = useCallback(async (): Promise<number> => {
    try {
      // Obter missões locais do localStorage
      const storedMissions = localStorage.getItem('roverpampa_missions');
      if (!storedMissions) return 0;

      const localMissions: Mission[] = JSON.parse(storedMissions);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      // Filtrar missões que precisam ser sincronizadas (status pending ou error)
      const missionsToSync = localMissions.filter(mission => 
        mission.sync_status === 'pending' || mission.sync_status === 'error'
      );

      if (missionsToSync.length === 0) return 0;

      let syncedCount = 0;

      for (const mission of missionsToSync) {
        try {
          // Upsert missão no Supabase (cria se não existir, atualiza se existir)
          const payload = {
            ...mission,
            user_id: user?.id ?? null,
            last_synced_at: new Date().toISOString(),
            sync_status: 'synced',
          };

          const { error: upsertError } = await supabase
            .from('missions')
            .upsert(payload, { onConflict: 'id' });

          if (upsertError) {
            console.error('Erro ao upsert missão:', upsertError);
            mission.sync_status = 'error';
            continue;
          }

          // Atualizar status local
          mission.sync_status = 'synced';
          mission.last_synced_at = new Date().toISOString();
          syncedCount++;
        } catch (err) {
          console.error('Erro ao sincronizar missão:', err);
          mission.sync_status = 'error';
        }
      }

      // Salvar missões atualizadas no localStorage
      localStorage.setItem('roverpampa_missions', JSON.stringify(localMissions));

      return syncedCount;
    } catch (err) {
      console.error('Erro ao sincronizar missões:', err);
      return 0;
    }
  }, []);

  const sync = useCallback(async () => {
    setSyncState('syncing');
    setError(null);
    setSyncResult(null);

    try {
      // Sincronizar missões primeiro para garantir chaves estrangeiras de photos/telemetry
      const missionsSynced = await syncMissions();
      // Em seguida, sincronizar fotos e telemetria em paralelo com o que estiver disponível
      const [photosSynced, telemetrySynced] = await Promise.all([
        syncPhotos(),
        syncTelemetry(),
      ]);

      setSyncResult({ photosSynced, telemetrySynced, missionsSynced });
      setSyncState('success');

      // Resetar para idle após 3 segundos
      setTimeout(() => {
        setSyncState('idle');
      }, 3000);
    } catch (err) {
      console.error('Erro na sincronização:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setSyncState('error');
    }
  }, [syncPhotos, syncTelemetry, syncMissions]);

  const clearError = useCallback(() => {
    setError(null);
    setSyncState('idle');
  }, []);

  return {
    syncState,
    syncResult,
    error,
    sync,
    clearError,
  };
};
