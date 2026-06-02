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
