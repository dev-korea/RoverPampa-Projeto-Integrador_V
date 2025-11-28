# Novas Funcionalidades de Sincronização e Cronômetro

## 📋 Resumo das Mudanças

Foram adicionadas novas funcionalidades ao sistema de missões para permitir:

1. **Sincronização de dados** com timestamp e status
2. **Cronômetro de missões** com controle de pausa/retomada
3. **Cálculo automático de duração** das missões

## 🔄 Campos Adicionados na Tabela `missions`

### Campos de Sincronização
- `last_synced_at` (timestamp): Última vez que a missão foi sincronizada
- `sync_status` (enum): Status da sincronização (`pending`, `synced`, `error`)

### Campos de Cronômetro
- `is_paused` (boolean): Indica se a missão está pausada
- `started_at` (timestamp): Momento do início da missão
- `finished_at` (timestamp): Momento do término da missão
- `paused_at` (timestamp): Momento da última pausa
- `resumed_at` (timestamp): Momento da última retomada
- `total_paused_duration_ms` (bigint): Tempo total em pausa (em milissegundos)
- `duration_ms` (bigint): Duração total da missão (em milissegundos)

## 🚀 Novas Funções no Hook `useMissions`

```typescript
// Pausar uma missão
pauseMission(missionId: string)

// Retomar uma missão pausada
resumeMission(missionId: string)

// Finalizar uma missão
finishMission(missionId: string)

// Sincronizar uma missão (atualiza timestamp e status)
syncMission(missionId: string)
```

## 📱 Componente de Exemplo

Foi criado o componente `MissionTimer` que demonstra como usar as novas funcionalidades:

```tsx
import { MissionTimer } from '@/components/MissionTimer';

// No seu componente principal
<MissionTimer />
```

### Funcionalidades do Componente:
- Exibe tempo de execução em tempo real
- Botões para pausar/retomar missão
- Botão para finalizar missão
- Botão para sincronizar missão
- Mostra status atual (Em Execução/Pausada)
- Exibe última sincronização
- Mostra tempo total pausado

## 🔄 Atualização no Hook `useSync`

O hook `useSync` agora também sincroniza as missões, atualizando:
- `last_synced_at` com timestamp atual
- `sync_status` para `'synced'`

O resultado da sincronização agora inclui:
```typescript
interface SyncResult {
  photosSynced: number;
  telemetrySynced: number;
  missionsSynced: number; // Novo campo
}
```

## 📝 Exemplo de Uso Completo

```typescript
import { useMissions } from '@/hooks/useMissions';
import { useSync } from '@/hooks/useSync';

function MinhaMissao() {
  const { 
    missions, 
    activeMissionId, 
    pauseMission, 
    resumeMission, 
    syncMission 
  } = useMissions();
  
  const { sync, syncState, syncResult } = useSync();

  const activeMission = missions.find(m => m.id === activeMissionId);

  const handlePause = () => {
    if (activeMissionId) {
      pauseMission(activeMissionId);
    }
  };

  const handleSync = async () => {
    await sync(); // Sincroniza tudo (fotos, telemetria e missões)
    console.log('Missões sincronizadas:', syncResult?.missionsSynced);
  };

  return (
    <div>
      <h2>{activeMission?.name}</h2>
      <p>Status: {activeMission?.sync_status}</p>
      <p>Última sincronização: {activeMission?.last_synced_at}</p>
      
      <button onClick={handlePause}>
        {activeMission?.is_paused ? 'Retomar' : 'Pausar'}
      </button>
      
      <button onClick={handleSync}>
        Sincronizar Tudo
      </button>
    </div>
  );
}
```

## ⚠️ Importante: Executar a Migração

Para usar estas funcionalidades, você precisa executar o script SQL atualizado:

1. Acesse seu dashboard do Supabase
2. Vá para SQL Editor
3. Execute o conteúdo do arquivo `supabase_migration_updated.sql`

## 🔧 Próximos Passos

1. Execute a migração SQL no seu Supabase
2. Teste o componente `MissionTimer` em sua aplicação
3. Integre as novas funções de sincronização em seus fluxos existentes
4. Monitore os logs de sincronização para garantir tudo está funcionando