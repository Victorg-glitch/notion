-- NIGHT CITY // user_data Auth hardening
--
-- IMPORTANT:
-- This file is a migration guide for a future Supabase Auth setup.
-- Do not run it while the app still logs in only with pwd_hash stored in user_data.
-- Running it now will block the current public anon read/write flow.
--
-- Required Auth metadata per Supabase user:
--   raw_user_meta_data.night_city_username = 'victor' or 'caio'
--
-- After migration, the frontend should use Supabase Auth sessions instead of
-- storing/verifying pwd_hash in the public user_data table.

alter table public.user_data enable row level security;

drop policy if exists "public read user_data" on public.user_data;
drop policy if exists "public write user_data" on public.user_data;
drop policy if exists "read own user_data" on public.user_data;
drop policy if exists "insert own user_data" on public.user_data;
drop policy if exists "update own user_data" on public.user_data;
drop policy if exists "delete own user_data" on public.user_data;

revoke all on public.user_data from anon;
grant select, insert, update, delete on public.user_data to authenticated;

create policy "read own user_data"
on public.user_data
for select
to authenticated
using (
  username = (auth.jwt() -> 'user_metadata' ->> 'night_city_username')
);

create policy "insert own user_data"
on public.user_data
for insert
to authenticated
with check (
  username = (auth.jwt() -> 'user_metadata' ->> 'night_city_username')
);

create policy "update own user_data"
on public.user_data
for update
to authenticated
using (
  username = (auth.jwt() -> 'user_metadata' ->> 'night_city_username')
)
with check (
  username = (auth.jwt() -> 'user_metadata' ->> 'night_city_username')
);

create policy "delete own user_data"
on public.user_data
for delete
to authenticated
using (
  username = (auth.jwt() -> 'user_metadata' ->> 'night_city_username')
);

-- Optional cleanup after Auth migration:
-- delete from public.user_data where data_key = 'pwd_hash';
