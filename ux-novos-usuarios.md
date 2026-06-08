# UX para Novos Usuários — Night City Life System

> Documento de diagnóstico e recomendações para tornar o app acessível a quem nunca o viu antes.
> Baseado na leitura completa de `index.html`, `app.js` e `style.css` (build v0.4.0, 2026-06-08).

---

## 1. Diagnóstico Geral

### O que um usuário novo vê ao abrir o app pela primeira vez

1. **Tela de login** com o título "NIGHT CITY" e subtítulo "LOGIN DE OPERADOR". Nenhuma explicação do que é o app.
2. Após logar, vê a **Home** com cabeçalho `NIGHT CITY / Life System`, data, e uma citação aleatória.
3. Imediatamente abaixo: o card **MISSÃO** (Modo Hoje) e os cards da home — todos **vazios**, sem nenhum dado.
4. Na nav bar há ícones sem texto (apenas SVG), um botão "SALVAR", "PERFIL", e um seletor de tema "◈ TEMA".
5. A barra móvel inferior tem ícones sem legenda.
6. O menu lateral (hambúrguer) contém grupos: "Início", "Meus Atalhos", "Progresso", "Biblioteca", "Diário", "Mais Páginas", "Sistema".

**Resultado**: o usuário não sabe o que é o app, o que são "contratos", por que há um "STREET KID" no banner, o que fazer primeiro, nem como usar qualquer funcionalidade.

---

### Os 3 maiores pontos de confusão identificados no código

**1. Terminologia cyberpunk não explicada em nenhum lugar**

O app usa vocabulário temático desde a primeira tela (`OPERADOR`, `CONTRATO`, `DISTRICT`, `EDDIES`, `STREET CRED`) sem nenhuma definição ou contexto introdutório. O glossário de tradução (`LEXICON_PAIRS` em `app.js` linha 327) só é ativado se o usuário encontrar manualmente a opção "Vocabulário" dentro de Configurações, que por sua vez está escondida dentro do menu lateral → Sistema → Configurações.

**2. A Home exibe 6+ cards simultâneos (Contratos, Intel, Alertas, Habits, Consistência, Rotinas, Distritos, Loja) todos vazios ao mesmo tempo**

Um novo usuário vê placeholders, estados vazios sem contexto e botões com nomes como `+ CONTRATO`, `MONTAR ROTINA BASE`, `ICE`, `ESCUDOS`, sem saber o que vai acontecer se clicar. O estado vazio mais útil — o Modo Hoje — fica **fechado** por padrão (o botão "HOJE" fica na barra, não há chamada clara para ação).

**3. O Setup Wizard existe mas não é disparado automaticamente para novos usuários**

Há um modal de setup completo (`#setup-wizard` em `index.html` linha 257) com 4 passos, seleção de vocabulário (cyber vs. simples), foco, rotina e preview. Esse wizard é exatamente o que um novo usuário precisa — mas ele só aparece via `callNamed('openSetupWizard')`, sem nenhum gatilho automático claro no primeiro login. Um usuário novo que fechar a tela de login cai direto na Home vazia.

---

### Terminologia cyberpunk — o que cada termo realmente significa

| Termo no app | O que realmente é | Localização no código |
|---|---|---|
| **CONTRATO** | Uma tarefa marcável da lista diária (equivale a um to-do ou hábito) | `renderTasks()`, linha 5007 |
| **MISSÃO** | No Modo Hoje: a próxima tarefa pendente a ser feita agora; no Setup: o objetivo do dia | `renderTodayMode()`, linha 2762 |
| **DISTRITO** | Uma aba de navegação customizável que leva a uma página interna ou URL externa | `DISTRICT_PAGE_DEFS`, linha 6634 |
| **EDDIES (€$)** | Moeda virtual ganha completando tarefas, usada para comprar itens na Loja | `awardEddies()`, `modules/gamification.js` linha 21 |
| **STREET CRED** | Pontuação acumulada de longo prazo baseada em tarefas concluídas, reviews, livros lidos, projetos etc. | `streetCredScore()`, `modules/gamification.js` linha 527 |
| **OPERADOR** | O usuário logado (você) | `userRole()`, `app.js` linha 143 |
| **NETRUNNER** / **CORPO** | Nomes temáticos de perfis/papéis; não afetam funcionalidade | `PROFILES`, linha 38 |
| **COMMLINK** | Sistema de amizade + chat com outro usuário do app | `friend-chat`, `index.html` linha 152 |
| **ICE / ESCUDOS** | Tokens que protegem uma sequência diária quando você pula um dia | `streakShields`, `gamification.js` linha 56 |
| **STREAK / CORRENTE** | Sequência de dias consecutivos com um hábito marcado | `habitStreak()` |
| **SEASON** | Mês atual como "temporada" de progresso, com tiers (STREET KID → OPERADOR → FIXER → LENDA) | `SEASON_TIERS`, `gamification.js` linha 472 |
| **WRAPPED** | Relatório mensal de desempenho (igual ao "Wrapped" do Spotify) | `showWrapped()`, `gamification.js` linha 422 |
| **DEBRIEF** | Revisão semanal com perguntas sobre o que funcionou/travou | `#weekly-review-modal`, `index.html` linha 874 |
| **REVISÃO TÁTICA** | Fechamento do dia — registro de energia, nota e plano de amanhã | `#daily-review`, `index.html` linha 348 |
| **INTEL** | Card da Home que exibe metas e calendário semanal | `goals-intel`, linha 547 |
| **HUD** | Painel/interface visual (termo de games) | `LEXICON_PAIRS`, linha 339 |
| **BLACK MARKET / LOJA** | Loja de itens cosméticos e utilitários comprados com Eddies | `SHOP_ITEMS`, `gamification.js` linha 185 |
| **MODO FOCO** | Timer estilo Pomodoro que conta o tempo em uma tarefa | `#mission-focus`, `index.html` linha 421 |
| **PILOTO AUTOMÁTICO** | Configuração que gera automaticamente a rotina base no setup | `setup-autopilot`, linha 308 |
| **AUTOPILOT** | Indica que a rotina foi configurada via setup automático | `profile.autoPilot`, `renderDailyPanel()` |
| **CONTRATO DIFÍCIL** | Tarefa marcada como difícil — vale eddies dobrados | `contract-hard`, linha 407 |
| **PRIMEIRO BOOT** | Primeira vez que o Setup Wizard é aberto | `setup-wizard`, linha 257 |
| **CARRY / MISSÃO DE RETORNO** | Missão definida no fechamento do dia anterior que aparece no Modo Hoje do dia seguinte | `getTomorrowCarryMission()` |

---

## 2. Página a Página — Problemas e Soluções

### Home — Cabeçalho

**O que é:** Título decorativo "NIGHT CITY", subtítulo "Life System", data e hora atual, e uma citação motivacional aleatória.

**Problema para novos usuários:** O subtítulo "Life System" não explica o que o app faz. O usuário não sabe se é um jogo, um app de produtividade ou um sistema de RPG.

