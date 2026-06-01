# NIGHT CITY - LIFE SYSTEM

Dashboard pessoal de rotina com tema inspirado em Cyberpunk 2077, hospedado no GitHub Pages e sincronizado com Supabase.

O sistema foi pensado para dois usuarios, Victor e Caio, cada um com conta separada, senha propria e sessao persistente no navegador.

## Links

- Repositorio: https://github.com/Victorg-glitch/notion
- Site: https://victorg-glitch.github.io/notion/
- Arquivo principal: `index.html`

## Stack

- Frontend: HTML, CSS e JavaScript puro
- Banco de dados: Supabase/PostgreSQL
- Hospedagem: GitHub Pages
- Fontes: Orbitron, Rajdhani e Share Tech Mono via Google Fonts

## Supabase

- Project URL: `https://wmglywfsrlcpsspouufp.supabase.co`
- Public anon key: `sb_publishable_X6xbf9gD2JxmBXxthWG6lQ_gM5hvxeW`
- Tabela: `user_data`
- RLS: ativado, com politicas publicas de leitura e escrita

### Estrutura da tabela

Tabela `user_data`:

| Coluna | Tipo | Uso |
| --- | --- | --- |
| `username` | text | Usuario dono do dado |
| `data_key` | text | Chave logica do dado |
| `data_value` | jsonb | Conteudo salvo |
| `updated_at` | timestamp | Ultima atualizacao |

## Chaves de dados

Cada usuario possui linhas separadas por `data_key`:

| `data_key` | Conteudo |
| --- | --- |
| `pwd_hash` | Hash SHA-256 da senha |
| `tasks` | Contratos marcados por dia |
| `habits` | Historico semanal gerado pelos contratos do dia |
| `taskDefs` | Lista customizada de contratos |
| `habitDefs` | Lista legada de habitos customizados |
| `routines` | Rotinas customizadas |
| `skillDefs` | Skills customizadas da pagina Dev |
| `guitarSkillDefs` | Tecnicas customizadas da pagina Violao |
| `districts` | Distritos customizados |
| `books` | Livros |
| `projects` | Projetos |
| `devlog` | Log de estudo |
| `guitarlog` | Log de pratica de violao |
| `games` | Jogos |
| `reflexoes` | Diario/reflexoes |
| `skills` | Pontuacao das skills e tecnicas |
| `lastSeenWeek` | Ultima semana aberta pelo usuario para detectar virada semanal |
| `goals` | Metas configuraveis do painel Intel, livros e violao |

## Paginas

| Pagina | Rota interna | Conteudo |
| --- | --- | --- |
| Home | `home` | Contratos do dia, Intel, Habits tracker, painel de consistencia, Routines e Distritos |
| Leitura | `leitura` | Lista de livros e progresso mensal |
| Dev | `dev` | Skill tree, projetos e log de estudo |
| Violao | `violao` | Streak, tecnicas e log de pratica |
| Jogos | `jogos` | Biblioteca e jogo atual |
| Reflexoes | `reflexoes` | Diario pessoal |

## Autenticacao

- A senha e hasheada no navegador com `crypto.subtle.digest('SHA-256')`.
- O hash usa o salt fixo `night_city_salt`.
- A sessao fica salva em `localStorage` com a chave `nc_session_v2`.
- Se existir sessao salva, o app tenta auto-login ao carregar.
- No primeiro acesso, o usuario cria uma senha.
- Nos acessos seguintes, o hash digitado e comparado com o valor salvo no Supabase.

## Perfis

```js
const PROFILES = {
  victor: { name: 'VICTOR', avatar: '🔴', color: 'var(--y)', role: 'NETRUNNER' },
  caio:   { name: 'CAIO',   avatar: '🔵', color: 'var(--c)', role: 'CORPO' }
};
```

## Recursos editaveis

Os principais itens marcaveis podem ser personalizados pelo usuario:

- Contratos do dia
- Metas do painel Intel, leitura e violao
- Rotinas
- Skills de Dev
- Tecnicas de Violao
- Distritos

Os controles de edicao aparecem como `EDIT` ao lado do titulo de cada bloco.

