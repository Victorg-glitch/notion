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
- Confirmar que o badge de versao aparece: `NC build v0.2.3`.
- Confirmar que o login por email/senha funciona com conta ja confirmada.
- Confirmar que refresh mantem sessao.

## Setup wizard

- Entrar com usuario novo ou limpar setup de teste.
- Confirmar que o setup wizard abre.
- Selecionar foco, estado da rotina e tempo diario.
- Usar `COMECAR PRIMEIRA MISSAO`.
- Confirmar que a Home abre com contratos iniciais e sem tela vazia confusa.

## Modo Hoje

- Confirmar que a Home mostra o painel do dia como bloco principal.
- Confirmar que `+ CONTRATO`, `COMECAR FOCO` e `REVISAR DIA` ficam claros.
- Confirmar progresso do dia e proxima recompensa.
- Em mobile, confirmar que nao ha overflow horizontal.

## Foco

- Abrir `COMECAR FOCO`.
- Testar timers 5, 15, 25 e 30 minutos.
- Pausar e retomar.
- Sair sem concluir e confirmar que a missao nao marca como feita.
- Concluir e confirmar feedback visual.

## Revisao diaria e missao herdada

- Abrir `REVISAR DIA`.
- Preencher energia, foco, nota e `MISSAO DE AMANHA`.
- Salvar revisao.
- Confirmar toast `REVISAO SALVA`.
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
- Sem missao herdada: deve orientar para criar contrato ou revisar o dia.
- Sem revisao diaria: deve indicar fechamento do dia.
- Sem missao de amanha: deve explicar que a missao de retorno ainda nao foi armada.
- Sem livros/projetos/jogos/logs: cada area deve mostrar CTA e template rapido.
- Sem contatos no Commlink: deve orientar adicionar por nick/tag ou ID.

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
