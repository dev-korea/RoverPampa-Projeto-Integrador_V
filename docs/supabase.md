# Supabase: Estrutura, Políticas e Checklist

Este documento consolida o que o app espera do Supabase para funcionar 100% com RLS e Storage.

## Variáveis de ambiente
- `VITE_SUPABASE_URL`: URL do seu projeto Supabase
- `VITE_SUPABASE_PUBLISHABLE_KEY`: chave pública (anon) do Supabase

## Tabelas e colunas mínimas necessárias
- `public.missions`
  - `id uuid pk`, `user_id uuid`, `name text`, `description text`,
  - `is_active boolean`, `is_paused boolean`, `started_at timestamptz`, `finished_at timestamptz`
  - `last_synced_at timestamptz`, `sync_status text`, `created_at timestamptz`, `updated_at timestamptz`

- `public.photos`
  - `id uuid pk`, `user_id uuid`, `mission_id uuid`,
  - `filename text`, `capture_at timestamptz`, `created_at timestamptz`
  - Opcional (recomendado): `file_path text`, `file_size int`

- `public.telemetry_readings`
  - `id uuid pk`, `user_id uuid`, `mission_id uuid`, `captured_at timestamptz`
  - `temperature_c numeric`, `humidity_pct numeric`, `battery_v numeric`, `rover_state jsonb`

## RLS (Row Level Security)
Ativar RLS nas tabelas: `missions`, `photos`, `telemetry_readings`.

Políticas (todas exigem usuário autenticado):
```sql
create policy "missions owner" on public.missions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "photos owner" on public.photos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "telemetry owner" on public.telemetry_readings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

## Storage Bucket `photos`
Criar bucket privado `photos`:
```sql
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;
```

Políticas de acesso (privado por usuário, diretório raiz = `auth.uid()`):
```sql
create policy "photos insert by owner" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "photos read by owner" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "photos delete by owner" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
```

Estrutura esperada do caminho no Storage:
- `photos/<user_id>/<mission_id|nomission>/<filename>`

## Índices recomendados
```sql
-- Missões
create index if not exists idx_missions_user_created on public.missions(user_id, created_at desc);

-- Fotos
create index if not exists idx_photos_user_capture on public.photos(user_id, capture_at desc);
create index if not exists idx_photos_mission_capture on public.photos(mission_id, capture_at);

-- Telemetria
create index if not exists idx_tel_user_capture on public.telemetry_readings(user_id, captured_at desc);
create index if not exists idx_tel_mission_capture on public.telemetry_readings(mission_id, captured_at);
```

## Checklist de funcionamento
- App consegue autenticar (sessão válida em `supabase.auth`).
- Criar missão insere `user_id` e retorna-se na lista local.
- Sincronizar missões faz `upsert` por `id`, atualizando `last_synced_at` e `sync_status`.
- Captura de foto salva no `localStorage` (`roverpampa_photos`).
- Sincronização de fotos:
  - Faz upload para `photos` bucket em `user_id/mission_id/filename`.
  - Insere metadados em `public.photos` com `user_id`, `filename`, `capture_at`, `mission_id` e preferencialmente `file_path`, `file_size`.
  - UI (Galeria) ordena por `capture_at` e gera URL pública via `file_path`; se ausente, reconstrói o caminho.

## Solução de problemas
- Erro de RLS ao inserir: confirme se o usuário está autenticado e se as políticas acima foram aplicadas.
- Erro de coluna inexistente em `photos`: aplique as colunas opcionais (`file_path`, `file_size`) ou use o fallback já implementado no app.
- Não aparece imagem: verifique se o `file_path` está correto (ou se foi reconstruído) e se o bucket é o `photos`.
- URL pública não abre: bucket é privado; a UI usa `getPublicUrl`, que funciona com objetos privados desde que o bucket permita gerar URL pública. Se preferir público, defina `storage.buckets.public = true` (não recomendado em produção).