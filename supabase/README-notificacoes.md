# Notificacoes com site fechado

Navegador nao executa `setInterval` quando a pagina esta fechada. Para notificar com o app/site fechado, use Web Push:

1. Gere chaves VAPID:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Cole a public key em `WEB_PUSH_PUBLIC_KEY` no `app-config.js`.
3. Rode `supabase/push-notifications.sql` no SQL editor do Supabase.
4. Configure secrets da Edge Function:
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." VAPID_SUBJECT="mailto:seu-email@exemplo.com"
   ```
   Opcional para proteger chamadas de cron:
   ```bash
   supabase secrets set SEND_REMINDERS_SECRET="um-segredo-longo"
   ```
5. Deploy:
   ```bash
   supabase functions deploy send-reminders --use-api --no-verify-jwt
   ```
6. Crie um cron a cada minuto chamando a function `send-reminders`:
   ```bash
   supabase db query --linked --file supabase/schedule-reminders.sql
   ```
7. Abra a aba Notificacoes em cada aparelho e clique em `ATIVAR TELA FECHADA`.

Sem esse backend agendado, o app so consegue avisar enquanto a pagina esta aberta ou em segundo plano permitido pelo navegador.

Seguranca:

- `push_subscriptions` usa RLS por `auth.uid()`.
- O teste manual enviado pelo app exige JWT da sessao Supabase.
- Se `SEND_REMINDERS_SECRET` for configurado, chamadas de cron devem enviar header `x-night-city-cron`.
