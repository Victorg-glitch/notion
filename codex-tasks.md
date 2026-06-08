# Codex Tasks — Night City UX Improvements

> Lista de melhorias identificadas pela análise de UX. Cada tarefa inclui arquivo, linha/função, contexto e critério de conclusão.
> Ordenadas por impacto × esforço. Execute na ordem apresentada.

---

## 🟡 PRIORIDADE ALTA — Quick wins (1 sessão cada)

---

### TASK-01 — Disparar o Setup Wizard automaticamente para novos usuários

**Problema:** O Setup Wizard (`#setup-wizard` em `index.html` linha ~257) é completo e explica o app, mas nunca abre automaticamente. Novo usuário cai em home vazia sem contexto.

**Arquivo:** `app.js`

**Onde:** Função de inicialização após login — procure por `applyData()` ou o bloco que roda depois de `loadReminders()` (linha ~928). A variável `isNewUser` existe na linha ~46 mas não é usada para abrir o wizard.

**O que fazer:**
1. Verificar se `myData.setupDone !== true` (ou se `myData.tasks` está vazio e `myData.profile` não existe)
2. Se for novo usuário, chamar `openSetupWizard()` com delay de 600ms (para a home terminar de renderizar)
3. Após o usuário concluir o wizard, marcar `myData.setupDone = true` e salvar

**Critério de conclusão:** Ao criar conta nova e logar pela primeira vez, o Setup Wizard abre automaticamente antes de qualquer interação.

---

### TASK-02 — Empty state acionável na Home quando não há tarefas

**Problema:** Home com `myData.tasks = []` mostra cards vazios sem nenhuma orientação do que fazer primeiro. O usuário vê placeholders e nada mais.

**Arquivo:** `app.js`

**Onde:** Função `renderTasks()` ou onde os cards da home são montados. Buscar por `id="task-list"` ou `renderHomeLayout`.

**O que fazer:**
- Quando `tasks.length === 0`, renderizar dentro do card de tarefas:
```html
<div class="smart-empty">
  <span>SEM CONTRATOS</span>
  <b>Crie sua primeira tarefa do dia.</b>
  <div class="smart-actions">
    <button class="btn btn-y" data-action="openContractModal">+ CRIAR CONTRATO</button>
  </div>
</div>
```
- Mesmo padrão para o card de missão no Modo Hoje quando não há tarefas: mensagem "Crie um contrato para começar."

**Critério de conclusão:** Conta nova sem dados exibe chamada para ação clara em vez de tela em branco.

---

### TASK-03 — Renomear "CONTRATO" para algo compreensível no primeiro contato

**Problema:** O botão principal de criar tarefa diz "NOVO CONTRATO" e "⊕ NOVO" — ambíguo. Usuário não sabe o que vai criar.

**Arquivo:** `index.html` e `app.js`

**Onde:**
- `index.html` linha ~496: botão `tm-main-add` com texto `⊕ NOVO`
- `app.js` drawer linha ~516: `actionBtn('＋','Novo Contrato','openShellContracts','var(--y)')`
- Modal de contrato: `#contract-modal` com título "CONTRATO"

**O que fazer:**
- Botão `tm-main-add`: manter `⊕ NOVO` mas adicionar `title="Adicionar tarefa do dia"` para tooltip
- No modal de contrato, mudar o subtítulo de "CONTRATO" para "NOVA TAREFA" ou adicionar linha explicativa: `<div class="contract-hint">Tarefas do dia ganham Eddies ao serem concluídas.</div>`
- No drawer: "＋ Nova Tarefa" em vez de "Novo Contrato"

**Critério de conclusão:** Um usuário que nunca viu o app entende o que o botão principal faz sem precisar clicar.

---

### TASK-04 — Adicionar tooltips explicativos no primeiro uso (Street Cred, Eddies, Streak)

**Problema:** Os números de Street Cred, Eddies (€$) e Streak aparecem na home sem explicação. Novo usuário não sabe o que são.

**Arquivo:** `index.html` e `style.css`

**Onde:** Elementos `.tm-reward-line` (linha ~490 index.html), stats da home, e qualquer `span` que exibe Eddies ou Street Cred.

