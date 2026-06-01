// Supabase Edge Function: send-reminders
// Deploy:
//   supabase functions deploy send-reminders --use-api --no-verify-jwt
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

Deno.serve(async (req) => {
  const { date, hm } = localParts();
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }
  const isTest = body.test === true;
  const onlyUser = typeof body.username === 'string' ? body.username : null;

  let subsQuery = sb
    .from('push_subscriptions')
    .select('endpoint, username, subscription')
    .eq('enabled', true);
  if (onlyUser) subsQuery = subsQuery.eq('username', onlyUser);
  const { data: subs, error: subsError } = await subsQuery;
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
  const results: Array<{ username: string; endpoint: string; reminder?: string; status: string; detail?: string }> = [];

  for (const sub of subs || []) {
    const due = isTest
      ? [{ id: 'test', name: 'Teste', time: hm, enabled: true, message: 'Teste de push do Night City.' }]
      : (byUser.get(sub.username) || []).filter(r => r.time === hm);
    for (const r of due) {
      if (!isTest) {
        const { data: alreadySent, error: sentCheckError } = await sb
          .from('push_delivery_log')
          .select('id')
          .eq('endpoint', sub.endpoint)
          .eq('reminder_id', r.id)
          .eq('delivery_date', date)
          .eq('status', 'sent')
          .maybeSingle();
        if (sentCheckError) {
          failed++;
          results.push({ username: sub.username, endpoint: sub.endpoint, reminder: r.id, status: 'log-check-error', detail: sentCheckError.message });
          continue;
        }
        if (alreadySent) {
          skipped++;
          results.push({ username: sub.username, endpoint: sub.endpoint, reminder: r.id, status: 'skipped' });
          continue;
        }
      }

      try {
        const response = await webpush.sendNotification(sub.subscription, JSON.stringify({
          title: `Night City - ${r.name}`,
          body: r.message,
          tag: `nc-${r.id}`,
          url: '/notion/index.html',
          requireInteraction: false
        }));
        if (!isTest) {
          await sb.from('push_delivery_log').upsert({
            endpoint: sub.endpoint,
            username: sub.username,
            reminder_id: r.id,
            delivery_date: date,
            status: 'sent',
            error: null
          }, { onConflict: 'endpoint,reminder_id,delivery_date' });
        }
        sent++;
        results.push({ username: sub.username, endpoint: sub.endpoint, reminder: r.id, status: 'sent', detail: String(response?.statusCode || '') });
      } catch (e) {
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        const message = e instanceof Error ? e.message : String(e);
        if (!isTest) {
          await sb.from('push_delivery_log').upsert({
            endpoint: sub.endpoint,
            username: sub.username,
            reminder_id: r.id,
            delivery_date: date,
            status: 'failed',
            error: `${status || ''} ${message}`.trim()
          }, { onConflict: 'endpoint,reminder_id,delivery_date' });
        }
        results.push({ username: sub.username, endpoint: sub.endpoint, reminder: r.id, status: 'failed', detail: `${status || ''} ${message}`.trim() });
        if (status === 404 || status === 410) {
          await sb.from('push_subscriptions').update({ enabled: false }).eq('endpoint', sub.endpoint);
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, test: isTest, timezone: TZ, hm, date, sent, skipped, failed, results }), {
    headers: { 'content-type': 'application/json' }
  });
});
