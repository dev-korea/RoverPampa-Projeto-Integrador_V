import React, { useEffect, useState } from 'react';
import { useMissions } from '@/hooks/useMissions';

export const MissionTimer: React.FC = () => {
  const { missions, activeMissionId, pauseMission, resumeMission, finishMission, syncMission } = useMissions();
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const activeMission = missions.find(m => m.id === activeMissionId);

  const formatDuration = (ms: number | null): string => {
    if (!ms) return '00:00:00';
    
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getCurrentDuration = (mission: any): number => {
    if (!mission.started_at) return 0;
    
    const startTime = new Date(mission.started_at).getTime();
    const currentTimeMs = currentTime.getTime();
    
    let totalDuration = currentTimeMs - startTime;
    
    // Subtrair tempo pausado
    if (mission.total_paused_duration_ms) {
      totalDuration -= mission.total_paused_duration_ms;
    }
    
    // Se estiver pausado, subtrair tempo desde a última pausa
    if (mission.is_paused && mission.paused_at) {
      const pausedTime = new Date(mission.paused_at).getTime();
      totalDuration -= (currentTimeMs - pausedTime);
    }
    
    return Math.max(0, totalDuration);
  };

  if (!activeMission) {
    return (
      <div className="p-4 bg-gray-100 rounded-lg">
        <p className="text-gray-600">Nenhuma missão ativa</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{activeMission.name}</h3>
        <div className="flex gap-2">
          {activeMission.is_paused ? (
            <button
              onClick={() => resumeMission(activeMission.id)}
              className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Retomar
            </button>
          ) : (
            <button
              onClick={() => pauseMission(activeMission.id)}
              className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
            >
              Pausar
            </button>
          )}
          <button
            onClick={() => finishMission(activeMission.id)}
            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Finalizar
          </button>
          <button
            onClick={() => syncMission(activeMission.id)}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            disabled={activeMission.sync_status === 'synced'}
          >
            {activeMission.sync_status === 'synced' ? 'Sincronizado' : 'Sincronizar'}
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-600">Tempo de Execução</p>
          <p className="text-2xl font-mono font-bold">
            {formatDuration(getCurrentDuration(activeMission))}
          </p>
        </div>
        
        <div>
          <p className="text-sm text-gray-600">Status</p>
          <p className={`text-lg font-semibold ${
            activeMission.is_paused ? 'text-yellow-600' : 'text-green-600'
          }`}>
            {activeMission.is_paused ? 'Pausada' : 'Em Execução'}
          </p>
        </div>
        
        <div>
          <p className="text-sm text-gray-600">Início</p>
          <p className="text-sm">
            {activeMission.started_at ? new Date(activeMission.started_at).toLocaleString() : '-'}
          </p>
        </div>
        
        <div>
          <p className="text-sm text-gray-600">Última Sincronização</p>
          <p className="text-sm">
            {activeMission.last_synced_at 
              ? new Date(activeMission.last_synced_at).toLocaleString() 
              : 'Nunca'
            }
          </p>
        </div>
      </div>
      
      {activeMission.total_paused_duration_ms && (
        <div className="mt-4 p-2 bg-gray-100 rounded">
          <p className="text-sm text-gray-600">
            Tempo Total Pausado: {formatDuration(activeMission.total_paused_duration_ms)}
          </p>
        </div>
      )}
    </div>
  );
};