**O que fazer:**
- Adicionar atributo `title="..."` descritivo em todos esses elementos:
  - Street Cred: `title="Sua pontuação acumulada de produtividade"`
  - Eddies (€$): `title="Moeda virtual ganha completando tarefas"`
  - Streak/Corrente: `title="Dias consecutivos completando tarefas"`
- No CSS adicionar cursor `help` para esses elementos quando tiverem `title`

**Critério de conclusão:** Hover em qualquer número de gamificação mostra uma explicação em 1 frase.

---

### TASK-05 — Subtítulo descritivo na tela de login

**Problema:** A tela de login exibe "NIGHT CITY" e "LOGIN DE OPERADOR" mas não explica o que o app faz. Usuário que recebeu um link não sabe o que vai encontrar.

**Arquivo:** `index.html`

**Onde:** Linha ~41: `<div class="login-sub" id="login-sub">LOGIN DE OPERADOR</div>`

**O que fazer:**
- Adicionar abaixo do título, antes do formulário, um bloco fixo (não substituído pelo JS):
```html
<div class="login-tagline">Sistema pessoal de produtividade.<br>Tarefas, hábitos e foco em um lugar só.</div>
```
- CSS: `font-family: var(--ui); font-size: 13px; color: var(--muted); text-align: center; margin: -8px 0 16px; line-height: 1.5;`

**Critério de conclusão:** Alguém que acessa o link pela primeira vez entende o propósito do app antes de criar conta.

---

### TASK-06 — Modo Hoje como ponto de entrada padrão

**Problema:** Usuário que ativou o Modo Hoje (`myData.todayMode = true`) ainda vê a home grid completa no primeiro render. O card "MISSÃO" existe mas é só mais um bloco.

**Arquivo:** `app.js`

**Onde:** Função que roda na inicialização após login — buscar por `toggleTodayMode` ou `body.classList.add('today-mode')`.

**O que fazer:**
- Se `myData.prefs?.todayMode === true`, scroll automático até `#today-mode-card` com `behavior: 'smooth'` ao carregar
- Ou: se hoje-mode está ativo, colapsar automaticamente os outros cards da home (adicionar classe `tm-collapsed` neles)
- Não forçar o layout, apenas guiar o olhar

**Critério de conclusão:** Usuário que usa Modo Hoje vê a missão como primeiro elemento visual, não precisa fazer scroll.

---

### TASK-07 — Botão BUSCAR acessível sem abrir o menu lateral

**Problema:** BUSCAR foi movido para o footer do drawer — agora são 2 cliques. Para usuários frequentes isso é regressão de usabilidade.

**Arquivo:** `index.html` e `style.css`

**Onde:** Nav desktop linha ~108. CSS `.nav-right`.

**O que fazer:**
- Recolocar BUSCAR na nav desktop como ícone (lupa 🔍 ou `⌕`) sem texto, apenas com `aria-label="Buscar"` e `title="Buscar"`
- CSS: `font-size: 16px; padding: 6px 8px; background: transparent; border: none; color: var(--muted);`
- Manter no drawer footer também (redundância intencional — é o padrão de apps modernos)
- No mobile, o drawer footer já serve

**Critério de conclusão:** Busca acessível com 1 clique no desktop sem poluir visualmente a nav.

---

## 🟠 PRIORIDADE MÉDIA — 1–2 sessões cada

---

### TASK-08 — Empty states em todos os cards da home

**Problema:** Habits, Consistência, Rotinas, Loja e Intel mostram nada quando vazios. Sem orientação, sem chamada para ação.

**Arquivo:** `app.js`

**Funções a verificar e atualizar:**
- `renderHabits()` — quando `myData.habits = []`
- `renderConsistency()` ou similar — quando não há dados de KPI
- `renderRoutines()` — quando `myData.routines = []`
- `renderIntelCard()` ou `renderGoals()` — quando `myData.goals = []`

**Para cada um, adicionar empty state com padrão:**
```js
return `<div class="smart-empty compact">
  <span>NOME_DO_MÓDULO</span>
  <b>Descrição do que este módulo faz em 1 frase.</b>
  <div class="smart-actions">
    <button class="btn btn-y" data-action="ACAO_RELEVANTE">COMEÇAR</button>
  </div>
</div>`;
```

**Textos específicos para cada módulo:**

