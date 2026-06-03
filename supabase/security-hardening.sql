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
alter table public.friend_profiles add column if not exists name text not null default '';
alter table public.friend_profiles add column if not exists status text not null default '';
alter table public.friend_profiles add column if not exists bio text not null default '';
alter table public.friend_profiles add column if not exists level integer not null default 1;
alter table public.friend_profiles add column if not exists books_done integer not null default 0;
alter table public.friend_profiles add column if not exists projects_done integer not null default 0;
alter table public.friend_profiles add column if not exists games_done integer not null default 0;
alter table public.friend_profiles add column if not exists logs_done integer not null default 0;
alter table public.friend_profiles add column if not exists provider_google boolean not null default false;
alter table public.friend_profiles add column if not exists updated_at timestamptz not null default now();
create index if not exists friend_profiles_nick_tag_idx on public.friend_profiles(nick, tag);
create index if not exists friend_profiles_owner_updated_idx on public.friend_profiles(owner, updated_at desc);

create or replace function public.friend_profile_can_view_details(profile_owner text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select profile_owner = auth.uid()::text
    or (
      exists (
        select 1
        from public.user_data viewer
        where viewer.username = auth.uid()::text
          and (
            (viewer.data_key = 'friendTargets' and viewer.data_value ? profile_owner)
            or (viewer.data_key = 'friendTarget' and viewer.data_value = to_jsonb(profile_owner))
          )
      )
      and exists (
        select 1
        from public.user_data profile_owner_data
        where profile_owner_data.username = profile_owner
          and (
            (profile_owner_data.data_key = 'friendTargets' and profile_owner_data.data_value ? auth.uid()::text)
            or (profile_owner_data.data_key = 'friendTarget' and profile_owner_data.data_value = to_jsonb(auth.uid()::text))
          )
      )
    );
$$;

revoke all on function public.friend_profile_can_view_details(text) from public;
revoke all on function public.friend_profile_can_view_details(text) from anon;
grant execute on function public.friend_profile_can_view_details(text) to authenticated;

alter table public.friend_profiles enable row level security;

-- Remove a policy antiga aberta, caso ainda exista em producao.
-- Nao recriar friend_profiles_read_authenticated: detalhes so via owner/amizade mutua.
drop policy if exists "friend_profiles_read_authenticated" on public.friend_profiles;
drop policy if exists "friend_profiles_read_own_or_mutual" on public.friend_profiles;
drop policy if exists "friend_profiles_write_own" on public.friend_profiles;
drop policy if exists "friend_profiles_update_own" on public.friend_profiles;

revoke all on public.friend_profiles from anon;
grant select, insert, update on public.friend_profiles to authenticated;

create policy "friend_profiles_read_own_or_mutual"
on public.friend_profiles
for select
to authenticated
using (public.friend_profile_can_view_details(owner));

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

drop view if exists public.friend_profile_directory;
create view public.friend_profile_directory
with (security_invoker = true, security_barrier = true) as
select owner, nick, tag, name, level, updated_at
from public.friend_profiles
where coalesce(nick,'') <> ''
  and coalesce(tag,'') <> '';

revoke all on public.friend_profile_directory from public;
revoke all on public.friend_profile_directory from anon;
revoke all on public.friend_profile_directory from authenticated;
grant select on public.friend_profile_directory to authenticated;

create table if not exists public.friend_shared_sections (
  owner text not null,
  section text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner, section),
  constraint friend_shared_sections_section_check check (
    section in ('home','leitura','dev','violao','jogos','reflexoes','distritos','custom')
  )
);

alter table public.friend_shared_sections enable row level security;

drop policy if exists "friend_shared_sections_read_mutual" on public.friend_shared_sections;
drop policy if exists "friend_shared_sections_insert_own" on public.friend_shared_sections;
drop policy if exists "friend_shared_sections_update_own" on public.friend_shared_sections;
drop policy if exists "friend_shared_sections_delete_own" on public.friend_shared_sections;

revoke all on public.friend_shared_sections from public;
revoke all on public.friend_shared_sections from anon;
revoke all on public.friend_shared_sections from authenticated;
grant select, insert, update, delete on public.friend_shared_sections to authenticated;

create policy "friend_shared_sections_read_mutual"
on public.friend_shared_sections
for select
to authenticated
using (public.friend_profile_can_view_details(owner));

create policy "friend_shared_sections_insert_own"
on public.friend_shared_sections
for insert
to authenticated
with check (owner = auth.uid()::text);

create policy "friend_shared_sections_update_own"
on public.friend_shared_sections
for update
to authenticated
using (owner = auth.uid()::text)
with check (owner = auth.uid()::text);

create policy "friend_shared_sections_delete_own"
on public.friend_shared_sections
for delete
to authenticated
using (owner = auth.uid()::text);
