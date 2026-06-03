# NIGHT CITY - LIFE SYSTEM

Personal routine dashboard with a cyberpunk HUD style, GitHub Pages hosting and Supabase sync.

The app is built to keep the daily loop simple: see the current mission, finish contracts, review the day, and keep long-term progress visible without turning routine management into another chore.

<p align="center">
  <img src="./docs/night-city-banner.svg" alt="Night City Life System" width="100%">
</p>

<p align="center">
  <a href="https://victorg-glitch.github.io/notion/">
    <img src="https://img.shields.io/badge/JACK_IN-ONLINE-fcee09?style=for-the-badge&labelColor=080810" alt="Site Online">
  </a>
  <img src="https://img.shields.io/badge/SUPABASE-SYNC-00d4ff?style=for-the-badge&labelColor=080810" alt="Supabase">
  <img src="https://img.shields.io/badge/PWA-READY-b44fff?style=for-the-badge&labelColor=080810" alt="PWA">
  <img src="https://img.shields.io/badge/CI-NODE_24-e00f3a?style=for-the-badge&labelColor=080810" alt="CI Node 24">
</p>

## Links

- Site: https://victorg-glitch.github.io/notion/
- Repo: https://github.com/Victorg-glitch/notion
- Main branch: `main`
- Main app file: `index.html`

## Stack

- Frontend: HTML, CSS and JavaScript without a framework
- Data: Supabase/PostgreSQL
- Auth: Supabase Auth with email/password and optional Google OAuth
- Hosting: GitHub Pages
- PWA: Service Worker, Web Push and manifest
- CI: GitHub Actions running Node 24

## Core Loop

The Home is the daily command center:

- Current mission
- Main actions: `+ CONTRATO`, `FOCO`, `REVISAR DIA`
- Day progress
- Next reward
- Dynamic Intel from books, projects, games and skills

Secondary modules stay in Side Deck so the first screen stays focused on routine execution.

## Features

### Contracts and Routine

- Guided onboarding for new users
- Quick templates for routine, study, training, finance, reading and sleep
- `+ CONTRATO` flow with quick mode and advanced options
- Drag and drop ordering for daily contracts
- Edit, duplicate and archive without losing history
- Automatic habits tracker based on daily contracts
- Daily review with tomorrow carry-over mission
- Focus mode with timer options 5, 15, 25 and 30 minutes

### Progress and Gamification

- Street Cred, Eddies, loot and rank feedback
- Black Market with cosmetics, utilities and templates
- Monthly Wrapped with narrative diagnosis
- Streaks, weekly consistency and historical activity data

### Districts

- Home
- Notificacoes
- Leitura
- Dev
- Violao
- Jogos
- Reflexoes
- Custom pages such as finances, training, sleep, food, shopping and agenda

### Commlink

- Friend system with nick and tag
- Chat through Supabase Realtime with fallback polling
- Public directory limited to minimal data
- Detailed profile data visible only to owner or mutual friends

### Backup and System

- JSON export/import with schema validation
- Automatic pre-import backup
- Restore previous backup from the interface
- Internal diagnostics panel for debugging without opening the console

The Diagnostics section shows:

- Current app/cache version
- Logged user label
- Last save
- Pending save state
- Service Worker status
- Push status
- Last captured JS error
- Last Supabase failure
- Current schemaVersion
- Number of saved keys

Errors are stored only in `sessionStorage`. The report masks emails, tokens, JWT-like strings and Supabase keys before showing or copying.

## Architecture

| File | Purpose |
| --- | --- |
| `index.html` | Static HTML shell, pages and module loading order |
| `style.css` | HUD visuals, responsive layout, animations and mobile polish |
| `app-config.js` | Supabase URL/key, profiles, themes and public config |
| `app.js` | Main remaining app logic, rendering and global orchestration |
| `modules/state.js` | Save keys, date helpers and conservative normalizers |
| `modules/security.js` | `htmlEscape`, `jsString` and validation helpers |
| `modules/auth.js` | Supabase Auth, password reset, Google OAuth handoff |
| `modules/ui.js` | Shared UI helpers and guided empty states |
| `modules/migrations.js` | `schemaVersion`, `migrateData()` and compatibility migrations |
| `modules/routines.js` | Routine rendering and editing |
| `modules/notifications.js` | Local reminders, Web Push setup and notification diagnostics |
| `modules/storage.js` | Save queue, backup export/import and restore flow |
| `modules/gamification.js` | Street Cred, Eddies, loot, Black Market, seasons, achievements and Wrapped |
| `modules/events.js` | Central event delegation using `data-action` attributes |
| `sw.js` | Service Worker for PWA, cache and push notifications |
| `manifest.webmanifest` | PWA manifest |
| `.github/workflows/check.yml` | GitHub Actions workflow with Node 24 |
| `scripts/check.cjs` | Minimum acceptance check for syntax, assets, CSP and security rules |
| `scripts/flow-check.cjs` | Static flow checks |
| `scripts/migration-check.cjs` | Migration and schema preservation checks |
| `supabase/security-hardening.sql` | Production RLS and privacy policies |
| `supabase/push-notifications.sql` | Push subscription schema |
| `supabase/schedule-reminders.sql` | Reminder scheduling helpers |

## Security Criteria

Every push and pull request must pass:

```bash
node scripts/check.cjs
```

Expected output:

```text
Night City check OK
```

The check validates the current hardening baseline:

- no `onclick`, `oninput`, `onchange`, `onkeydown`, `onsubmit` or `ondblclick` in `index.html`
- no `.onclick =` assignments
- no `unsafe-inline` in `script-src`
- required modules loaded before `app.js`
- backup import validates and confirms before replacing data
- `migrateData()` and `schemaVersion` exist
- `security-hardening.sql` does not expose `friend_profiles` with open `using (true)`

## Supabase

- Project URL: `https://wmglywfsrlcpsspouufp.supabase.co`
- Public anon key is intentionally public and must be protected by RLS
- Main data table: `user_data`
- Auth identity is used for production isolation
- Commlink profile details are restricted by owner/mutual-friend policies

Important tables:

- `user_data`
- `push_subscriptions`
- `push_delivery_log`
- `friend_profiles`
- `friend_messages`

## Data Model

The app preserves existing data and uses `schemaVersion` for compatibility.

Main saved keys:

- `tasks`
- `habits`
- `taskDefs`
- `habitDefs`
- `routines`
- `districts`
- `books`
- `projects`
- `devlog`
- `guitarlog`
- `games`
- `reflexoes`
- `skills`
- `prefs`
- `reminders`
- `dailyReviews`
- `quests`

Unknown fields are preserved by migrations.

## Local Development

No build step is required. The app is served as static files.

Run the acceptance check:

```bash
node scripts/check.cjs
```

Serve locally with any static server if you need browser testing. GitHub Pages is the production target:

```text
https://victorg-glitch.github.io/notion/
```

## Deployment

Push to `main`:

```bash
git push origin main
```

GitHub Actions runs `Night City Checks`. The site updates through GitHub Pages after the push.

## Roadmap

- Extract `modules/commlink.js`
- Extract `modules/focus.js`
- Extract `modules/charts.js`
- Continue reducing `app.js` by domain
- Add richer historical charts by goal and habit
- Improve notification scheduling per area
- Add more guided templates for users starting from zero

Completed hardening milestones:

- CSP script hardening without `unsafe-inline`
- Inline event handlers migrated to delegated events
- GitHub Actions on Node 24
- Internal diagnostics panel
- Gamification extracted to `modules/gamification.js`
- Backup restore flow with preview and validation

