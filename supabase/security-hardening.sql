-- NIGHT CITY // security hardening
--
-- Final Auth model:
--   user_data.username = auth.uid()::text
--   push_subscriptions.username = auth.uid()::text

alter table public.user_data enable row level security;

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
using (username = auth.uid()::text);

create policy "insert own user_data"
on public.user_data
for insert
to authenticated
with check (username = auth.uid()::text);

create policy "update own user_data"
on public.user_data
for update
to authenticated
using (username = auth.uid()::text)
with check (username = auth.uid()::text);

create policy "delete own user_data"
on public.user_data
for delete
to authenticated
using (username = auth.uid()::text);

delete from public.user_data where data_key = 'pwd_hash';

alter table public.push_subscriptions enable row level security;
alter table public.push_delivery_log enable row level security;

drop policy if exists "push_subscriptions_upsert_anon" on public.push_subscriptions;
drop policy if exists "push_subscriptions_own_select" on public.push_subscriptions;
drop policy if exists "push_subscriptions_own_insert" on public.push_subscriptions;
drop policy if exists "push_subscriptions_own_update" on public.push_subscriptions;
drop policy if exists "push_subscriptions_own_delete" on public.push_subscriptions;

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create policy "push_subscriptions_own_select"
on public.push_subscriptions
for select
to authenticated
using (username = auth.uid()::text);

create policy "push_subscriptions_own_insert"
on public.push_subscriptions
for insert
to authenticated
with check (username = auth.uid()::text);

create policy "push_subscriptions_own_update"
on public.push_subscriptions
for update
to authenticated
using (username = auth.uid()::text)
with check (username = auth.uid()::text);

create policy "push_subscriptions_own_delete"
on public.push_subscriptions
for delete
to authenticated
using (username = auth.uid()::text);

drop policy if exists "push_delivery_log_own_select" on public.push_delivery_log;

revoke all on public.push_delivery_log from anon;
grant select on public.push_delivery_log to authenticated;

create policy "push_delivery_log_own_select"
on public.push_delivery_log
for select
to authenticated
using (username = auth.uid()::text);

alter table public.friend_messages enable row level security;

drop policy if exists "friend_messages_own_select" on public.friend_messages;
drop policy if exists "friend_messages_own_insert" on public.friend_messages;

revoke all on public.friend_messages from anon;
grant select, insert on public.friend_messages to authenticated;

create policy "friend_messages_own_select"
on public.friend_messages
for select
to authenticated
using (sender = auth.uid()::text or receiver = auth.uid()::text);

create policy "friend_messages_own_insert"
on public.friend_messages
for insert
to authenticated
with check (sender = auth.uid()::text);

create table if not exists public.friend_profiles (
  owner text primary key,
  nick text not null default '',
  tag text not null default '0000',
  name text not null default '',
  status text not null default '',
  bio text not null default '',
  level integer not null default 1,
  books_done integer not null default 0,
  projects_done integer not null default 0,
  games_done integer not null default 0,
  logs_done integer not null default 0,
  provider_google boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.friend_profiles add column if not exists nick text not null default '';
alter table public.friend_profiles add column if not exists tag text not null default '0000';
alter table public.friend_profiles add column if not exists provider_google boolean not null default false;
create index if not exists friend_profiles_nick_tag_idx on public.friend_profiles(nick, tag);

alter table public.friend_profiles enable row level security;

drop policy if exists "friend_profiles_read_authenticated" on public.friend_profiles;
drop policy if exists "friend_profiles_write_own" on public.friend_profiles;
drop policy if exists "friend_profiles_update_own" on public.friend_profiles;

revoke all on public.friend_profiles from anon;
grant select, insert, update on public.friend_profiles to authenticated;

create policy "friend_profiles_read_authenticated"
on public.friend_profiles
for select
to authenticated
using (true);

create policy "friend_profiles_write_own"
on public.friend_profiles
for insert
to authenticated
with check (owner = auth.uid()::text);

create policy "friend_profiles_update_own"
on public.friend_profiles
for update
to authenticated
using (owner = auth.uid()::text)
with check (owner = auth.uid()::text);