**Solução sugerida:** Adicionar uma linha de onboarding abaixo da citação, visível apenas quando não houver dados (`tasks.length === 0`):
```html
<div class="h-onboarding-hint" id="h-onboarding-hint">
  Seu sistema de produtividade pessoal. Comece criando sua primeira tarefa diária ou use o Setup Rápido.
  <button data-action="openSetupWizard">SETUP RÁPIDO →</button>
</div>
```
CSS: mostrar apenas quando `body.no-data` (classe adicionada via JS quando `myData` vazio).

---

### Home — Modo Hoje (card MISSÃO)

**O que é:** Painel focado no ciclo diário. Mostra a próxima tarefa pendente, progresso do dia (barra + percentual), resumo semanal, botões FOCO / NOVO / REVISAR, e lista de contratos.

**Problema para novos usuários:**
- O card começa **fechado** — o botão "HOJE" na barra não deixa claro que é aqui que o usuário deve passar a maior parte do tempo.
- O título do card é simplesmente "MISSÃO" sem nenhuma explicação.
- Quando vazio, exibe "SEM MISSÃO" com um botão "+ CONTRATO" — o usuário não sabe o que é um contrato.
- Os três botões primários (◎ FOCO, ⊕ NOVO, ✓ REVISAR) não têm tooltip ou explicação.
- "MODO FOCO" e "MODO HOJE" soam como dois modos diferentes quando na verdade são complementares.

**Solução sugerida:**
- Abrir o Modo Hoje **automaticamente** quando não houver dados (`_todayModeInit` e `myData.tasks` vazio), linha ~2346.
- No estado vazio, substituir "SEM MISSÃO" por:
  > "Sua tarefa do dia vai aparecer aqui. Clique em ⊕ NOVO para criar a primeira."
- Adicionar `title="Cronômetro de foco para esta tarefa"` no botão ◎ FOCO, `title="Criar nova tarefa para hoje"` no ⊕ NOVO, `title="Fechar o dia e registrar progresso"` no ✓ REVISAR.
- Renomear o botão "HOJE" para "HOJE — Seu dia" ou adicionar um badge de contagem pendente: `HOJE (3)`.

---

### Home — Card Contratos

**O que é:** Lista de todas as tarefas marcáveis para o dia atual, com filtros TODOS/PENDENTES/FEITOS e toolbar de ações.

**Problema para novos usuários:**
- O ícone `📋 Contratos` não deixa claro que são tarefas comuns.
- A toolbar tem 6 botões de ação (`+`, `✓`, `📂`, `▣`, `↕`, `◎`) sem nenhum label — só `title` attributes.
- Estado vazio diz "Sem contratos" com botão "ROTINA BASE" — o usuário não sabe o que é uma rotina base.
- O modal de criar contrato (`#contract-modal`) tem campo "MISSÃO DIFÍCIL (eddies dobrados)" — o usuário não sabe o que são eddies.

**Solução sugerida:**
- Estado vazio (linha 535, `task-list`):
  > **"Você ainda não tem tarefas para hoje."**
  > Clique em + para adicionar uma tarefa, ou deixe o sistema montar uma rotina de exemplo para você.
  > `[+ CRIAR TAREFA]` `[USAR EXEMPLO]`
- No modal de contrato, adicionar tooltip no campo "MISSÃO DIFÍCIL": `title="Marque se esta tarefa exige esforço extra. Você ganha o dobro de moedas ao concluí-la."`.
- Remover o campo "MISSÃO DIFÍCIL" do modo avançado para novos usuários (progressive disclosure — ver Seção 6).

---

### Home — Card Intel (metas)

**O que é:** Exibe as metas globais do usuário (livros a ler no mês, minutos de violão, etc.) e um mini-calendário semanal colorido (livre vs. faculdade).

**Problema para novos usuários:**
- O nome "Intel" vem de "inteligência/informação" no contexto cyberpunk — completamente opaco.
- O calendário colorido (livre/faculdade) usa classes CSS `free`/`uni` hardcoded no HTML (linha 557) — não é configurável pelo usuário e não explica o que as cores significam na primeira vez.
- A legenda (`livre` / `faculdade`) fica visível mas o usuário não sabe que pode editar isso.

**Solução sugerida:**
- Renomear para "Metas e Agenda" ou ao menos adicionar subtítulo descritivo.
- Estado vazio de metas (quando `getGoals()` está vazio):
  > "Nenhuma meta definida ainda. Clique em ✏️ para adicionar metas mensais."
- Adicionar botão "EDITAR CALENDÁRIO" próximo à legenda, levando ao editor de dias livres.

---

### Home — Card Alertas / Notificações

**O que é:** Atalho para a página de notificações e lembretes.

**Problema para novos usuários:**
- O card exibe apenas `🔔 Alertas` e um botão "ABRIR" — não diz o que vai acontecer ao abrir.
- Um novo usuário sem contexto pode achar que são alertas do sistema, não lembretes personalizáveis.

**Solução sugerida:**
- Adicionar subtítulo: "Lembretes para suas tarefas diárias — configure horários para cada hábito."
- Mostrar o próximo lembrete programado diretamente no card se houver algum.

---

### Home — Card Habits Tracker

**O que é:** Tabela semanal (SEG–DOM) que marca automaticamente os dias em que uma tarefa foi concluída, funcionando como tracker visual de hábitos.

**Problema para novos usuários:**
- O título `⚡ Habits` mistura inglês com português.
- As células da tabela têm `title="Marcado automaticamente pelos contratos"` — um novo usuário não vai descobrir isso.
- O botão `↺ Reset semana` está na toolbar sem explicação — o usuário pode clicar com medo de apagar dados.
- Estado vazio (linha 5127): "SEM HABITOS — Crie seu primeiro contrato para ativar o tracker semanal." — não explica que o tracker é automático.

**Solução sugerida:**
- Renomear para "Rastreador de Hábitos" ou "⚡ Hábitos Semanais".
- Estado vazio:
  > "O rastreador preenche automaticamente quando você conclui tarefas. Crie sua primeira tarefa para ver o histórico aqui."
- Tooltip no botão reset: `title="Limpa as marcações desta semana sem apagar os dados históricos"`.
- Adicionar linha de explicação acima da tabela: "Preenchido automaticamente — cada ✓ na lista de tarefas marca o dia aqui."

---

### Home — Card Consistência / KPIs

**O que é:** Painel avançado com gráficos de pizza de % semanal/mensal, barras de progresso por hábito, streaks, heatmap do mês, histórico de 6 semanas, gráfico de eddies diários, e histórico de evolução.

**Problema para novos usuários:**
- É o painel mais complexo do app e aparece imediatamente na Home.
- Exibe símbolos sem legenda: `↑`, `↓`, `🗓`, `⭐`, `🔥`, `🏆`, `↑/↓` com números sem contexto.
- O ícone `€$` no gráfico de barras só faz sentido para quem já entende o sistema de eddies.
- O painel `◎` (Metas do mês) aparece vazio sem explicação.
- Estado vazio (linha 5293): "SEM CONSISTENCIA — Marque seu primeiro contrato." — muito seco.

