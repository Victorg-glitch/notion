<p align="center">
  <img src="./docs/night-city-banner.svg" alt="Night City Life System cyberpunk banner" width="100%">
</p>

# NIGHT CITY // LIFE SYSTEM

> Personal routine dashboard with a Cyberpunk HUD aesthetic, Supabase sync, PWA support, Side Deck modules and cross-device reminders.

<p>
  <a href="https://victorg-glitch.github.io/notion/"><img src="https://img.shields.io/badge/GitHub%20Pages-online-fcee09?style=for-the-badge&labelColor=080810" alt="GitHub Pages"></a>
  <img src="https://img.shields.io/badge/Supabase-sync-00d4ff?style=for-the-badge&labelColor=080810" alt="Supabase">
  <img src="https://img.shields.io/badge/PWA-ready-b44fff?style=for-the-badge&labelColor=080810" alt="PWA">
  <a href="#motion-policy"><img src="https://img.shields.io/badge/Motion-user%20controlled-e00f3a?style=for-the-badge&labelColor=080810" alt="Motion controlled"></a>
</p>

```txt
STATUS: ONLINE
PROFILE SLOTS: VICTOR / CAIO
STACK: HTML + CSS + JS + SUPABASE
DEPLOY: GITHUB PAGES
HUD: ARASAKA / NETRUNNER / MAELSTROM / CORPO
```

## Access Point

- Site: https://victorg-glitch.github.io/notion/
- Repository: https://github.com/Victorg-glitch/notion
- Main file: `index.html`
- Config file: `app-config.js`
- Service worker: `sw.js`
- Push backend: `supabase/functions/send-reminders/index.ts`

## System Briefing

`NIGHT CITY - LIFE SYSTEM` e um painel pessoal de rotina inspirado em interfaces cyberpunk. Ele organiza contratos diarios, habitos, leitura, estudos de dev, violao, jogos, reflexoes, treino, financas e metas pessoais.

| User | Role | Mode |
| --- | --- | --- |
| Victor | Criador | recebe presets iniciais |
| Outros usuarios | Usuario | comecam sem objetivos pre-definidos |

Cada perfil tem senha propria, sessao persistente e dados sincronizados no Supabase.
O perfil criador e identificado pelo email `victorgabrilvc@gmail.com`; os demais perfis aparecem como `USUARIO`.

## Neon Palette

| Token | Color | Use |
| --- | --- | --- |
| `--y` | `#fcee09` | Arasaka, foco e chamadas principais |
| `--c` | `#00d4ff` | Netrunner, HUD e notificacoes |
| `--r` | `#e00f3a` | Maelstrom, alertas e perigo |
| `--p` | `#b44fff` | Corpo, configuracoes e modais |
| `--bg` | `#080810` | Fundo Night City |

## District Map

| District | Route | Payload |
| --- | --- | --- |
| Home | `home` | Contratos do dia, Intel e indicadores compactos |
| Notificacoes | `notificacoes` | Lembretes locais, Web Push, status e backup |
| Leitura | `leitura` | Livros, leitura atual e meta mensal |
| Dev | `dev` | Skill tree, projetos e log de estudo |
| Violao | `violao` | Streak, tecnicas e log de pratica |
| Jogos | `jogos` | Biblioteca e jogo atual |
| Reflexoes | `reflexoes` | Diario pessoal |
| Custom | templates | Financas, cartao, investimentos, compras, casa, agenda, comida, sono, metas, treino e cardio |

## Main Features

- Contratos do dia personalizaveis.
- Habits tracker automatico baseado nos contratos marcados.
- Painel de consistencia por semana e mes.
- Graficos historicos de consistencia por semana e progresso mensal por meta.
- Auto-reset semanal com resumo da semana anterior.
- Intel atual dinamica, puxando livro, projeto, jogo e skill prioritaria.
- Metas configuraveis para leitura, violao e fallbacks do Intel.
- `Side Deck` para modulos secundarios e central de configuracoes.
- Busca global por livros, projetos, jogos, reflexoes, logs e objetivos, com filtros por categoria.
- Modo amigo em formato Commlink com central de contatos, sugestoes por proximidade, nick `nome#tag`, selecao de amigo e tela de mensagens com botao voltar.
- O perfil criador do Victor usa a tag fixa `#01`; demais usuarios recebem tag automatica de 4 digitos.
- O Commlink e o perfil nao abrem automaticamente no refresh; o login fica oculto durante a checagem de sessao para evitar flicker.
- Modal proprio de confirmacao cyberpunk antes de excluir, resetar semana ou importar backup.
- Fila local de salvamento pendente quando o Supabase falha, com reenvio manual e tentativa automatica ao voltar online.
- Templates guiados para criar novos distritos.
- Controle de movimento: `Alta`, `Baixa` ou `Desligada`.
- Controles principais com foco visivel, contraste melhorado e botoes reais nas acoes de edicao.
- Backup completo ou seletivo por area, copia JSON e importacao pela aba `Notificacoes`.

