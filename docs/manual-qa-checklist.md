# Night City Manual QA Checklist

Checklist manual para validar uma release antes ou depois do deploy no GitHub Pages.

## Regras de teste

- Nao usar emails falsos em cadastro.
- Nao usar `signUp` em testes automatizados.
- Nao colar senhas, tokens, JWTs ou dados privados em issues.
- Confirmar que `node scripts/check.cjs` retorna `Night City check OK`.
- Confirmar que o GitHub Actions roda o bughunt autenticado com `3 passed`.

## Primeiro acesso

- Abrir `https://victorg-glitch.github.io/notion/`.
- Confirmar que a tela de login aparece sem piscar de forma excessiva.
- Confirmar que o badge de versao aparece: `NC build v0.3.2`.
- Confirmar que o login por email/senha funciona com conta ja confirmada.
- Confirmar que refresh mantem sessao.

## Setup wizard

- Entrar com usuario novo ou limpar setup de teste.
- Confirmar que o setup wizard abre.
- Confirmar que `#setup-wizard` aparece no primeiro acesso e nao mudou o fluxo esperado pelo E2E.
- Confirmar progresso visual do setup com 4 passos: Terminal, Foco, Preview e Ativar.
- Confirmar microcopy clara em cada etapa, explicando por que o passo existe.
- Selecionar foco, estado da rotina e tempo diario.
- Confirmar que o CTA `COMECAR PRIMEIRA MISSAO` e o botao dominante.
- Confirmar que `EDITAR ANTES`, `USAR BASE` e `FECHAR` ficam secundarios/discretos.
- Usar `COMECAR PRIMEIRA MISSAO`.
- Confirmar transicao para Modo Hoje com contratos iniciais, linha-guia `AGORA` e sem tela vazia confusa.
- Em mobile, confirmar que o wizard nao cria overflow horizontal e permite rolagem interna.

## Modo Hoje

- Confirmar que o app abre com o Modo Hoje como tela principal.
- Confirmar que a Home mostra o painel do dia como bloco principal e usa bem a largura em desktop.
- Confirmar que a linha-guia `AGORA` aparece acima dos CTAs e muda conforme o estado:
  - sem contratos: orienta criar uma missao pequena;
  - com pendencias: orienta comecar foco;
  - tudo feito sem revisao: orienta fazer revisao diaria;
  - tudo feito com revisao: orienta voltar amanha.
- Confirmar que `+ CONTRATO`, `COMECAR FOCO` e `REVISAR DIA` ficam claros.
- Confirmar que `COMECAR FOCO` continua sendo o CTA dominante.
- Confirmar progresso do dia e proxima recompensa.
- Confirmar o card `PROGRESSO DA SEMANA` com contratos, focos, minutos e revisoes.
- Confirmar o texto `RESUMO DA SEMANA` e a chamada para voltar amanha.
- Em mobile, confirmar que nao ha overflow horizontal.
- No painel completo, confirmar que Street Cred, Eddies, Rank, Season, ICE e Conquistas ficam rebaixados em `STATUS DO OPERADOR`.
- Confirmar que `STATUS DO OPERADOR` expande/recolhe sem esconder contratos, revisao, progresso ou Side Deck.

## Navegacao Today-first

- Abrir e fechar o drawer pelo botao de tres tracos no topo.
- Confirmar que o botao textual `SIDE DECK // AREAS DO SISTEMA` nao aparece mais no painel.
- Confirmar que o Side Deck aparece agrupado em Principal, Atalhos do operador, Progresso, Biblioteca, Criacao / logs, Paginas extras e Sistema.
- Confirmar que `Atalhos do operador` aparece logo apos Principal e lista distritos/abas criadas pelo usuario.
- Confirmar que o drawer e os atalhos rolam internamente quando houver muitos itens.
- Confirmar que os grupos recolhem/expandem sem travar a tela.
- Confirmar destaque do item ativo no Side Deck.
- Acessar Modo Hoje, Contratos e Rotinas pelo grupo Principal.
- Acessar Consistencia, Habits e Notificacoes pelo grupo Progresso.
- Acessar Leitura, Projetos/Dev, Jogos e Reflexoes pelo grupo Biblioteca.
- Acessar Dev/Logs, Violao/Logs, Distritos e paginas custom pelo drawer.
- Acessar Mercado / Black Market, Commlink, Backup/Diagnostico, Perfil e Configuracoes pelo grupo Sistema.
- Em mobile, confirmar que o drawer abre pela lateral, fecha ao escolher item e nao cria overflow.
- Confirmar que modais de contrato, foco, revisao e backup continuam clicaveis com o drawer fechado.

