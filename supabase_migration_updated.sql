-- Extensões
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Dispositivos (ESP32)
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  ble_mac text unique,
  label text,
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Missões (com sincronização e cronômetro)
create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  user_id uuid references auth.users(id) on delete cascade,
  device_id uuid references public.devices(id),
  is_active boolean not null default false,
  is_paused boolean not null default false,
  started_at timestamptz,
  finished_at timestamptz,
  paused_at timestamptz,
  resumed_at timestamptz,
  total_paused_duration_ms bigint default 0,
  duration_ms bigint,
  last_synced_at timestamptz,
  sync_status text check (sync_status in ('pending','synced','error')) default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices para missões
create index if not exists idx_missions_user_active on public.missions(user_id, is_active);
create index if not exists idx_missions_user_created on public.missions(user_id, created_at desc);

-- Função para calcular duração da missão
create or replace function public.calculate_mission_duration()
returns trigger language plpgsql as $$
begin
  if NEW.finished_at is not null then
    -- Se a missão foi finalizada, calcular duração total
    NEW.duration_ms := extract(epoch from (NEW.finished_at - NEW.started_at)) * 1000 - COALESCE(NEW.total_paused_duration_ms, 0);
  elsif NEW.is_active = false and OLD.is_active = true then
    -- Se a missão foi pausada/finalizada
    if NEW.is_paused then
      NEW.paused_at := now();
    else
      NEW.finished_at := now();
      NEW.duration_ms := extract(epoch from (NEW.finished_at - NEW.started_at)) * 1000 - COALESCE(NEW.total_paused_duration_ms, 0);
    end if;
  elsif NEW.is_paused = false and OLD.is_paused = true then
    -- Se a missão foi retomada
    NEW.resumed_at := now();
    NEW.total_paused_duration_ms := COALESCE(NEW.total_paused_duration_ms, 0) + extract(epoch from (NEW.resumed_at - NEW.paused_at)) * 1000;
  end if;
  
  NEW.updated_at := now();
  return NEW;
end;
$$;

-- Trigger para calcular duração
drop trigger if exists on_mission_duration_calc on public.missions;
create trigger on_mission_duration_calc
  before update on public.missions
  for each row execute function public.calculate_mission_duration();

-- Fotos
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
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
  created_at timestamptz not null default now()
);

create index if not exists idx_photos_user_capture on public.photos(user_id, capture_at desc);
create index if not exists idx_photos_mission_capture on public.photos(mission_id, capture_at);

-- Telemetria
create table if not exists public.telemetry_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete set null,
  device_id uuid references public.devices(id),
  captured_at timestamptz not null,
  temperature_c numeric(5,2),
  humidity_pct numeric(5,2),
  battery_v numeric(5,2),
  rover_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tel_user_capture on public.telemetry_readings(user_id, captured_at desc);
create index if not exists idx_tel_mission_capture on public.telemetry_readings(mission_id, captured_at);

-- RLS
alter table public.devices enable row level security;
alter table public.missions enable row level security;
alter table public.photos enable row level security;
alter table public.telemetry_readings enable row level security;

create policy "devices owner"
on public.devices for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "missions owner"
on public.missions for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "photos owner"
on public.photos for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "telemetry owner"
on public.telemetry_readings for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Policies para bucket privado
create policy "photos insert by owner"
on storage.objects for insert
to authenticated
with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "photos read by owner"
on storage.objects for select
to authenticated
using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "photos delete by owner"
on storage.objects for delete
to authenticated
using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);