## Code Organization

| File | Purpose |
| --- | --- |
| `app-config.js` | configuracao publica, perfis e temas |
| `modules/auth.js` | login Supabase Auth, migracao legado/Auth e sessao |
| `app.js` | logica principal do app, renderizacao, notificacoes e estado |
| `style.css` | visual, layout responsivo, acessibilidade e animacoes |
| `sw.js` | service worker para notificacoes e PWA |
| `scripts/check.cjs` | verificacao local de manutencao |
| `docs/night-city-banner.svg` | banner cyberpunk do README |
| `supabase/friend-profiles.sql` | tabela publica controlada para perfil de contatos do Commlink |
| `supabase/friend-messages.sql` | tabela e RLS do chat entre amigos |
| `supabase/user-data-auth-hardening.sql` | SQL aplicado para RLS por usuario autenticado |
| `supabase/rls-audit.sql` | consulta de auditoria para tabelas e politicas RLS futuras |

## Supabase Grid

```txt
Project URL: https://wmglywfsrlcpsspouufp.supabase.co
Main table: user_data(username, data_key, data_value, updated_at)
Friend profile table: friend_profiles(owner, nick, tag, name, status, bio, level, counters)
Chat table: friend_messages(channel_id, sender, receiver, body, created_at)
RLS: ativo em producao; apenas `authenticated` pode ler/escrever o proprio `username`
```

### Data Keys

| Key | Content |
| --- | --- |
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
| `profile` | Perfil publico do usuario no Commlink |
| `friendTarget` | ID da conta amiga conectada ao Commlink |
| `friendTargets` | Lista de contatos salvos no Commlink |
| `friendPermissions` | Areas liberadas para o modo amigo |
| `friendRequests` | Pedidos de permissao do modo amigo |
| `lastSeenWeek` | Ultima semana aberta |
| `goals` | Metas configuraveis |
| `reminders` | Configuracao dos lembretes |
| `customPages` | Conteudo das paginas custom dos distritos |
| `pageObjectives` | Objetivo principal por pagina/distrito |

## Notification System

### Local Alert

Funciona quando o site/app esta aberto ou em segundo plano permitido pelo navegador.

- Usa `Notification API`.
- Usa barra visual cyberpunk dentro do app.
- Possui teste pela aba `Notificacoes`.

### Closed-Screen Web Push

Funciona com o site fechado, desde que o aparelho permita Web Push.

```txt
Browser/PWA -> Push subscription -> Supabase table
Supabase Cron -> Edge Function -> Web Push provider -> Device notification
```

Arquivos envolvidos:

```txt
sw.js
manifest.webmanifest
supabase/push-notifications.sql
supabase/schedule-reminders.sql
supabase/functions/send-reminders/index.ts
```

## Security Notes

