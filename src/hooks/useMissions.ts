import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Mission {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  user_id: string | null;
  is_active: boolean;
  is_paused: boolean;
  started_at: string;
  finished_at: string | null;
  paused_at: string | null;
  resumed_at: string | null;
  total_paused_duration_ms: number | null;
  duration_ms: number | null;
  last_synced_at: string | null;
  sync_status: 'pending' | 'synced' | 'error';
  updated_at: string;
}

export const useMissions = () => {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [activeMission, setActiveMissionState] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const readLocalMissions = useCallback((): Mission[] => {
    try {
      const stored = localStorage.getItem('roverpampa_missions');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, []);

  const writeLocalMissions = useCallback((list: Mission[]) => {
    localStorage.setItem('roverpampa_missions', JSON.stringify(list));
  }, []);

  const mergeMissions = useCallback((remote: Mission[] = [], local: Mission[] = []): Mission[] => {
    const map = new Map<string, Mission>();
    for (const m of local) map.set(m.id, m);
    for (const m of remote) map.set(m.id, { ...map.get(m.id), ...m } as Mission);
    return Array.from(map.values()).sort((a, b) => (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  }, []);

  const loadMissions = useCallback(async () => {
    setLoading(true);
    setError(null);

    const local = readLocalMissions();
    let remote: Mission[] = [];

    try {
      const { data, error: fetchError } = await supabase
        .from('missions')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      remote = data || [];
    } catch (err) {
      console.warn('Falha ao carregar missões remotas, usando apenas local:', err);
    }

    const merged = mergeMissions(remote, local);
    setMissions(merged);

    // Active mission: prefer merged flag, fallback to localStorage id
    const active = merged.find(m => m.is_active) || merged.find(m => m.id === localStorage.getItem('active_mission_id')) || null;
    setActiveMissionState(active);

    if (active) {
      localStorage.setItem('active_mission_id', active.id);
    } else {
      localStorage.removeItem('active_mission_id');
    }

    setLoading(false);
  }, [readLocalMissions, mergeMissions]);

  const createMission = useCallback(async (name: string, description?: string) => {
    try {
      const now = new Date().toISOString();
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;
      const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const mission: Mission = {
        id,
        name,
        description: description || null,
        created_at: now,
        user_id: userId,
        is_active: false,
        is_paused: false,
        started_at: now, // será ajustado ao ativar
        finished_at: null,
        paused_at: null,
        resumed_at: null,
        total_paused_duration_ms: 0,
        duration_ms: null,
        last_synced_at: null,
        sync_status: 'pending',
        updated_at: now,
      };

      const local = readLocalMissions();
      const updated = [mission, ...local];
      writeLocalMissions(updated);
      setMissions(updated);

      // Não insere no Supabase agora; sincroniza depois
      return mission;
    } catch (err) {
      console.error('Erro ao criar missão local:', err);
      setError(err instanceof Error ? err.message : 'Erro ao criar missão');
      throw err;
    }
  }, [readLocalMissions, writeLocalMissions]);

  const setActiveMission = useCallback(async (missionId: string) => {
    try {
      const local = readLocalMissions();
      const now = new Date().toISOString();

      const updatedLocal = local.map(m =>
        m.id === missionId
          ? { ...m, is_active: true, is_paused: false, started_at: now, finished_at: null, paused_at: null, resumed_at: null, total_paused_duration_ms: 0, duration_ms: null, updated_at: now, sync_status: 'pending' }
          : { ...m, is_active: false, updated_at: now, sync_status: m.sync_status === 'synced' ? 'pending' : m.sync_status }
      );

      writeLocalMissions(updatedLocal);
      setMissions(updatedLocal);

      const active = updatedLocal.find(m => m.id === missionId) || null;
      setActiveMissionState(active);
      localStorage.setItem('active_mission_id', missionId);

      // Tentar atualizar remoto (best-effort)
      try {
        await supabase
          .from('missions')
          .update({ is_active: false, finished_at: now })
          .neq('id', '00000000-0000-0000-0000-000000000000');

        await supabase
          .from('missions')
          .update({ is_active: true, is_paused: false, started_at: now, finished_at: null, paused_at: null, resumed_at: null, total_paused_duration_ms: 0, duration_ms: null })
          .eq('id', missionId);
      } catch (remoteErr) {
        console.warn('Falha ao ativar missão no Supabase, ficará pendente para sync:', remoteErr);
      }
    } catch (err) {
      console.error('Erro ao ativar missão:', err);
      setError(err instanceof Error ? err.message : 'Erro ao ativar missão');
      throw err;
    }
  }, [readLocalMissions, writeLocalMissions]);

  const pauseMission = useCallback(async (missionId: string) => {
    try {
      const local = readLocalMissions();
      const now = new Date().toISOString();
      const updatedLocal = local.map(m => m.id === missionId ? { ...m, is_paused: true, paused_at: now, updated_at: now, sync_status: 'pending' } : m);
      writeLocalMissions(updatedLocal);
      setMissions(updatedLocal);

      try {
        await supabase.from('missions').update({ is_paused: true, paused_at: now }).eq('id', missionId);
      } catch (remoteErr) {
        console.warn('Falha ao pausar missão no Supabase, pendente para sync:', remoteErr);
      }
    } catch (err) {
      console.error('Erro ao pausar missão:', err);
      setError(err instanceof Error ? err.message : 'Erro ao pausar missão');
      throw err;
    }
  }, [readLocalMissions, writeLocalMissions]);

  const resumeMission = useCallback(async (missionId: string) => {
    try {
      const local = readLocalMissions();
      const now = new Date().toISOString();
      const updatedLocal = local.map(m => m.id === missionId ? { ...m, is_paused: false, resumed_at: now, updated_at: now, sync_status: 'pending' } : m);
      writeLocalMissions(updatedLocal);
      setMissions(updatedLocal);

      try {
        await supabase.from('missions').update({ is_paused: false, resumed_at: now }).eq('id', missionId);
      } catch (remoteErr) {
        console.warn('Falha ao retomar missão no Supabase, pendente para sync:', remoteErr);
      }
    } catch (err) {
      console.error('Erro ao retomar missão:', err);
      setError(err instanceof Error ? err.message : 'Erro ao retomar missão');
      throw err;
    }
  }, [readLocalMissions, writeLocalMissions]);

  const finishMission = useCallback(async (missionId: string) => {
    try {
      const local = readLocalMissions();
      const now = new Date().toISOString();
      const updatedLocal = local.map(m => m.id === missionId ? { ...m, is_active: false, finished_at: now, updated_at: now, sync_status: 'pending' } : m);
      writeLocalMissions(updatedLocal);
      setMissions(updatedLocal);

      try {
        await supabase.from('missions').update({ is_active: false, finished_at: now }).eq('id', missionId);
      } catch (remoteErr) {
        console.warn('Falha ao finalizar missão no Supabase, pendente para sync:', remoteErr);
      }
    } catch (err) {
      console.error('Erro ao finalizar missão:', err);
      setError(err instanceof Error ? err.message : 'Erro ao finalizar missão');
      throw err;
    }
  }, [readLocalMissions, writeLocalMissions]);

  const syncMission = useCallback(async (missionId: string) => {
    try {
      // Apenas marca localmente como sincronizada; o upsert real é feito no useSync
      const local = readLocalMissions();
      const now = new Date().toISOString();
      const updatedLocal = local.map(m => m.id === missionId ? { ...m, last_synced_at: now, sync_status: 'synced', updated_at: now } : m);
      writeLocalMissions(updatedLocal);
      setMissions(updatedLocal);
    } catch (err) {
      console.error('Erro ao sincronizar missão local:', err);
      setError(err instanceof Error ? err.message : 'Erro ao sincronizar missão');
      throw err;
    }
  }, [readLocalMissions, writeLocalMissions]);

  const deleteMission = useCallback(async (missionId: string) => {
    try {
      // Remover local primeiro
      const local = readLocalMissions();
      const updatedLocal = local.filter(m => m.id !== missionId);
      writeLocalMissions(updatedLocal);
      setMissions(updatedLocal);

      if (localStorage.getItem('active_mission_id') === missionId) {
        localStorage.removeItem('active_mission_id');
        setActiveMissionState(null);
      }

      // Best-effort remoção remota
      try {
        await supabase.from('missions').delete().eq('id', missionId);
      } catch (remoteErr) {
        console.warn('Falha ao deletar missão no Supabase, já removida localmente:', remoteErr);
      }
    } catch (err) {
      console.error('Erro ao deletar missão:', err);
      setError(err instanceof Error ? err.message : 'Erro ao deletar missão');
      throw err;
    }
  }, [readLocalMissions, writeLocalMissions]);

  const getActiveMissionId = useCallback((): string | null => {
    return localStorage.getItem('active_mission_id');
  }, []);

  useEffect(() => {
    loadMissions();
  }, [loadMissions]);

  return {
    missions,
    activeMission,
    loading,
    error,
    loadMissions,
    createMission,
    setActiveMission,
    pauseMission,
    resumeMission,
    finishMission,
    syncMission,
    deleteMission,
    getActiveMissionId,
  };
};