| Módulo | Texto `<b>` | Botão |
|--------|-------------|-------|
| Hábitos | "Monitore ações diárias como hidratação, exercício e sono." | `+ CRIAR HÁBITO` |
| Consistência | "Seus KPIs aparecem aqui conforme você registra dados." | `VER HÁBITOS` |
| Rotinas | "Monte sua rotina base e o app irá monitorá-la automaticamente." | `+ CRIAR ROTINA` |
| Intel/Metas | "Registre o que quer conquistar esta semana." | `+ ADICIONAR META` |
| Loja | "Compre itens cosméticos e utilitários com Eddies." | `VER ITENS` |

**Critério de conclusão:** Nenhum card da home fica completamente em branco.

---

### TASK-09 — Onboarding checklist visível na home (primeiros 7 dias)

**Problema:** Após fechar o Setup Wizard, o usuário não tem guia de próximos passos.

**Arquivo:** `app.js` e `style.css`

**Onde:** Acima do grid da home, renderizar condicionalmente.

**O que fazer:**
- Criar função `renderOnboardingChecklist()` que exibe um card somente se `myData.onboardingDone !== true`
- O card mostra 4–5 passos:
  1. ✅ Criar conta ← sempre marcado
  2. ☐ Criar seu primeiro contrato (tarefa)
  3. ☐ Marcar um hábito
  4. ☐ Abrir o Modo Hoje
  5. ☐ Fazer sua primeira revisão diária
- Quando todos marcados: `myData.onboardingDone = true`, card some com animação
- Verificar cada condição nos dados existentes (ex: se `myData.tasks.length > 0`, passo 2 está feito)

**CSS:**
```css
.onboarding-card { border: 1px solid color-mix(in srgb,var(--y) 32%,var(--border)); border-left: 3px solid var(--y); border-radius: 8px; padding: 14px 16px; margin-bottom: 14px; background: rgba(252,238,9,.04); }
.onboarding-step { display: flex; align-items: center; gap: 10px; font-family: var(--mono); font-size: 10px; letter-spacing: 1.5px; color: var(--muted); padding: 5px 0; }
.onboarding-step.done { color: var(--c); text-decoration: line-through; opacity: .6; }
```

**Critério de conclusão:** Usuário novo vê um checklist claro de primeiros passos que desaparece quando completo.

---

### TASK-10 — Explicação inline dos termos cyberpunk (modo vocabulário simples)

**Problema:** O glossário `LEXICON_PAIRS` (linha ~327 `app.js`) só é ativado manualmente em Configurações. Usuário novo nunca encontra isso.

**Arquivo:** `app.js`

**Onde:** `LEXICON_PAIRS` e função `applyLexicon()` ou similar. Também Setup Wizard passo de vocabulário.

**O que fazer:**
- No Setup Wizard, tornar a escolha de vocabulário o **primeiro passo**, não opcional/enterrada
- Opção padrão: "Vocabulário simples (Tarefa, Pontos, Sequência)"
- Opção alternativa: "Vocabulário cyberpunk (Contrato, Eddies, Streak)"
- Persistir em `myData.prefs.lexicon = 'simple' | 'cyber'`
- Se `lexicon === 'simple'`, aplicar automaticamente o mapa de substituição em todos os labels renderizados

**Critério de conclusão:** Usuário que escolhe "simples" no setup nunca vê "CONTRATO" ou "EDDIES" — vê "TAREFA" e "PONTOS".

---

### TASK-11 — Indicador de save mais discreto, botão SALVAR menor

**Problema:** O botão "SALVAR" na nav tem o mesmo peso visual que "PERFIL". Auto-save já funciona — o botão manual é só segurança extra.

**Arquivo:** `style.css`

**Onde:** `.nav-sync` (linha ~97 ou buscar no CSS). `.save-indicator`.

**O que fazer:**
- Reduzir `font-size` do botão SALVAR para `8px` e `opacity: 0.6`
- Quando `save-indicator` está ativo (há mudança pendente), elevar opacity para `1.0` e colorir de amarelo
- Adicionar `title="Salvar agora (auto-save ativo)"` no botão
- Esconder o botão em mobile (o auto-save cobre, e o footer do drawer tem)

**Critério de conclusão:** Nav visualmente mais limpa. Botão SALVAR existe mas não compete com PERFIL.

---

### TASK-12 — Labels abaixo dos ícones nas tabs de navegação (desktop)

