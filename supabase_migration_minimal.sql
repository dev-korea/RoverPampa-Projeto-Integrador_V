-- PASSO 1: Criar extensões (execute primeiro)
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- PASSO 2: Criar tabelas (execute depois)
-- Tabela de dispositivos
create table if not exists devices (
  id uuid default gen_random_uuid() primary key,
  ble_mac text unique,
  label text,
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- Tabela de missões
create table if not exists missions (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  user_id uuid references auth.users(id) on delete cascade,
  device_id uuid references devices(id),
  is_active boolean default false,
  is_paused boolean default false,
  started_at timestamptz,
  finished_at timestamptz,
  paused_at timestamptz,
  resumed_at timestamptz,
  total_paused_duration_ms bigint default 0,
  duration_ms bigint,
  last_synced_at timestamptz,
  sync_status text default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela de fotos
create table if not exists photos (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  device_id uuid references devices(id),
  filename text not null,
  file_path text not null,
  capture_at timestamptz not null,
  synced_at timestamptz,
  created_at timestamptz default now()
);

-- Tabela de telemetria
create table if not exists telemetry_readings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  device_id uuid references devices(id),
  captured_at timestamptz not null,
  temperature_c numeric(5,2),
  humidity_pct numeric(5,2),
  battery_v numeric(5,2),
  rover_state jsonb,
  created_at timestamptz default now()
);

-- PASSO 3: Criar índices (execute por último)
create index if not exists idx_missions_user_active on missions(user_id, is_active);
create index if not exists idx_missions_user_created on missions(user_id, created_at desc);
create index if not exists idx_photos_user_capture on photos(user_id, capture_at desc);
create index if not exists idx_tel_user_capture on telemetry_readings(user_id, captured_at desc);