## Foco

- Abrir `COMECAR FOCO`.
- Testar presets 10, 15, 25, 30, 45 e 60 minutos.
- Testar tempo customizado entre 1 e 180 minutos.
- Pausar e retomar.
- Sair sem concluir e confirmar que a missao nao marca como feita.
- Concluir e confirmar feedback visual.
- Confirmar feedback padronizado `PROGRESSO REGISTRADO` ou `RITMO MANTIDO` depois de foco/missao.

## Revisao diaria e missao herdada

- Abrir `REVISAR DIA`.
- Preencher energia, foco, nota e `MISSAO DE AMANHA`.
- Salvar revisao.
- Confirmar toast `PROGRESSO REGISTRADO` com texto `REVISAO SALVA`.
- No dia seguinte ou em teste controlado, confirmar `MISSAO HERDADA DE ONTEM`.
- Testar status:
  - `PENDENTE`
  - `FOCO INICIADO`
  - `CONVERTIDA`
  - `IGNORADA`
  - `CONCLUIDA`
- Confirmar que converter nao duplica contrato.
- Confirmar que ignorar nao reaparece no mesmo dia.

## Estados vazios

- Sem contratos: deve mostrar acao para criar contrato ou montar rotina.
- Sem dados carregados ainda: deve aparecer skeleton/placeholder simples no Modo Hoje, sem tela morta.
- Sem missao herdada: deve orientar para criar contrato ou revisar o dia.
- Sem revisao diaria: deve indicar fechamento do dia.
- Sem missao de amanha: deve explicar que a missao de retorno ainda nao foi armada.
- Sem livros/projetos/jogos/logs: cada area deve mostrar uma explicacao curta e um CTA principal.
- Sem contatos no Commlink: deve orientar adicionar por nick/tag ou ID.

## Abas e distritos

- Confirmar cabecalho padrao em Leitura, Projetos/Dev, Violao, Jogos e Reflexoes.
- Confirmar que cada cabecalho mostra titulo, uma linha de proposito e contador/status.
- Confirmar que cada aba tem um CTA principal claro no cabecalho.
- Confirmar que Rotinas e Distritos no Side Deck usam resumo/status e um CTA principal.
- Confirmar que paginas custom/distritos criados tambem mostram cabecalho padrao.
- Confirmar que estados vazios das abas usam a mesma estrutura visual e nao viram parede de botoes.
- Em mobile, confirmar que cabecalhos, status e CTAs nao criam overflow horizontal.

## Backup e diagnostico

- Exportar backup.
- Importar backup com preview.
- Restaurar backup anterior quando existir.
- Abrir `Backup e sistema`.
- Confirmar `VERSAO / CACHE` com appVersion, buildLabel e cacheVersion.
- Usar `VERIFICAR ATUALIZACAO` e confirmar feedback claro.
- Usar `RECARREGAR APP` somente depois de salvar dados pendentes.
- Usar `COPIAR DIAGNOSTICO`.
- Conferir que o texto nao contem senha, token, JWT, email completo, `user_data` inteiro ou mensagens privadas.

## PWA e cache

- Confirmar que o badge mostra o build mais recente.
- Confirmar que o service worker fica `ATIVO` ou `SUPORTADO`.
- Quando houver nova versao, confirmar banner `NOVA VERSAO DISPONIVEL`.
- Clicar `ATUALIZAR AGORA` e confirmar reload sem limpar dados.

## Commlink basico

- Abrir Commlink.
- Confirmar que Amigos por Proximidade nao aparece.
- Adicionar amigo por nick/tag.
- Adicionar amigo por ID.
- Abrir chat.
- Enviar mensagem.
- Abrir perfil publico.
- Confirmar que HOME/LEITURA aparecem apenas quando liberadas.
- Confirmar que DEV nao aparece quando bloqueado.

## Mobile

- Testar viewport pequeno.
- Confirmar que modais abrem com rolagem interna.
- Confirmar que botoes principais tem altura confortavel.
- Confirmar que badge de versao nao cria overflow.

## Fechamento

- Rodar:
  - `git diff --check`
  - `node scripts/check.cjs`
  - `npm run test:e2e`
  - `npm run bughunt`
- Confirmar GitHub Actions `Night City Checks` com `Success`.