**Solução sugerida:**
- Esconder este painel por padrão para novos usuários (ver Seção 6 — Progressive Disclosure).
- Quando visível, adicionar tooltip em cada KPI:
  - `⬆` → `title="Hábito com melhor % esta semana"`
  - `⬇` → `title="Hábito com pior % esta semana"`
  - `🗓` → `title="Dia da semana em que você tem mais consistência"`
  - `⭐` → `title="Dias em que você completou 100% das tarefas este mês"`
  - `🔥` → `title="Sequência atual de dias perfeitos"`
  - `🏆` → `title="Hábito com melhor % no mês"`
  - `€$` (gráfico) → `title="Moedas ganhas por dia nas últimas 2 semanas"`
- Estado vazio:
  > "Você ainda não tem histórico. Comece marcando tarefas — os gráficos aparecem automaticamente."

---

### Home — Card Rotinas

**O que é:** Blocos de rotina recorrentes (ex: "Manhã: acordar, alongar, café") que o usuário define e que não são tarefas marcáveis individualmente — são guias textuais.

**Problema para novos usuários:**
- O conceito de "rotina" vs. "contrato" não está claro — ambos parecem listas de coisas a fazer.
- Estado vazio diz apenas "Sem rotinas" com botão "+ CRIAR" — o usuário não sabe o que vai criar.
- O módulo de edição de rotinas (quando aberto via ✏️) tem campos "Nome", "Passos", "Tipo" sem nenhuma instrução.

**Solução sugerida:**
- Adicionar subtítulo no card: "Blocos fixos do dia — guias não marcáveis, como 'manhã' ou 'noite'."
- Estado vazio:
  > "Rotinas são sequências de ações fixas do seu dia (ex: manhã, noite, pré-treino). Clique em + para criar a primeira."
  > `[+ CRIAR ROTINA]` `[VER EXEMPLO]`

---

### Home — Card Distritos / Abas Customizadas

**O que é:** Sistema de abas de navegação customizáveis. O usuário pode adicionar páginas internas (Leitura, Dev, Treino, etc.) ou URLs externas como atalhos de navegação.

**Problema para novos usuários:**
- "DISTRITOS" é o termo cyberpunk para "abas de navegação" — completamente opaco.
- Estado vazio diz "Sem distritos" com botão "+ LEITURA" — o usuário não sabe que está criando uma aba de navegação.
- O editor de distritos tem campos "Ícone", "Nome da aba", "Cor", "Destino" e "URL externa" — relativamente compreensível, mas o conceito de "destino" ainda usa a lista de nomes de páginas internas.

**Solução sugerida:**
- Renomear para "Abas de Navegação" ou pelo menos adicionar subtítulo: "Atalhos rápidos para suas páginas favoritas."
- Estado vazio:
  > "Adicione atalhos para suas áreas mais usadas (leitura, treino, finanças...) ou links externos."
  > `[+ LEITURA]` `[+ TREINO]` `[+ FINANCAS]`

---

### Home — Card Loja / Black Market

**O que é:** Loja de itens cosméticos (molduras de perfil, títulos) e utilitários (escudos de streak, bônus de eddies) comprados com Eddies.

**Problema para novos usuários:**
- O título `🏪 Loja` com `€$0` é compreensível, mas os itens da loja usam terminologia como "ICE — Escudo de streak", "Fragmento de lore", "Título: Fixer local" sem contexto.
- Um usuário com 0 Eddies vê todos os itens bloqueados sem entender como ganhar moedas.
- A categoria "UTILITY" vs. "COSMETIC" vs. "TEMPLATE" não é explicada.

**Solução sugerida:**
- Adicionar banner acima dos itens quando `D().eddies === 0`:
  > "Você ainda não tem moedas. Complete tarefas diárias para ganhar €$ e desbloquear itens."
- Renomear categorias: "UTILITY" → "Úteis", "COSMETIC" → "Visual", "TEMPLATE" → "Modelos".
- Adicionar tooltip em cada item explicando o benefício antes da compra.

---

### Side Deck / Menu Lateral (Home Drawer)

**O que é:** Menu lateral deslizante acessível pelo botão hambúrguer (≡). Contém grupos: Início, Meus Atalhos, Progresso, Biblioteca, Diário, Mais Páginas, Sistema.

**Problema para novos usuários:**
- O grupo "Diário" contém "Dev / Logs" e "Violão / Logs" — usuários sem interesse em programação ou música ficam confusos por esses itens proeminentes.
- "Meus Atalhos" aparece vazio por padrão ("Nenhum atalho ativo") — o usuário não sabe que atalhos são os Distritos configurados.
- O grupo "Sistema" mistura Loja, Backup, Commlink, Perfil e Configurações sem hierarquia clara.
- O botão de pesquisa `🔍 BUSCAR` na rodapé do drawer é útil mas invisível para quem não rola.
- Os grupos ficam fechados por padrão (exceto "Início"), então o usuário tem que descobrir que pode expandir.

**Solução sugerida:**
- Abrir "Início" e "Biblioteca" por padrão na primeira vez.
- Substituir o texto "Nenhum atalho ativo" em Meus Atalhos por:
  > "Seus atalhos aparecem aqui. Configure Abas de Navegação na Home para adicioná-los."
- Separar "Sistema" em dois grupos: "Conta" (Perfil, Commlink, Sair) e "Avançado" (Backup, Configurações).
- Mover o campo de pesquisa para o topo do drawer (atualmente fica na rodapé, pouco visível).

---

### Navegação Principal (Nav Bar)

**O que é:** Barra fixa no topo (desktop) com: NC//, botão hambúrguer, abas de ícones (Distritos), nome do usuário, seletor de tema, botão AMIGO, indicador de salvamento, botões SALVAR e PERFIL.

**Problema para novos usuários:**
- As abas de navegação são **ícones SVG sem texto** — o usuário não sabe para onde cada ícone leva até passar o mouse (tooltip).
- O botão "SALVAR" é confuso — o usuário não sabe se o app não salva automaticamente ou se precisa clicar sempre.
- O seletor de tema "◈ TEMA" abre um menu com "ARASAKA", "NETRUNNER", "MAELSTROM", "CORPO" — nenhum usuário novo sabe o que esses nomes significam visualmente.
- O botão "PERFIL" leva a um painel de amigos/commlink, não a um perfil de configurações — desorientador.

**Solução sugerida:**
- Adicionar label de texto abaixo dos ícones na nav bar (pelo menos no primeiro login), controlado por uma preferência salva.
- Renomear temas com descrição visual: "ARASAKA (amarelo)", "NETRUNNER (azul)", "MAELSTROM (vermelho)", "CORPO (roxo)".
- Adicionar tooltip no botão SALVAR: `title="Salva todos os dados na nuvem. O app também salva automaticamente a cada mudança."`.
- Adicionar tooltip no botão PERFIL: `title="Ver seu perfil público, Street Cred e conectar com amigos"`.

