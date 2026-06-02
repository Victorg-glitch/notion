create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  perform cron.unschedule('night-city-reminders-every-minute');
exception when others then
  null;
end $$;

select cron.schedule(
  'night-city-reminders-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://wmglywfsrlcpsspouufp.supabase.co/functions/v1/send-reminders',
    -- Troque CHANGE_ME_SEND_REMINDERS_SECRET pelo mesmo valor salvo em:
    -- supabase secrets set SEND_REMINDERS_SECRET="..."
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-night-city-cron','CHANGE_ME_SEND_REMINDERS_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
