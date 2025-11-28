-- Enable TEST MODE: allow anonymous sync without login
-- This migration relaxes RLS and Storage policies so any user (anon) can
-- insert/select missions, photos, telemetry and upload files to the `photos` bucket
-- under the `public/` path.

-- 1) Ensure RLS is enabled on target tables
alter table if exists public.missions enable row level security;
alter table if exists public.photos enable row level security;
alter table if exists public.telemetry_readings enable row level security;

-- 2) Add permissive anon policies for testing
-- Missions: select/insert/update/delete for anyone
drop policy if exists "anon_select_missions" on public.missions;
create policy "anon_select_missions" on public.missions for select using (true);

drop policy if exists "anon_insert_missions" on public.missions;
create policy "anon_insert_missions" on public.missions for insert with check (true);

drop policy if exists "anon_update_missions" on public.missions;
create policy "anon_update_missions" on public.missions for update using (true) with check (true);

drop policy if exists "anon_delete_missions" on public.missions;
create policy "anon_delete_missions" on public.missions for delete using (true);

-- Photos: select/insert for anyone
drop policy if exists "anon_select_photos" on public.photos;
create policy "anon_select_photos" on public.photos for select using (true);

drop policy if exists "anon_insert_photos" on public.photos;
create policy "anon_insert_photos" on public.photos for insert with check (true);

-- Telemetry: select/insert for anyone
drop policy if exists "anon_select_telemetry" on public.telemetry_readings;
create policy "anon_select_telemetry" on public.telemetry_readings for select using (true);

drop policy if exists "anon_insert_telemetry" on public.telemetry_readings;
create policy "anon_insert_telemetry" on public.telemetry_readings for insert with check (true);

-- 3) Storage bucket `photos` as PUBLIC and public/* policies
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do update set public = excluded.public;

-- Allow reading/writing objects only under the `public/` prefix in the photos bucket
-- Read policy
drop policy if exists "anon_read_public_photos" on storage.objects;
create policy "anon_read_public_photos" on storage.objects
  for select to public
  using (bucket_id = 'photos' and name like 'public/%');

-- Insert policy
drop policy if exists "anon_insert_public_photos" on storage.objects;
create policy "anon_insert_public_photos" on storage.objects
  for insert to public
  with check (bucket_id = 'photos' and name like 'public/%');

-- Optional: delete policy (enable only if you want public deletions)
-- drop policy if exists "anon_delete_public_photos" on storage.objects;
-- create policy "anon_delete_public_photos" on storage.objects
--   for delete to public
--   using (bucket_id = 'photos' and name like 'public/%');

-- 4) Helpful indexes (idempotent)
create index if not exists idx_missions_user_created on public.missions(user_id, created_at desc);
create index if not exists idx_photos_user_capture on public.photos(user_id, capture_at desc);
create index if not exists idx_tel_user_capture on public.telemetry_readings(user_id, captured_at desc);