---

### Barra Móvel Inferior (mob-nav)

**O que é:** Barra de navegação fixa na parte inferior do viewport em mobile, com ícones SVG dos Distritos configurados.

**Problema para novos usuários:**
- Mesmos problemas das abas: ícones sem texto.
- Em mobile, a experiência de descobrir para onde cada ícone leva é ainda mais frustrante porque não há hover.

**Solução sugerida:**
- Exibir texto abaixo de cada ícone na mob-nav (curto, máx. 8 chars): os ícones têm classe `mob-tab icon-only` (linha 6723) — remover `icon-only` e adicionar `<span class="mob-tab-label">` com o nome curto.

---

### Página Leitura (page-leitura)

**O que é:** Biblioteca de livros com status (Na fila / Lendo agora / Concluído), barra de progresso para meta mensal, e formulário de adição.

**Problema para novos usuários:**
- A barra de progresso "LIVROS CONCLUÍDOS: 0/2" aparece antes de qualquer livro ser adicionado, com meta padrão de 2 — o usuário não sabe de onde veio o "2" ou como mudar.
- Estado vazio: "📚 Sem livros" com botão "+ LEITURA" — funcionalmente claro, mas poderia ser mais motivador.
- O ciclo de status (clicar no badge muda: FILA → LENDO → CONCLUÍDO) não é documentado em lugar algum — o usuário tem que descobrir por acidente.

**Solução sugerida:**
- Estado vazio:
  > "Nenhum livro cadastrado ainda. Adicione um livro ativo para acompanhar seu progresso de leitura."
  > `[+ ADICIONAR LIVRO]` `[VER SUGESTÕES]`
- Adicionar tooltip no badge de status: `title="Clique para mudar o status: Fila → Lendo → Concluído"`.
- Adicionar explicação da meta: ao lado de "LIVROS CONCLUÍDOS 0/2", adicionar `title="Meta mensal. Clique em ✏️ para editar."` no ícone de edição.

---

### Página Dev / Projetos (page-dev)

**O que é:** Gerenciador de projetos de programação/estudo com status, campo "Próximo Passo", tracker de skills (pontos de 1–5 clicáveis), e log de sessões de estudo.

**Problema para novos usuários:**
- O título "💻 PROJETOS" é claro, mas o card "🧠 Skills" com dots clicáveis (1–5) não explica que você pode clicar para registrar seu nível.
- O log de dev ("📝 Log") pede "NOTA DE HOJE" sem explicar para quê serve o log — parece um diário técnico mas não está rotulado assim.
- Estado vazio do log: "SEM LOG DE ESTUDO — Registre a sessao de hoje para criar historico real." — razoável, mas "histórico real" é vago.

**Solução sugerida:**
- Adicionar tooltip no tracker de skills: `title="Clique nos pontos para registrar seu nível atual nessa habilidade (1 a 5)"`.
- Renomear card "📝 Log" para "📝 Diário de Estudo".
- Estado vazio do log:
  > "Nenhuma sessão registrada. Anote o que você estudou hoje — qualquer coisa, por menor que seja — para criar um histórico de evolução."

---

### Página Violão / Logs (page-violao)

**O que é:** Tracker de prática de violão com nível geral, meta diária (min/dia), streak, tracker de técnicas (similar ao de skills do Dev), e log de práticas.

**Problema para novos usuários:**
- Este módulo é muito específico (violão) e aparece na navegação principal por padrão, confundindo usuários que não tocam violão.
- O "NÍVEL GERAL" exibe "Iniciante" com barra fixa de 10% — o usuário não sabe como aumentar.
- A `META: 15 min/dia` vem de `getGoals().guitarMinutes` e não tem botão de editar visível (só o ✏️ no card de Status).

**Solução sugerida:**
- Tornar esta página um Distrito **opcional** que só aparece se o usuário configurar (ver Seção 6).
- Adicionar tooltip na barra de nível: `title="Baseado no número de práticas registradas. Registre práticas para evoluir."`.
- Adicionar botão de editar meta diretamente no valor da META.

---

### Página Jogos (page-jogos)

**O que é:** Biblioteca de jogos com status (Jogando agora / Na fila / Zerado / Abandonado), separando o jogo atual da biblioteca.

**Problema para novos usuários:**
- O conceito é claro, mas o estado vazio "🎮 Sem jogo ativo" e "🎮 Sem jogos" com botão "+ JOGO" funcionam bem.
- Única confusão: o status "Zerado" pode não fazer sentido para jogos que não têm fim.

**Solução sugerida:**
- Renomear "Zerado" para "Concluído / Zerado".
- Tornar esta página um Distrito **opcional** (ver Seção 6).

---

### Página Reflexões / Diário (page-reflexoes)

**O que é:** Diário pessoal simples com campo de título e texto livre, listagem em ordem cronológica reversa.

**Problema para novos usuários:**
- O formulário está sempre visível no topo da página — bom para agilidade, mas o usuário não sabe se o conteúdo é privado ou compartilhado com amigos.
- Estado vazio: "📔 Diário vazio" com botão "+ ENTRADA" — claro e funcional.
- Não há nenhuma indicação de privacidade — usuários podem hesitar em escrever pensamentos pessoais.

**Solução sugerida:**
- Adicionar badge de privacidade no header da página: `🔒 Privado — apenas você vê estas entradas` (a menos que o usuário ative compartilhamento com amigos).
- Estado vazio mais motivador:
  > "Seu espaço de reflexão pessoal. Registre o que aconteceu hoje, o que quer mudar, ou qualquer pensamento."

---

### Página Notificações / Lembretes (page-notificacoes)

**O que é:** Central de configuração de notificações locais do navegador, Web Push (tela fechada), diagnóstico técnico do sistema, e backup de dados.

**Problema para novos usuários:**
- Esta página mistura **lembretes** (funcionalidade de usuário) com **diagnóstico técnico** (SERVICE WORKER, PUSH FECHADO, INSCRICAO PUSH, SUPABASE ERRORS) — confuso e assustador para leigos.
- O aviso amarelo "MODO TELA FECHADA EXIGE WEB PUSH + BACKEND AGENDADO. O PROJETO JA TEM OS ARQUIVOS SUPABASE PARA DEPLOY." é direcionado ao desenvolvedor, não ao usuário final.
- Os chips de diagnóstico (SCHEMA, REALTIME, CHAVES SALVAS, ULTIMO ERRO JS, ULTIMA FALHA SUPABASE) são incompreensíveis para não-desenvolvedores.

**Solução sugerida:**
- Separar a página em duas seções claramente rotuladas:
  1. **"Meus Lembretes"** — permissão de notificação, configuração de horários, próximo alerta.
  2. **"Sistema (Avançado)"** — diagnóstico, backup, SW — colapsado por padrão atrás de `<details>`.
- Remover ou reescrever o aviso amarelo de Web Push para linguagem de usuário:
  > "Para receber alertas mesmo com o app fechado, é necessário ativar Web Push. Isso requer configuração adicional pelo administrador do sistema."
