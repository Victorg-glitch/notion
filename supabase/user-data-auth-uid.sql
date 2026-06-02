-- NIGHT CITY // user_data Auth UID ownership
--
-- New account model:
--   user_data.username = auth.uid()::text
--
alter table public.user_data enable row level security;

drop policy if exists "read own user_data" on public.user_data;
drop policy if exists "insert own user_data" on public.user_data;
drop policy if exists "update own user_data" on public.user_data;
drop policy if exists "delete own user_data" on public.user_data;

grant select, insert, update, delete on public.user_data to authenticated;

create policy "read own user_data"
on public.user_data
for select
to authenticated
using (
  username = auth.uid()::text
);

create policy "insert own user_data"
on public.user_data
for insert
to authenticated
with check (
  username = auth.uid()::text
);

create policy "update own user_data"
on public.user_data
for update
to authenticated
using (
  username = auth.uid()::text
)
with check (
  username = auth.uid()::text
);

create policy "delete own user_data"
on public.user_data
for delete
to authenticated
using (
  username = auth.uid()::text
);