**Problema:** As tabs de navegação são `icon-only` — só SVG, sem texto. Novo usuário não sabe o que cada ícone representa.

**Arquivo:** `app.js` função `renderNavTabs()` linha ~6705. `style.css` `.nav-tab.icon-only`.

**O que fazer:**
- Remover classe `icon-only` dos tabs ou adicionar um `<span class="nav-tab-label">` abaixo do ícone com o nome da página
- No CSS: flex-direction column, font-size 7px, letter-spacing 1px, color var(--muted)
- Limitar a 12 caracteres com text-overflow ellipsis

**Critério de conclusão:** Usuário vê ícone + nome curto em cada tab sem precisar de hover.

---

### TASK-13 — Separador visual entre ações do drawer e configurações do sistema

**Problema:** No side deck, "Início" (ações do dia) e "Sistema" (configurações técnicas) ficam no mesmo menu linear sem separação clara.

**Arquivo:** `app.js` drawer render (função que constrói o innerHTML do drawer, linha ~512).

**O que fazer:**
- Adicionar um `<div class="drawer-section-divider">SISTEMA</div>` antes do grupo "Sistema"
- CSS: `font-family: var(--mono); font-size: 7px; letter-spacing: 3px; color: var(--muted); padding: 8px 13px 4px; opacity: 0.5; text-transform: uppercase;`

**Critério de conclusão:** Visualmente claro que os grupos do topo são ações de uso diário e o grupo "Sistema" é administração.

---

### TASK-14 — Página Notificações — linguagem mais clara

**Problema:** A página de notificações usa termos técnicos: "Web Push", "service worker", "backend agendado". Usuário comum não entende.

**Arquivo:** `index.html` linhas ~657–667.

**O que fazer:**
- `notify-sub`: simplificar para "Ative alertas neste aparelho. Cada dispositivo precisa de permissão separada."
- `notify-warning`: simplificar para "Alertas com tela fechada precisam de configuração extra no servidor. Contate o criador do app."
- Manter os textos técnicos originais como `<details><summary>Detalhes técnicos</summary>...</details>`

**Critério de conclusão:** Usuário leigo entende como ativar alertas sem precisar saber o que é service worker.

---

### TASK-15 — Confirmação de exclusão com nome do item

**Problema:** Ao deletar um hábito, livro, projeto ou jogo, não há confirmação. Clique acidental apaga dados sem aviso.

**Arquivo:** `app.js`

**Onde:** Funções `deleteHabit()`, `removeBook()`, `removeProject()`, `removeGame()`, `removeReflexao()` — buscar por `splice` ou `filter` precedido de ação de delete.

**O que fazer:**
- Antes de cada delete, chamar:
```js
if (!confirm(`Remover "${htmlEscape(item.name)}"? Esta ação não pode ser desfeita.`)) return;
```
- Ou usar um toast de confirmação com botão "CONFIRMAR" e timeout de 5s

**Critério de conclusão:** Nenhum dado é deletado sem que o usuário confirme explicitamente.

---

## 🔴 PRIORIDADE ALTA TÉCNICA — Podem causar bugs visíveis

---

### TASK-16 — Grupo "Meus Atalhos" mostra "Nenhum atalho ativo" mesmo quando há distritos

**Problema potencial:** A função `operatorShortcuts()` no drawer (linha ~499 app.js) retorna `getDistricts()` filtrado. Se `getDistricts()` retorna array vazio na primeira renderização (antes dos dados carregarem), o grupo fica com texto "Nenhum atalho ativo" mesmo que o usuário tenha distritos.

**Arquivo:** `app.js`

**Onde:** Função `renderHomeDrawerShortcuts()` linha ~594 e `operatorShortcuts()` linha ~499.

**O que fazer:**
- Garantir que `renderHomeDrawerShortcuts()` é chamada após `applyData()` concluir
- Se `getDistricts()` retornar `[]` mas `myData` ainda não carregou, exibir estado de carregamento em vez de "Nenhum atalho ativo"
- Adicionar `id="home-drawer-shortcuts"` no container e atualizar apenas esse elemento quando dados carregam

**Critério de conclusão:** Grupo "Meus Atalhos" sempre reflete o estado real dos dados, nunca mostra falso negativo.

---