- Renomear "ALERTAS" para "Lembretes e Notificações".

---

### Loja / Black Market (dentro da Home)

**O que é:** Card na Home que mostra o saldo de Eddies e os itens da loja em grid.

**Problema para novos usuários:** (Ver seção Home — Card Loja acima.)

---

### Perfil / Street Cred (painel PERFIL)

**O que é:** Painel deslizante que abre ao clicar em "PERFIL" na nav. Contém: aba de Perfil (nome público, nick, tag, bio, avatar, cor, frame), aba de Contatos (Commlink / amigos), aba de Chat.

**Problema para novos usuários:**
- "PERFIL" na nav bar aparentemente levaria a configurações de conta — mas na verdade abre o sistema social (commlink).
- O campo "NICK COMMLINK" (handle no sistema de amizade) não explica para quê serve.
- O campo "TAG" (ex: #1234) não explica como é usado para buscar amigos.
- A seção Street Cred fica no painel de status da Home (`operator-status-panel`) dentro de `<details>`, escondida.
- O rank "STREET KID" aparece no banner de Season sem contexto — um novo usuário vê "STREET KID" e não entende se é um erro ou uma feature.

**Solução sugerida:**
- Separar o botão PERFIL (configurações pessoais) do botão AMIGO/COMMLINK (social) na nav bar — já existe o botão AMIGO separado, só precisa de visibilidade.
- No painel de perfil, adicionar descrição dos campos:
  - NICK: "Seu nome público no sistema de amigos"
  - TAG: "Número de identificação único. Compartilhe nick#tag para que amigos te encontrem."
- Adicionar seção "Seu Progresso" no painel de perfil com Street Cred, rank atual e próximo tier.
- Substituir "STREET KID" por algo mais explicativo: "Nível: Iniciante (STREET KID)" ou adicionar tooltip: `title="Seu nível de progresso no app. Aumenta com tarefas, reviews e conquistas concluídas."`.

---

### Amigo / Commlink (friend-chat)

**O que é:** Sistema social que permite conectar com outro usuário, ver o progresso dele (com permissão), trocar mensagens, e compartilhar seções específicas do perfil.

**Problema para novos usuários:**
- O termo "COMMLINK" (comunicação futurista em cyberpunk) não diz nada.
- O fluxo de adicionar amigo (inserir nick#tag, enviar pedido, aguardar aprovação) não está documentado.
- Os toggles de permissão (HOME, LEITURA, DEV, VIOLÃO, JOGOS, REFLEXÕES) não explicam o que o amigo vai poder ver.
- O botão "AMIGO" na nav fica hidden por padrão (`hidden` em `index.html` linha 123) — só aparece depois do login, o que é correto, mas sua posição na nav não é intuitiva.

**Solução sugerida:**
- Renomear para "Amigos / Social" ou manter "Commlink" apenas no modo cyber.
- Adicionar tela de boas-vindas quando o usuário ainda não tem amigos:
  > "Conecte com um amigo para ver o progresso dele e trocar mensagens. Compartilhe seu nick#tag para começar."
  > `[COPIAR MEU nick#tag]` `[BUSCAR AMIGO]`
- Adicionar tooltips nos toggles de permissão: "Permitir que seu amigo veja sua lista de tarefas e hábitos."

---

### Configurações / Setup (openSettingsModule)

**O que é:** Painel de configurações acessível via Menu Lateral → Sistema → Configurações. Contém: seletor de vocabulário (cyber/simples), animação, som, backup, e atalhos para editores de cada seção.

**Problema para novos usuários:**
- O caminho para chegar nas configurações é: Hambúrguer → Sistema → Configurações → (painel abre sobre a tela). Muitos cliques.
- A opção mais importante para novos usuários — "VOCABULÁRIO: Cyberpunk / Simples" — está enterrada aqui.
- Não há link de "Configurações" no rodapé da página principal.

**Solução sugerida:**
- Adicionar atalho de Configurações diretamente no rodapé da Home (`<footer>`, linha 638).
- Exibir o seletor de vocabulário no primeiro login junto com o Setup Wizard.
- Adicionar ícone de engrenagem ⚙ visível na nav bar (atualmente não existe).

---

### Sistema de Missões / Contratos (modal contract)

**O que é:** Modal de criação/edição de tarefas com modo "Rápido" (só nome) e "Avançado" (categoria, frequência, duração/meta, lembrete, nota, flag difícil).

**Problema para novos usuários:**
- O título do modal é "NOVO CONTRATO" — para um novo usuário, parece que está assinando um documento legal.
- O modo padrão "RÁPIDO" é bom, mas o usuário não sabe que existe o modo avançado.
- O campo "FREQUÊNCIA" tem opção "Personalizado" que não explica como funciona.
- As sugestões contextuais (`contract-suggestions`) só aparecem após o usuário começar a digitar — sem destaque visual.

**Solução sugerida:**
- No modo RÁPIDO, adicionar placeholder descritivo: "Ex: Ler 10 minutos, treinar 30 min, estudar 1 capítulo..."
- Adicionar linha de ajuda abaixo do título: "Uma tarefa é algo que você quer fazer hoje ou todos os dias."
- No modo AVANÇADO, adicionar tooltip em FREQUÊNCIA:
  - "Diário" = aparece todos os dias
  - "Dias úteis" = só de seg a sex
  - "Personalizado" = você escolhe quais dias da semana

---

### Weekly Review / Debrief Semanal (weekly-review-modal)

**O que é:** Modal de revisão semanal com três perguntas: "O que funcionou?", "O que travar?", "Foco da próxima semana", mais métricas da semana.

**Problema para novos usuários:**
- O botão de acesso "📋 DEBRIEF" fica escondido dentro do `<details class="operator-status-panel">` na Home — o usuário precisa clicar em "👤 STATUS" para ver o botão.
- "DEBRIEF" é um termo militar/corporativo — menos cyberpunk, mais jargão técnico.
- As métricas (`#wr-metrics`) aparecem no topo do modal mas estão vazias até que haja dados históricos.

**Solução sugerida:**
- Adicionar botão de revisão semanal visível no Modo Hoje (junto com ✓ REVISAR) quando for domingo ou quando a semana atual tiver dados suficientes.
- Renomear "DEBRIEF" para "Revisão Semanal" ou "Balanço da Semana".
- No primeiro uso, mostrar texto orientador:
  > "Reserve 5 minutos para refletir sobre a semana. Suas respostas ajudam o sistema a entender seu ritmo."

---

### Revisão Diária / Fechamento do Dia (daily-review)

**O que é:** Modal de fechamento diário com: energia do dia, foco de amanhã, nota do dia (textarea), e missão de retorno (tarefa para carregar para o dia seguinte).

**Problema para novos usuários:**
- O botão "✓ REVISAR" no Modo Hoje é o acesso principal — bom.
- O campo "MISSÃO DE AMANHA" não explica que essa tarefa aparece no Modo Hoje do dia seguinte como destaque especial.
- O subtítulo "// PLANO DE RETORNO //" e "Feche o dia com uma ação simples para amanhã" são claros.

**Solução sugerida:**
- Adicionar tooltip no campo MISSÃO DE AMANHÃ: `title="Esta tarefa aparecerá destacada no início do seu dia de amanhã como prioridade."`.
- Após salvar a primeira revisão, mostrar toast: "Revisão salva! Sua missão de amanhã já está programada."

---

### Modo Foco / Mission Focus (mission-focus)

**O que é:** Timer de foco (estilo Pomodoro) com opções de duração (10, 15, 25, 30, 45, 60 min + custom), botão de pausa, modo Pomodoro (intervalos automáticos), e botão para concluir a tarefa ao final.

**Problema para novos usuários:**
- "MODO FOCO" vs. "POMODORO" — o usuário não sabe a diferença entre os dois modos.
- O botão "POMODORO OFF" (toggle) não explica o que Pomodoro faz se ativado.
- O status inicial "Interface de combate pronta. Inicie quando quiser." usa linguagem cyberpunk sem necessidade.
- Não há instrução sobre o que acontece após o timer terminar.

**Solução sugerida:**
- Substituir "Interface de combate pronta. Inicie quando quiser." por "Cronômetro pronto. Escolha a duração e clique em INICIAR."
- Adicionar tooltip no toggle Pomodoro: `title="Modo Pomodoro: o timer alterna automaticamente entre sessões de trabalho e pausas curtas."`.
- Adicionar botão "INICIAR" separado de "PAUSAR" — o estado inicial com botão "PAUSAR" já visível confunde (o timer não está correndo ainda mas o botão sugere que está).

---

### Setup Wizard / Primeiro Boot (setup-wizard)

**O que é:** Modal de configuração inicial com 4 passos: escolha de vocabulário (cyber/simples), seleção de foco principal, estado atual da rotina, tempo disponível por dia — e geração automática de contratos, lembretes e distritos.

**Problema para novos usuários:**
- **Este é o melhor fluxo de onboarding do app e não é disparado automaticamente.** O usuário tem que encontrar o botão de setup manualmente.
- O Passo 1 apresenta "Cyberpunk (Contratos · Distritos · Street Cred)" vs. "Simples (Tarefas · Áreas · Progresso)" — excelente — mas só aparece se o wizard for aberto.
- O botão "COMEÇAR PRIMEIRA MISSAO" e "EDITAR ANTES" são claros.
- O texto do Passo 2 menciona "seu foco define contratos, lembretes e distritos iniciais" — direto ao ponto.

**Solução sugerida:**
- **Disparar o Setup Wizard automaticamente** quando `isNewUser === true` (variável já existe, linha 46). Condição: `myData` vazio E primeiro login. Código sugerido:
  ```javascript
  if (isNewUser && !myData.taskDefs?.length) {
    setTimeout(() => openSetupWizard(), 800);
  }
  ```
- Adicionar botão "SETUP INICIAL" na Home visível quando não há dados, acima do card de Contratos.

---

## 3. Onboarding — Fluxo Ideal para os Primeiros 5 Minutos

### Passo a passo do fluxo ideal

**Minuto 0 — Cadastro / Login**
- Tela de login mostra "NIGHT CITY — Sistema de produtividade pessoal" como subtítulo.
- Após criar conta, tela de boas-vindas simples: "Olá, [nome]. Vamos configurar seu sistema em 4 passos rápidos."

**Minuto 1 — Setup Wizard (automático)**
- O wizard abre automaticamente.
- Passo 1: Escolha de vocabulário (cyber vs. simples) — **essencial para o restante da experiência**.
- Passo 2: Foco principal + estado da rotina + tempo disponível.
- Passo 3: Preview gerado automaticamente — o usuário vê as tarefas que serão criadas.
- Passo 4: Edição opcional. Botão "COMEÇAR" proeminente.

**Minuto 2 — Modo Hoje (abre automaticamente)**
- Após o wizard, o app abre o Modo Hoje com as primeiras tarefas visíveis.
- Destaque animado na primeira tarefa: "Esta é sua primeira missão. Clique em ✓ para concluir."
- Toast de boas-vindas: "Sistema ativado. Conclua sua primeira tarefa para ganhar suas primeiras moedas."

**Minuto 3 — Primeira tarefa concluída**
- Som de celebração (já implementado em `celebrate()`).
- Toast com explicação: "Parabéns! +3 moedas ganhas. Continue para ganhar mais."
- Hint progressivo sobre a revisão diária.

**Minuto 4 — Exploração guiada**
- Mostrar tooltip "Experimente o Modo Foco (◎) para cronometrar suas tarefas."
- Ocultar todos os cards complexos (Consistência, Status, Loja) atrás de `<details>` por padrão.

**Minuto 5 — Encerramento do onboarding**
- Banner: "Setup completo! Explore as páginas pelo menu lateral ou adicione mais tarefas."
- Não mostrar todos os cards simultaneamente — progressive disclosure.

---

### O que deve ser visível vs. oculto no primeiro acesso

**Visível imediatamente:**
- Modo Hoje (aberto por padrão)
- Card de Contratos/Tarefas
- Card Intel/Metas (simplificado)
- Botão "NOVO" (criar tarefa)
- Botão "HOJE" na barra de navegação

**Oculto até ação do usuário:**
- Painel de Consistência / KPIs (visível após 3 dias de uso)
- Card Loja (visível após 50 eddies acumulados)
- Painel de Status / Street Cred (visível após 1 semana)
- Card Habits Tracker (visível após criar 2+ tarefas)
- Botão DEBRIEF (visível após 1 semana de dados)
- Weekly Challenge e Daily Quest (visíveis após 1 semana)

---

## 4. Linguagem — Glossário de Renomeações

| Termo cyberpunk atual | Rótulo em português simples | Por que a renomeação ajuda |
|---|---|---|
| CONTRATO | Tarefa | "Tarefa" é universalmente compreendido; "contrato" evoca obrigação legal |
| MISSÃO | Prioridade do dia / Próxima ação | Remove ambiguidade com "objetivo de longo prazo" |
| DISTRITO | Aba / Área | "Aba" é familiar de qualquer navegador; "área" remete a contexto de vida |
| EDDIES (€$) | Moedas | "Moedas" é imediatamente compreensível em qualquer sistema de gamificação |
| STREET CRED | Progresso / Reputação | "Progresso" é o conceito real; "reputação" mantém um toque de gamificação |
| COMMLINK | Amigos / Mensagens | "Mensagens" é universal; "amigos" explica o propósito |
| ICE / ESCUDOS | Proteção de sequência | "Proteção" explica a função; "sequência" substitui "streak" |
| STREAK | Sequência / Dias seguidos | "Sequência" é compreensível; evita anglicismo |
| OPERADOR | Você / Usuário | Desnecessário em maioria dos contextos |
| NETRUNNER / CORPO | (remover do UI) | Nomes de role sem função; só confunde |
| DEBRIEF | Revisão Semanal | "Revisão" é autoexplicativo |
| WRAPPED | Relatório do Mês | "Relatório" é claro; evita referência cultural específica |
| SEASON | Mês atual / Temporada | "Mês atual" é mais concreto; "temporada" mantém o tom |
| STREET KID | Iniciante | Nível mais compreensível para quem não conhece o universo |
| FIXER | Experiente | Substituto claro para o tier intermediário |
| LENDA | Mestre / Veterano | Substituto para o tier máximo |
| PILOTO AUTOMÁTICO | Setup automático | Remove jargão desnecessário |
| CONTRATO DIFÍCIL | Tarefa difícil | Elimina duplicidade do termo |
| INTEL | Metas e Resumo | Descreve o conteúdo real do card |
| BLACK MARKET | Loja de recompensas | Descreve a função sem conotação negativa |
| HUD | Painel | Jargão de games; "painel" é universal |
| CARRY / MISSÃO DE RETORNO | Prioridade de amanhã | Descreve exatamente o que é |
| PRIMEIRO BOOT | Configuração inicial | Elimina jargão técnico |

---

## 5. Empty States — Lista Completa

Cada seção que pode estar vazia, com o texto de estado vazio recomendado (copy concreto):

### Home — Lista de Tarefas (primeiro uso, zero tarefas)
> **"Nenhuma tarefa criada ainda"**
> Comece com algo pequeno — 10 a 30 minutos de qualquer atividade.
> `[+ CRIAR TAREFA]` `[USAR EXEMPLO]`

### Home — Lista de Tarefas (dia de descanso, tarefas existem mas nenhuma é para hoje)
> **"Dia de descanso"**
> Nenhuma tarefa programada para hoje. Você pode criar uma tarefa avulsa ou aproveitar o descanso.
> `[+ TAREFA AVULSA]`

### Home — Intel / Metas (sem metas definidas)
> **"Nenhuma meta definida"**
> Defina uma meta mensal simples, como "ler 2 livros" ou "treinar 3 vezes por semana".
> `[EDITAR METAS →]`

### Home — Habits Tracker (sem tarefas)
> **"Sem hábitos para rastrear"**
> O rastreador preenche automaticamente conforme você conclui tarefas. Crie sua primeira tarefa para começar.
> `[+ CRIAR TAREFA]`

### Home — Consistência (sem histórico)
> **"Ainda sem histórico"**
> Marque tarefas por alguns dias para ver seus gráficos de consistência aparecerem aqui.

### Home — Rotinas (sem rotinas)
> **"Nenhuma rotina configurada"**
> Rotinas são sequências fixas do dia — como uma rotina matinal ou noturna.
> `[+ CRIAR ROTINA]` `[VER EXEMPLO]`

### Home — Distritos / Abas (sem distritos)
> **"Nenhuma aba adicionada"**
> Adicione atalhos para suas páginas favoritas — leitura, treino, finanças...
> `[+ LEITURA]` `[+ TREINO]` `[+ FINANÇAS]`

### Leitura — Lista de Livros
> **"Biblioteca vazia"**
> Adicione um livro que está lendo agora ou que quer começar.
> `[+ ADICIONAR LIVRO]` `[VER SUGESTÕES]`

### Dev — Lista de Projetos
> **"Nenhum projeto ativo"**
> Crie uma entrega pequena para acompanhar seu progresso de estudo ou desenvolvimento.
> `[+ NOVO PROJETO]`

### Dev — Log de Estudo
> **"Nenhuma sessão registrada"**
> Anote o que você estudou hoje — qualquer coisa conta para o histórico de evolução.
> `[REGISTRAR SESSÃO]`

### Violão — Log de Práticas
> **"Nenhuma prática registrada"**
> Registre qualquer treino, mesmo que por apenas 5 minutos, para proteger sua sequência diária.
> `[REGISTRAR PRÁTICA]`

### Violão — Técnicas (sem skills definidas)
> **"Nenhuma técnica adicionada"**
> Clique em ✏️ para adicionar as técnicas que está praticando e acompanhar seu nível em cada uma.

### Dev — Skills (sem skills definidas)
> **"Nenhuma habilidade adicionada"**
> Clique em ✏️ para adicionar habilidades que está desenvolvendo (ex: JavaScript, React, SQL).

### Jogos — Jogando agora (sem jogo ativo)
> **"Nenhum jogo ativo"**
> Adicione o jogo que está jogando agora para acompanhar o progresso.
> `[+ ADICIONAR JOGO]`

### Jogos — Biblioteca (sem jogos)
> **"Biblioteca vazia"**
> Adicione jogos à fila para acompanhar o que quer jogar.
> `[+ ADICIONAR JOGO]`

### Reflexões / Diário (sem entradas)
> **"Diário em branco"**
> Este espaço é privado. Escreva livremente — o que aconteceu hoje, o que sente, o que quer mudar.
> `[ESCREVER AGORA]`

### Commlink / Amigos (sem amigos)
> **"Nenhum contato ainda"**
> Conecte com um amigo para acompanhar o progresso dele e trocar mensagens. Compartilhe seu nick#tag para começar.
> `[COPIAR MEU IDENTIFICADOR]`

### Loja — Sem Eddies
> **"Saldo: €$0"**
> Complete tarefas diárias para ganhar moedas e desbloquear itens.

### Modo Hoje — Sem tarefas
> **"Nenhuma tarefa para hoje"**
> Clique em ⊕ NOVO para criar sua primeira tarefa do dia.
> `[⊕ CRIAR TAREFA]` `[USAR ROTINA DE EXEMPLO]`

### Notificações — Sem lembretes configurados
> **"Nenhum lembrete ativo"**
> Configure horários para suas tarefas e receba alertas no momento certo.
> `[CONFIGURAR PRIMEIRO LEMBRETE]`

### Painel de Consistência — Sem conquistas
> **"Nenhuma conquista desbloqueada ainda"**
> As conquistas aparecem conforme você atinge marcos — como completar 7 dias seguidos ou terminar um livro.

### Busca Global — Sem resultados
> **"Nenhum resultado encontrado"**
> Tente termos mais curtos, ou verifique se adicionou itens nas páginas de Leitura, Projetos ou Jogos.

---

## 6. Progressive Disclosure — O que Esconder

### Fase 1: Primeiro acesso (0 dados)

**Esconder completamente:**
- Card Consistência / KPIs (`card c full` com `consistency-panel`)
- Card Habits Tracker (mostrar só após 2+ tarefas concluídas)
- Painel `operator-status-panel` (Status com Street Cred, Eddies, conquistas)
- Card Loja (`card y full` com `shop-grid`)
- Botão DEBRIEF
- Botões "WRAP" e "DEBRIEF" no `daily-command`
- Seção Season Banner (`season-banner`)
- Daily Quest e Weekly Challenge (já implementados mas não precisam ser visíveis logo)
- Streak Shield (`streak-shield`)
- Botão AMIGO na nav (já hidden por padrão)
- Grupos "Mais Páginas" e "Sistema" no drawer (fechar por padrão)

**Implementação sugerida:** Adicionar classe `nc-hidden-new` ao body quando `isNewUser` e CSS:
```css
body.nc-hidden-new .operator-status-panel,
body.nc-hidden-new .card.y.full,
body.nc-hidden-new #consistency-panel,
body.nc-hidden-new .season-banner,
body.nc-hidden-new .daily-quest,
body.nc-hidden-new .weekly-challenge,
body.nc-hidden-new .streak-shield { display: none; }
```
Remover a classe após 3 dias de uso (`localStorage.getItem('nc_days_active') >= 3`).

### Fase 2: Após 1 semana (7+ dias de dados)

**Desbloquear progressivamente:**
- Habits Tracker (após 3+ tarefas criadas)
- Painel de Consistência (após 7 dias de dados)
- Season Banner (após 1 semana)
- Loja / Black Market (após acumular 30+ Eddies)
- Botão DEBRIEF (após 1 semana de tarefas)
- Daily Quest (após primeira revisão diária)
- Streak Shield (após primeira sequência de 3+ dias)

**Gatilhos de desbloqueio sugeridos:**
```javascript
// Em renderProgressiveHints() ou em updateStats()
if (D().tasks && Object.keys(D().tasks).length >= 7) {
  myData.prefs.unlockedConsistency = true;
}
if ((D().eddies || 0) >= 30) {
  myData.prefs.unlockedShop = true;
}
```

### Fase 3: Usuário avançado (30+ dias)

**Desbloquear:**
- Wrapped mensal automático (já implementado em `maybeAutoWrapped()`)
- Weekly Challenge com recompensas maiores
- Contextual Challenge (`renderContextualChallenge()`)
- Opção de modo "AVANÇADO" no modal de contratos por padrão
- Campos avançados no Setup Wizard (nick, tag, objetivo central)

### Funcionalidades que nunca devem ser ocultadas:

- Botão de criar tarefa (+ NOVO)
- Modo Hoje
- Botão de salvar
- Botão de revisão diária (✓ REVISAR)
- Menu lateral básico (Início, Biblioteca)
- Acesso às páginas de conteúdo (Leitura, Projetos, Reflexões)

---

## 7. Prioridade de Implementação

### Quick Wins — 1 dia de trabalho

1. **Disparar o Setup Wizard automaticamente para novos usuários** — mudança de 3 linhas em `app.js` perto da linha 46 (variável `isNewUser` já existe).

2. **Abrir o Modo Hoje por padrão quando não há dados** — mudar o valor padrão de `localStorage.getItem('nc_today_mode')` para `'1'` quando `isNewUser`.

3. **Adicionar `title` attributes descritivos em TODOS os botões da toolbar de contratos** — linha 528 em `index.html`. Mudança de texto puro, zero risco.

4. **Reescrever os empty states de todas as páginas** — substituir textos como "SEM CONTRATOS", "SEM HABITOS" por copy explicativo conforme Seção 5 deste documento. Mudanças em `renderTasks()`, `renderHabitsTable()`, `renderConsistencyPanel()`, `renderBooks()`, `renderProjects()`, `renderGuitarLog()`, `renderDevLog()`, `renderRefs()`.

5. **Adicionar tooltip no toggle Pomodoro** — 1 linha de HTML.

6. **Separar a página de Notificações** — mover os chips de diagnóstico técnico para um `<details>` colapsado com label "Diagnóstico Avançado".

7. **Renomear os temas com cor entre parênteses** — linha 117-120 em `index.html`: "ARASAKA (amarelo)", "NETRUNNER (azul)", etc.

---

### Medium Effort — 1 semana de trabalho

8. **Implementar progressive disclosure** — adicionar classe `nc-hidden-new` ao body, CSS para ocultar seções avançadas, lógica de desbloqueio por dias de uso (Seção 6).

9. **Texto de label abaixo dos ícones na nav móvel** — remover `icon-only` dos `mob-tab`, adicionar `<span class="mob-tab-label">` com nome curto. Impacto em `renderNavTabs()` linha 6719.

10. **Adicionar tela de boas-vindas após o Setup Wizard** — modal simples com "Setup completo!" e overview do que foi criado, com botão "ENTRAR NO MEU SISTEMA".

11. **Reescrever o aviso amarelo de Web Push** na página de Notificações para linguagem de usuário (não de desenvolvedor).

12. **Adicionar badge de privacidade na página de Reflexões** — simples span no header da página.

13. **Separar visualmente o botão PERFIL do botão AMIGO** na nav bar — o botão AMIGO (`nav-friend`) já existe, só precisa de visibilidade e posição melhor. Tornar `nav-friend` sempre visível (remover `hidden` padrão após login).

14. **Adicionar tooltips nos KPIs do painel de Consistência** — `title=""` em cada `.ckpi` no `renderConsistencyPanel()`.

15. **Campo de busca no topo do drawer** — mover o elemento `#drawer-search-wrap` para cima da lista de grupos no `setupHomeSideMenu()` linha ~513.

---

### Big Refactor — 1 mês de trabalho

16. **Sistema de onboarding por etapas com highlights visuais** — implementar um overlay de spotlight/tooltip sequencial (tipo Shepherd.js ou implementação própria) que guia o usuário pelos elementos principais nos primeiros 3 usos. Requer: overlay CSS, array de steps, controle de posição, persistência de "steps vistos".

17. **Dashboard de Primeiro Acesso diferenciado** — ao invés de mostrar todos os cards da Home simultâneamente, mostrar apenas Modo Hoje + um card de "Explorar" com 3-4 opções. Os demais cards aparecem conforme o usuário explora. Requer refatoração de `home-layout` e lógica de estado de módulos ativos.

18. **Integração do vocabulário no Setup Wizard e manutenção consistente** — atualmente o modo simples usa `applyLexicon()` (substituição de texto em DOM) que pode ser frágil. Uma refatoração para centralizar todos os textos da UI em um objeto de constantes (`UI_COPY['cyber']` vs. `UI_COPY['simple']`) tornaria a troca de vocabulário mais robusta e permitiria novos idiomas no futuro.

19. **Tutorial interativo de gamificação** — explicar Eddies, Street Cred, Seasons e Conquistas em um painel "Como funciona" acessível pelo ícone de ajuda `?` na loja e no painel de status. Inclui ilustração do loop: Tarefa → Eddies → Loja → Motivação → Tarefa.

20. **Perfil separado de Commlink** — criar um painel de configurações de conta distinto do painel social. O botão "PERFIL" na nav deve levar a configurações de conta (nome, avatar, tema); o botão "AMIGO" deve levar ao commlink. Hoje ambos compartilham o mesmo painel (`renderFriendChat`), o que confunde usuários que querem apenas editar o nome.

---

*Documento gerado em 2026-06-08. Referências de código baseadas em `app.js` build `2026.06.06-foco-confirma-conclusao` e `index.html` com `style.css?v=20260606-2`.*
