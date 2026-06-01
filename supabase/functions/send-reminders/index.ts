// Supabase Edge Function: send-reminders
// Deploy:
//   supabase functions deploy send-reminders
// Env vars:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// Schedule every minute with Supabase Cron calling this function.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';
const TZ = Deno.env.get('REMINDER_TIMEZONE') || 'America/Sao_Paulo';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Reminder = { id: string; name: string; time: string; enabled: boolean; message: string };

function localParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hm: `${parts.hour}:${parts.minute}`
  };
}

function remindersFromValue(value: unknown): Reminder[] {
  if (!value || typeof value !== 'object') return [];
  return Object.values(value as Record<string, Reminder>).filter(r => r && r.enabled && r.time);
}

Deno.serve(async () => {
  const { date, hm } = localParts();

  const { data: subs, error: subsError } = await sb
    .from('push_subscriptions')
    .select('endpoint, username, subscription')
    .eq('enabled', true);
  if (subsError) return new Response(JSON.stringify({ error: subsError.message }), { status: 500 });

  const usernames = [...new Set((subs || []).map(s => s.username))];
  const { data: rows, error: dataError } = await sb
    .from('user_data')
    .select('username,data_value')
    .eq('data_key', 'reminders')
    .in('username', usernames.length ? usernames : ['__none__']);
  if (dataError) return new Response(JSON.stringify({ error: dataError.message }), { status: 500 });

  const byUser = new Map<string, Reminder[]>();
  (rows || []).forEach(row => byUser.set(row.username, remindersFromValue(row.data_value)));

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const sub of subs || []) {
    const due = (byUser.get(sub.username) || []).filter(r => r.time === hm);
    for (const r of due) {
      const { error: logError } = await sb.from('push_delivery_log').insert({
        endpoint: sub.endpoint,
        username: sub.username,
        reminder_id: r.id,
        delivery_date: date
      });
      if (logError) { skipped++; continue; }

      try {
        await webpush.sendNotification(sub.subscription, JSON.stringify({
          title: `Night City - ${r.name}`,
          body: r.message,
          tag: `nc-${r.id}`,
          url: '/notion/index.html',
          requireInteraction: false
        }));
        sent++;
      } catch (e) {
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await sb.from('push_subscriptions').update({ enabled: false }).eq('endpoint', sub.endpoint);
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, timezone: TZ, hm, date, sent, skipped, failed }), {
    headers: { 'content-type': 'application/json' }
  });
});
