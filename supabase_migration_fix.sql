-- Script de correção para executar se houver erros
-- Execute cada comando individualmente se necessário

-- 1. Remover tabelas existentes (CUIDADO: isso apaga dados!)
-- Descomente e execute apenas se necessário:
-- drop table if exists public.telemetry_readings cascade;
-- drop table if exists public.photos cascade;
-- drop table if exists public.missions cascade;
-- drop table if exists public.devices cascade;

-- 2. Criar tabelas com IF NOT EXISTS para evitar conflitos
create table if not exists public.devices (
  id uuid default gen_random_uuid() primary key,
  ble_mac text unique,
  label text,
  owner_id uuid,
  created_at timestamptz default now()
);

create table if not exists public.missions (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  user_id uuid,
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
  sync_status text default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.photos (
  id uuid default gen_random_uuid() primary key,
  user_id uuid,
  mission_id uuid references public.missions(id),
  device_id uuid references public.devices(id),
  filename text not null,
  file_path text not null,
  capture_at timestamptz not null,
  synced_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.telemetry_readings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid,
  mission_id uuid references public.missions(id),
  device_id uuid references public.devices(id),
  captured_at timestamptz not null,
  temperature_c numeric(5,2),
  humidity_pct numeric(5,2),
  battery_v numeric(5,2),
  rover_state jsonb,
  created_at timestamptz default now()
);

-- 3. Adicionar extensões se ainda não existirem
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- 4. Criar índices apenas se não existirem
create index if not exists idx_missions_user_active on public.missions(user_id, is_active);
create index if not exists idx_missions_user_created on public.missions(user_id, created_at desc);
create index if not exists idx_photos_user_capture on public.photos(user_id, capture_at desc);
create index if not exists idx_tel_user_capture on public.telemetry_readings(user_id, captured_at desc);