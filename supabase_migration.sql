-- ==========================================================
-- 0) Extensões (idempotente)
-- ==========================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ==========================================================
-- 1) PROFILES: espelha auth.users (FKs vão apontar para profiles)
-- ==========================================================
create table if not exists public.profiles (
  id uuid primary key,
  display_name text,
  created_at timestamptz not null default now()
);

-- Função: criar profile ao criar usuário no auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name',''))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger: sincroniza profiles com auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==========================================================
-- 2) DEVICES (ESP32) - idempotente
-- ==========================================================
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  ble_mac text unique,
  label text,
  owner_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Garantir colunas (caso tabela exista de versões antigas)
alter table public.devices
  add column if not exists ble_mac text,
  add column if not exists label text,
  add column if not exists owner_id uuid references public.profiles(id) on delete cascade,
  add column if not exists created_at timestamptz not null default now();

-- ==========================================================
-- 3) MISSIONS (cronômetro, sync) - idempotente
-- ==========================================================
create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  user_id uuid references public.profiles(id) on delete cascade,
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

-- Garantir colunas caso tabela já exista
alter table public.missions
  add column if not exists description text,
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists device_id uuid references public.devices(id),
  add column if not exists is_active boolean not null default false,
  add column if not exists is_paused boolean not null default false,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists resumed_at timestamptz,
  add column if not exists total_paused_duration_ms bigint default 0,
  add column if not exists duration_ms bigint,
  add column if not exists last_synced_at timestamptz,
  add column if not exists sync_status text check (sync_status in ('pending','synced','error')) default 'pending',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Índices para missões
create index if not exists idx_missions_user_active  on public.missions(user_id, is_active);
create index if not exists idx_missions_user_created on public.missions(user_id, created_at desc);

-- Função: calcular duração (cronômetro)
create or replace function public.calculate_mission_duration()
returns trigger
language plpgsql
as $$
begin
  if NEW.finished_at is not null then
    NEW.duration_ms := extract(epoch from (NEW.finished_at - NEW.started_at)) * 1000
                       - coalesce(NEW.total_paused_duration_ms, 0);
  elsif NEW.is_active = false and OLD.is_active = true then
    if NEW.is_paused then
      NEW.paused_at := now();
    else
      NEW.finished_at := now();
      NEW.duration_ms := extract(epoch from (NEW.finished_at - NEW.started_at)) * 1000
                         - coalesce(NEW.total_paused_duration_ms, 0);
    end if;
  elsif NEW.is_paused = false and OLD.is_paused = true then
    NEW.resumed_at := now();
    NEW.total_paused_duration_ms := coalesce(NEW.total_paused_duration_ms, 0)
                                    + extract(epoch from (NEW.resumed_at - NEW.paused_at)) * 1000;
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;

-- Trigger: recalcular antes de UPDATE
drop trigger if exists on_mission_duration_calc on public.missions;
create trigger on_mission_duration_calc
  before update on public.missions
  for each row execute function public.calculate_mission_duration();

-- ==========================================================
-- 4) PHOTOS - idempotente + helper rename capture_date -> capture_at
-- ==========================================================
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
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

-- Garantir colunas caso tabela exista
alter table public.photos
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists mission_id uuid references public.missions(id) on delete set null,
  add column if not exists device_id uuid references public.devices(id),
  add column if not exists filename text,
  add column if not exists file_path text,
  add column if not exists file_size int,
  add column if not exists width int,
  add column if not exists height int,
  add column if not exists hash text,
  add column if not exists capture_at timestamptz,
  add column if not exists synced_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

-- Se existir capture_date (antigo) e não existir capture_at, renomear
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'photos' and column_name = 'capture_date'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'photos' and column_name = 'capture_at'
  ) then
    execute 'alter table public.photos rename column capture_date to capture_at';
  end if;
end $$;

create index if not exists idx_photos_user_capture   on public.photos(user_id, capture_at desc);
create index if not exists idx_photos_mission_capture on public.photos(mission_id, capture_at);

-- ==========================================================
-- 5) TELEMETRY READINGS - idempotente
-- ==========================================================
create table if not exists public.telemetry_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete set null,
  device_id uuid references public.devices(id),
  captured_at timestamptz not null,
  temperature_c numeric(5,2),
  humidity_pct numeric(5,2),
  battery_v numeric(5,2),
  rover_state jsonb,
  created_at timestamptz not null default now()
);

alter table public.telemetry_readings
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists mission_id uuid references public.missions(id) on delete set null,
  add column if not exists device_id uuid references public.devices(id),
  add column if not exists captured_at timestamptz,
  add column if not exists temperature_c numeric(5,2),
  add column if not exists humidity_pct numeric(5,2),
  add column if not exists battery_v numeric(5,2),
  add column if not exists rover_state jsonb,
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_tel_user_capture    on public.telemetry_readings(user_id, captured_at desc);
create index if not exists idx_tel_mission_capture on public.telemetry_readings(mission_id, captured_at);

-- ==========================================================
-- 6) RLS (Row Level Security) - idempotente
-- ==========================================================
alter table public.devices             enable row level security;
alter table public.missions            enable row level security;
alter table public.photos              enable row level security;
alter table public.telemetry_readings  enable row level security;
alter table public.profiles            enable row level security;

-- Policies idempotentes via pg_policies (não quebra se já existir)

-- profiles: cada usuário só lê seu próprio profile
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles self select'
  ) then
    create policy "profiles self select"
    on public.profiles for select
    using (id = auth.uid());
  end if;
end $$;

-- devices: dono vê/edita seus devices
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'devices' and policyname = 'devices owner'
  ) then
    create policy "devices owner"
    on public.devices for all
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid());
  end if;
end $$;

-- missions: dono vê/edita suas missões
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'missions' and policyname = 'missions owner'
  ) then
    create policy "missions owner"
    on public.missions for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
  end if;
end $$;

-- photos: dono vê/edita suas fotos
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'photos' and policyname = 'photos owner'
  ) then
    create policy "photos owner"
    on public.photos for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
  end if;
end $$;

-- telemetry: dono vê/edita suas leituras
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'telemetry_readings' and policyname = 'telemetry owner'
  ) then
    create policy "telemetry owner"
    on public.telemetry_readings for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
  end if;
end $$;

-- ==========================================================
-- 7) STORAGE BUCKET (privado) + Policies (idempotente)
-- ==========================================================
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Policies de Storage (schema = storage, tabela = objects), por prefixo de path userId/...
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos insert by owner'
  ) then
    create policy "photos insert by owner"
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos read by owner'
  ) then
    create policy "photos read by owner"
    on storage.objects for select
    to authenticated
    using (
      bucket_id = 'photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos delete by owner'
  ) then
    create policy "photos delete by owner"
    on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'photos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;
end $$;

-- ==========================================================
-- 8) NOTAS DE USO (comentários):
-- - Paths recomendados no Storage: `${auth.uid()}/${mission_id}/${filename}`
-- - Para exibir imagens com bucket privado, use createSignedUrl no client.
-- - Regere os types: supabase gen types typescript --project-id <ID> > src/integrations/supabase/types.ts
-- ==========================================================
