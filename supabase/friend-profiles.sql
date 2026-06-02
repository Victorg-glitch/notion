-- NIGHT CITY // public friend profiles
-- Perfil publico usado pelo Commlink para listar contatos e abrir chat sem expor user_data.

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
