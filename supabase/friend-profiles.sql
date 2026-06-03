-- NIGHT CITY // Commlink profiles
-- A tabela guarda perfil completo. A busca publica usa friend_profile_directory,
-- que expoe apenas owner, nick, tag, name e level.

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
create view public.friend_profile_directory as
select owner, nick, tag, name, level
from public.friend_profiles
where coalesce(nick,'') <> ''
  and coalesce(tag,'') <> '';

revoke all on public.friend_profile_directory from anon;
grant select on public.friend_profile_directory to authenticated;