O `Habits tracker` nao e editado manualmente. Ele usa os contratos do dia como linhas e marca automaticamente a coluna do dia atual quando um contrato e marcado.

## Metas configuraveis

O bloco `Intel atual` e dinamico. Ele puxa automaticamente:

- Livro com status `reading`
- Projeto com status `active`
- Jogo com status `playing`
- Skill prioritaria de Dev, calculada pela menor proporcao de progresso

A acao `EDIT` configura os fallbacks usados quando nao existe item ativo:

- Livro fallback
- Meta de livros por mes
- Dev fallback
- Skill fallback
- Jogo fallback
- Meta de minutos por dia no Violao

A pagina `Leitura` usa a meta de livros por mes no progresso mensal. A pagina `Violao` usa a meta de minutos por dia no status.

## Modo amigo

A navbar possui a acao `AMIGO`, que carrega o outro perfil:

- Victor visualiza Caio.
- Caio visualiza Victor.

Antes de abrir o perfil, o app verifica se o amigo aprovou o acesso. Se ainda nao houver permissao, a acao `AMIGO` envia um pedido. Quando o outro usuario entrar, ele recebe um banner para `APROVAR` ou `RECUSAR`.

Depois da aprovacao, o modo amigo mostra um banner de `SOMENTE LEITURA`, troca os dados exibidos para o perfil do amigo e bloqueia edicoes, exclusoes, checks, pontuacoes e salvamento. A acao `VOLTAR` retorna para o proprio perfil.

A permissao fica salva na chave `friendRequests` do usuario que precisa aprovar.

## Painel de consistencia

O bloco `Painel de consistencia` fica abaixo do `Habits tracker` e calcula:

- Percentual concluido da semana atual
- Percentual concluido do mes ate hoje
- Melhor habito da semana
- Pior habito da semana
- Streak diario de cada habito

Os calculos usam a chave `habits`, que salva os checks por semana, e acompanham os contratos customizados em `taskDefs`.

## Salvamento

O botao `SALVAR` na navbar chama `saveAll()`, que coleta o estado atual da interface e faz `upsert` das chaves no Supabase com `Promise.all`.

## Reset semanal dos habitos

O bloco `Habits tracker` possui a acao `RESET SEMANA`.

Ao clicar, o app pede confirmacao antes de limpar todos os checks da semana atual. Depois da confirmacao, a chave semanal em `habits` e zerada, a tabela e atualizada e o auto-save agenda o envio para o Supabase. A coluna do dia atual volta a refletir os contratos marcados.

## Auto-reset semanal inteligente

O app salva a ultima semana aberta em `lastSeenWeek`. Quando o usuario entra em uma semana nova, o sistema:

- Mostra um resumo da semana anterior
- Calcula percentual concluido, melhor contrato e pior contrato
- Exibe barras de conclusao por contrato
- Atualiza `lastSeenWeek` para a semana atual
- Comeca a semana atual limpa automaticamente, sem apagar o historico salvo nas semanas antigas de `habits`

## Notificacoes locais

O bloco `Lembretes locais` usa a Notification API do navegador para criar lembretes de:

- Leitura
- Violao
- Treino
- Dev

Cada lembrete pode ser ligado/desligado e ter o horario ajustado. A configuracao fica em `localStorage` por navegador e perfil, porque a permissao de notificacao e local do dispositivo.

As notificacoes funcionam quando o site esta aberto no navegador e a permissao foi concedida pelo usuario.

## Tema visual ajustavel

A navbar possui um seletor de tema com quatro variacoes:

- Arasaka amarelo
- Netrunner azul
- Maelstrom vermelho
- Corpo roxo

O tema altera as cores principais do sistema via variaveis CSS e fica salvo em `localStorage` por navegador e perfil.

## Animacoes Cyberpunk

O visual possui animacoes leves de scanline, grid, glitch no titulo, entrada de cards, brilho em botoes/checks e movimento nas barras de progresso. Ao selecionar uma aba, a tab ativa exibe uma barra curta de carregamento no estilo HUD. O CSS respeita `prefers-reduced-motion` para desativar animacoes quando o navegador solicitar reducao de movimento.

## Roadmap

- Auto-save sem precisar clicar em `SALVAR`