- O login principal usa `Supabase Auth` com email/senha por conta individual.
- A tela inicial abre em modo `LOGIN`; a criacao fica em uma aba separada `CRIAR CONTA`.
- O formulario tem opcao de visualizar/ocultar senha e fluxo `ESQUECI A SENHA` com email de recuperacao do Supabase.
- A tela tambem oferece `ENTRAR COM GOOGLE` via Supabase OAuth.
- A tela nao mostra mais Victor/Caio: cada pessoa informa nome, email e senha para entrar ou criar sua propria conta.
- O limite inicial client-side e de ate 5 contas conhecidas neste dispositivo (`ACCOUNT_LIMIT` em `app-config.js`).
- A criacao por email/senha envia `emailRedirectTo` para retornar ao proprio app depois da verificacao do email.
- `PUBLIC_SITE_URL` em `app-config.js` trava o retorno de email/OAuth em `https://victorg-glitch.github.io/notion/`, evitando redirecionamento acidental para `localhost`.
- O app trata limite de envio de email do Supabase com cooldown local de 1 hora (`AUTH_EMAIL_COOLDOWN_MS`) e orienta confirmar o email antes de tentar criar de novo.
- Para a verificacao por email funcionar, adicione `https://victorg-glitch.github.io/notion/` nas URLs de redirecionamento permitidas do Supabase.
- Para `ENTRAR COM GOOGLE` funcionar, ative `Authentication > Providers > Google` no Supabase, configure Client ID/Secret do Google Cloud e mantenha `https://victorg-glitch.github.io/notion/` como URL de redirect permitida.
- Em `Authentication > URL Configuration`, deixe `Site URL` como `https://victorg-glitch.github.io/notion/` e adicione a mesma URL em `Redirect URLs`.
- `GOOGLE_AUTH_ENABLED` esta ativo em `app-config.js`; se o provider Google for desligado no Supabase, mude para `false` para bloquear o botao e evitar a pagina crua `Unsupported provider`.
- As linhas em `user_data` usam `username = auth.uid()::text`; a politica final esta em `supabase/security-hardening.sql`.
- `pwd_hash` legado foi removido do banco em producao.
- `push_subscriptions` tambem usa RLS por `auth.uid()`, sem politica publica de escrita.
- `push_delivery_log` tem politica propria de leitura por `auth.uid()`; escrita fica reservada para a Edge Function com service role.
- Os renders principais de dados livres usam `htmlEscape()` para reduzir risco de XSS armazenado.
- A pagina inclui CSP via meta tag, ainda permitindo inline handlers por compatibilidade com a arquitetura atual.
- A sessao Supabase Auth usa `sessionStorage` por padrao (`AUTH_STORAGE: "session"`), reduzindo exposicao de token apos fechar a aba.
- Dados temporarios de login e email de Auth tambem usam `sessionStorage`.
- `localStorage` fica limitado a preferencias, fila local de salvamento, lembretes, lista local de contas conhecidas, pendencia de confirmacao de email e cache operacional.
- `nc_session_v2` usa `sessionStorage` como fallback de compatibilidade.
- `SEND_REMINDERS_SECRET` e obrigatorio para chamadas de cron da Edge Function `send-reminders`.
- Use `supabase/rls-audit.sql` sempre que criar nova tabela publica, porque a anon key e publica por natureza no Supabase.
- O app possui modo amigo somente leitura, com bloqueio de edicao, exclusao, checks, pontuacoes e salvamento.
- O arquivo `supabase/security-hardening.sql` foi aplicado em producao e removeu politicas publicas antigas de `user_data` e `push_subscriptions`.
- Cada usuario Auth acessa somente as linhas cujo `username` bate com o proprio `auth.uid()`.

## Visual System

- cards com bordas HUD;
- tabs com loading bar;
- icones SVG cyberpunk;
- mobile holo layer;
- feedback visual em toque/checks;
- foco visivel para teclado;
- botoes reais na navbar/topbar;
- temas baseados em variaveis CSS.

### Motion Policy

- `Alta`: ativa scans/glitches decorativos.
- `Baixa`: mantem movimento apenas em interacoes principais.
- `Desligada`: remove animacoes e transicoes.

## Maintenance Loop

Antes de subir mudancas:

```txt
node scripts/check.cjs
git diff --check
```

O `check.cjs` tambem rastreia a divida de seguranca de frontend:

```txt
inlineHandlers = handlers inline ainda dependentes de unsafe-inline
innerHTML = pontos que ainda usam HTML dinamico
unsafeInline = ocorrencias atuais na CSP
```

Enquanto `inlineHandlers` for maior que zero, a CSP precisa manter `script-src 'unsafe-inline'` para nao quebrar a interface. A proxima etapa de hardening e migrar esses handlers para `addEventListener`/delegacao segura e depois remover `unsafe-inline` do `script-src`.

Validacao local:

```txt
python -m http.server 8765
```

Abra:

```txt
http://127.0.0.1:8765/
```

Os arquivos do app devem permanecer em UTF-8. Se acentos ou emojis aparecerem quebrados no terminal, valide no navegador antes de editar, porque PowerShell antigo pode renderizar UTF-8 incorretamente mesmo quando o arquivo esta correto.

## Deployment

GitHub Pages serve o app estatico:

```txt
index.html
app-config.js
app.js
style.css
sw.js
manifest.webmanifest
icon.svg
```

Supabase roda:

```txt
Edge Function: send-reminders
Cron: night-city-reminders-every-minute
```

## Roadmap

- Continuar extraindo modulos de `app.js` por area: notificacoes, distritos e paginas custom.