### TASK-17 — Drawer `data-group-key` inconsistente com nomes exibidos

**Problema técnico:** Os grupos do drawer usam `data-group-key` com os nomes originais em inglês/PT antigo ("criacao", "extras", "progresso") para persistir estado no localStorage. Mas o nome exibido mudou. Se alguém tiver salvo um estado de grupo com chave "Principal" (nome antigo), o restore vai falhar silenciosamente.

**Arquivo:** `app.js` — função que cria os grupos (linha ~501) e `_restoreGroupOrder()` (linha ~554).

**O que fazer:**
- Verificar `_restoreGroupOrder()` — ela usa `data-group-key` para mapear posições salvas
- Adicionar migração: se localStorage tem chave "Principal", renomear para "Início" no restore
- Ou: usar chaves estáveis em inglês que nunca mudam (`key="home"`, `key="shortcuts"`, etc.) separadas do label exibido

**Critério de conclusão:** Usuário que tinha drawer reordenado antes das renomeações não perde a ordem salva.

---

### TASK-18 — `setFriendButtonText()` atualiza `drawer-friend-btn` mas drawer pode não existir ainda

**Problema técnico:** `setFriendButtonText()` foi modificado para atualizar `document.getElementById('drawer-friend-btn')`. Mas o drawer é renderizado lazily (só quando aberto pela primeira vez, com `drawer.dataset.ready`). Se `setFriendButtonText` for chamado antes do drawer ser inicializado, `drawer-friend-btn` não existe e o update é silenciosamente ignorado.

**Arquivo:** `app.js` função `setFriendButtonText()` linha ~3905.

**O que fazer:**
- Verificar se o problema existe: buscar todas as chamadas a `setFriendButtonText()` e verificar se alguma ocorre antes de `renderHomeDrawer()` ser chamada
- Se sim: guardar o texto em variável e aplicar quando o drawer for inicializado:
```js
let _drawerFriendText = 'AMIGO';
function setFriendButtonText(text){
  _drawerFriendText = text;
  const df = document.getElementById('drawer-friend-btn');
  if (df) df.textContent = '💬 ' + text;
  // ... resto
}
// No init do drawer, após criar drawer-friend-btn:
document.getElementById('drawer-friend-btn').textContent = '💬 ' + _drawerFriendText;
```

**Critério de conclusão:** Botão do amigo no drawer sempre mostra o estado correto (AMIGO / VOLTAR / nome do amigo).

---

## 📋 RESUMO DE PRIORIDADES

| # | Tarefa | Impacto | Esforço | Para quem |
|---|--------|---------|---------|-----------|
| 01 | Setup Wizard automático | 🔴 Crítico | Baixo | Novos |
| 02 | Empty state na home | 🔴 Crítico | Baixo | Novos |
| 07 | Buscar acessível 1 clique | 🟠 Alto | Baixo | Existentes |
| 03 | Renomear CONTRATO | 🟠 Alto | Baixo | Novos |
| 05 | Subtítulo na tela de login | 🟠 Alto | Baixo | Novos |
| 04 | Tooltips de gamificação | 🟡 Médio | Baixo | Novos |
| 06 | Scroll para Modo Hoje | 🟡 Médio | Baixo | Existentes |
| 08 | Empty states em todos os cards | 🟠 Alto | Médio | Novos |
| 10 | Vocabulário simples no setup | 🟠 Alto | Médio | Novos |
| 09 | Onboarding checklist | 🟡 Médio | Médio | Novos |
| 11 | SALVAR mais discreto | 🟢 Baixo | Baixo | Ambos |
| 12 | Labels nas tabs | 🟡 Médio | Médio | Novos |
| 13 | Separador no drawer | 🟢 Baixo | Baixo | Ambos |
| 14 | Página Notificações | 🟡 Médio | Baixo | Ambos |
| 15 | Confirmação de exclusão | 🟠 Alto | Médio | Ambos |
| 16 | Atalhos falso negativo | 🔴 Bug | Médio | Ambos |
| 17 | Chaves do drawer | 🟡 Técnico | Médio | Existentes |
| 18 | drawer-friend-btn lazy | 🟡 Técnico | Baixo | Ambos |

---

*Gerado em 2026-06-08. Baseado em análise completa de `app.js`, `index.html` e `style.css`.*
