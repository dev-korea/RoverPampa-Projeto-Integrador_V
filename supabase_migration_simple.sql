-- Criar extensões (ignorar se já existirem)
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Tabela de dispositivos
create table if not exists public.devices (
  id uuid default gen_random_uuid() primary key,
  ble_mac text unique,
  label text,
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- Tabela de missões com campos de sincronização e cronômetro
create table if not exists public.missions (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  user_id uuid references auth.users(id) on delete cascade,
  device_id uuid references public.devices(id),
  is_active boolean default false,
  is_paused boolean default false,
  started_at timestamptz,
  finished_at timestamptz,
  paused_at timestamptz,
  resumed_at timestamptz,
  total_paused_duration_ms bigint default 0,
  duration_ms bigint,
  last_synced_at timestamptz,
  sync_status text check (sync_status in ('pending','synced','error')) default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Índices para performance
create index if not exists idx_missions_user_active on public.missions(user_id, is_active);
create index if not exists idx_missions_user_created on public.missions(user_id, created_at desc);

-- Função simples para atualizar timestamp
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

-- Trigger para atualizar updated_at
create trigger update_missions_updated_at
  before update on public.missions
  for each row execute function public.update_updated_at();

-- Tabela de fotos
create table if not exists public.photos (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete set null,
  device_id uuid references public.devices(id),
  filename text not null,
  file_path text not null,
  file_size int,
  width int,
  height int,
  hash text,
  capture_at timestamptz not null,
  synced_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_photos_user_capture on public.photos(user_id, capture_at desc);
create index if not exists idx_photos_mission_capture on public.photos(mission_id, capture_at);

-- Tabela de telemetria
create table if not exists public.telemetry_readings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete set null,
  device_id uuid references public.devices(id),
  captured_at timestamptz not null,
  temperature_c numeric(5,2),
  humidity_pct numeric(5,2),
  battery_v numeric(5,2),
  rover_state jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_tel_user_capture on public.telemetry_readings(user_id, captured_at desc);
create index if not exists idx_tel_mission_capture on public.telemetry_readings(mission_id, captured_at);

-- Ativar RLS (Row Level Security)
alter table public.devices enable row level security;
alter table public.missions enable row level security;
alter table public.photos enable row level security;
alter table public.telemetry_readings enable row level security;

-- Políticas de segurança
create policy "devices_owner" on public.devices
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "missions_owner" on public.missions
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "photos_owner" on public.photos
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "telemetry_owner" on public.telemetry_readings
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Criar bucket de storage (ignorar se já existir)
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Políticas do storage
create policy "storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos');

create policy "storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos');

create policy "storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos');