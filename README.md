# NIGHT CITY // LIFE SYSTEM

> Personal routine dashboard with a Cyberpunk HUD aesthetic, Supabase sync, PWA support and cross-device reminders.

```txt
STATUS: ONLINE
PROFILE SLOTS: VICTOR / CAIO
STACK: HTML + CSS + JS + SUPABASE
DEPLOY: GITHUB PAGES
```

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-online-fcee09?style=for-the-badge&labelColor=080810)](https://victorg-glitch.github.io/notion/)
[![Supabase](https://img.shields.io/badge/Supabase-sync-00d4ff?style=for-the-badge&labelColor=080810)](https://supabase.com/)
[![PWA](https://img.shields.io/badge/PWA-ready-b44fff?style=for-the-badge&labelColor=080810)](./manifest.webmanifest)

## Access Point

- Site: https://victorg-glitch.github.io/notion/
- Repository: https://github.com/Victorg-glitch/notion
- Main file: `index.html`
- Service worker: `sw.js`
- Push backend: `supabase/functions/send-reminders/index.ts`

## System Briefing

`NIGHT CITY - LIFE SYSTEM` e um painel pessoal de rotina inspirado em interface cyberpunk. Ele organiza contratos diarios, habitos, leitura, estudos de dev, violao, jogos, reflexoes e metas pessoais.

O sistema possui dois perfis separados:

| User | Role | Mode |
| --- | --- | --- |
| Victor | Netrunner | rotina principal |
| Caio | Corpo | rotina separada |

Cada perfil tem senha propria, sessao persistente e dados sincronizados no Supabase.

## Tech Loadout

| Layer | Tech |
| --- | --- |
| Frontend | HTML, CSS e JavaScript puro |
| Database | Supabase/PostgreSQL |
| Auth local | SHA-256 no navegador + salt fixo |
| Hosting | GitHub Pages |
| Push | Service Worker + Web Push + Supabase Edge Function |
| PWA | `manifest.webmanifest` + `sw.js` |
| Fonts | Orbitron, Rajdhani, Share Tech Mono |

## District Map

| District | Route | Payload |
| --- | --- | --- |
| Home | `home` | Contratos do dia, Intel e indicadores compactos |
| Notificacoes | `notificacoes` | Lembretes locais, Web Push, status do aparelho e testes |
| Leitura | `leitura` | Livros, status de leitura e meta mensal |
| Dev | `dev` | Skill tree, projetos e log de estudo |
| Violao | `violao` | Streak, tecnicas e log de pratica |
| Jogos | `jogos` | Biblioteca e jogo atual |
| Reflexoes | `reflexoes` | Diario pessoal |

## Main Features

- Contratos do dia personalizaveis.
- Habits tracker automatico baseado nos contratos marcados.
- Painel de consistencia por semana e mes.
- Auto-reset semanal com resumo da semana anterior.
- Intel atual dinamica, puxando livro, projeto, jogo e skill prioritaria.
- Metas configuraveis para leitura, violao e fallbacks do Intel.
- Modo amigo com pedido de permissao e visualizacao somente leitura.
- Distritos editaveis e sincronizados com a navbar.
- Home limpa com modulos secundarios movidos para o `Side Deck`.
- Central de configuracoes dentro do `Side Deck`, com atalhos para editar contratos, metas, rotinas, distritos, skills, notificacoes e paginas custom.
- Paginas custom com estados vazios orientados a acao e treino com progresso visual de carga por exercicio.
- Temas visuais: Arasaka, Netrunner, Maelstrom e Corpo.
- Interface mobile com topbar, bottom nav, scanlines, HUD motion e feedback de toque.
- Notificacoes com tela aberta e Web Push com tela fechada.
- Backup, copia JSON e importacao do perfil pela aba `Notificacoes`.

## Supabase Grid

Project URL:

```txt
https://wmglywfsrlcpsspouufp.supabase.co
```

Public anon key:

```txt
sb_publishable_X6xbf9gD2JxmBXxthWG6lQ_gM5hvxeW
```

Main table:

```txt
user_data(username, data_key, data_value, updated_at)
```

RLS fica ativado com politicas publicas de leitura/escrita para o app pessoal.

### Data Keys

| Key | Content |
| --- | --- |
| `pwd_hash` | Hash SHA-256 da senha |
| `tasks` | Checks dos contratos por dia |
| `habits` | Historico semanal gerado pelos contratos |
| `taskDefs` | Contratos customizados |
| `habitDefs` | Habitos legados |
| `routines` | Rotinas customizadas |
| `skillDefs` | Skills de Dev |
| `guitarSkillDefs` | Tecnicas de Violao |
| `districts` | Distritos customizados |
| `books` | Livros |
| `projects` | Projetos |
| `devlog` | Log de estudo |
| `guitarlog` | Log de violao |
| `games` | Jogos |
| `reflexoes` | Diario/reflexoes |
| `skills` | Pontuacao de skills e tecnicas |
| `lastSeenWeek` | Ultima semana aberta |
| `goals` | Metas configuraveis |
| `reminders` | Configuracao dos lembretes |
| `customPages` | Conteudo das paginas custom dos distritos |
| `pageObjectives` | Objetivo principal por pagina/distrito |

## Backup Protocol

A aba `Notificacoes` inclui um bloco de manutencao para:

- Exportar um JSON do perfil atual.
- Copiar o JSON para a area de transferencia.
- Importar um backup e sincronizar novamente no Supabase.
- Conferir usuario, ultimo salvamento, chaves ativas e status da sessao.

## Notification System

O sistema possui dois niveis de notificacao.

### Local alert

Funciona quando o site/app esta aberto ou em segundo plano permitido pelo navegador.

- Usa `Notification API`.
- Usa barra visual cyberpunk dentro do app.
- Possui teste pela aba `Notificacoes`.

### Closed-screen Web Push

Funciona com o site fechado, desde que o aparelho permita Web Push.

Arquivos envolvidos:

```txt
sw.js
manifest.webmanifest
supabase/push-notifications.sql
supabase/schedule-reminders.sql
supabase/functions/send-reminders/index.ts
```

Fluxo:

```txt
Browser/PWA -> Push subscription -> Supabase table
Supabase Cron -> Edge Function -> Web Push provider -> Device notification
```

No aparelho, use:

```txt
Notificacoes > PERMITIR NESTE APARELHO
Notificacoes > ATIVAR TELA FECHADA
Notificacoes > TESTAR TELA FECHADA
```

## Auth Protocol

- Senha hasheada com `crypto.subtle.digest('SHA-256')`.
- Salt fixo: `night_city_salt`.
- Sessao persistente: `localStorage` com chave `nc_session_v2`.
- Primeiro acesso cria senha.
- Acessos seguintes comparam hash salvo no Supabase.

## Friend Mode

A acao `AMIGO` permite ver o outro perfil somente depois de permissao.

```txt
REQUEST -> PENDING -> APPROVED / DENIED
```

Quando aprovado:

- carrega os dados do amigo;
- mostra banner de somente leitura;
- bloqueia edicao, exclusao, checks, pontuacoes e salvamento;
- permite voltar ao proprio perfil.

## Visual System

O visual usa:

- scanlines;
- grid neon;
- glitch no titulo;
- cards com bordas HUD;
- tabs com loading bar;
- icones SVG cyberpunk;
- mobile holo layer;
- feedback visual em toque/checks;
- temas baseados em variaveis CSS.
- controles principais navegaveis por teclado.

Motion policy:

- Animacoes fortes ficam em interacoes, troca de pagina, drawer, modulos, notificacoes e salvamento.
- Pulsos e scans permanentes foram reduzidos para melhorar leitura e desempenho no celular.

Theme presets:

| Theme | Accent |
| --- | --- |
| Arasaka | amarelo |
| Netrunner | azul |
| Maelstrom | vermelho |
| Corpo | roxo |

## Maintenance Loop

Antes de subir mudancas:

```txt
node --check app.js
node --check sw.js
node -e "JSON.parse(require('fs').readFileSync('manifest.webmanifest','utf8'))"
git diff --check
```

Os arquivos do app devem permanecer em UTF-8. Se acentos ou emojis aparecerem quebrados no terminal, valide no navegador antes de editar, porque PowerShell antigo pode renderizar UTF-8 incorretamente mesmo quando o arquivo esta correto.

Para validar o app estatico localmente:

```txt
python -m http.server 8765
```

Depois abra:

```txt
http://127.0.0.1:8765/
```

## Deployment

GitHub Pages serve o app estatico:

```txt
index.html
sw.js
manifest.webmanifest
icon.svg
```

Supabase roda:

```txt
Edge Function: send-reminders
Cron: night-city-reminders-every-minute
Tables: user_data, push_subscriptions, push_delivery_log
```

## Operator Notes

Depois de alteracoes em `index.html`, subir:

```bash
git add .
git commit -m "Update Night City system"
git push origin main
```

Depois de alteracoes na Edge Function:

```bash
supabase functions deploy send-reminders --use-api --no-verify-jwt
```

Depois de alteracoes SQL:

```bash
supabase db query --linked --file supabase/push-notifications.sql
supabase db query --linked --file supabase/schedule-reminders.sql
```

## Roadmap

- Melhor painel de historico mensal.
- Graficos mais detalhados de consistencia.
- Edicao visual mais avancada dos distritos.
- Exportacao/backup dos dados.
- Mais presets de tema.

```txt
// NIGHT CITY LIFE SYSTEM
// STAY CONSISTENT. STAY ONLINE.
```
