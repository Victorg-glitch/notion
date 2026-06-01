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
| `habits` | Habitos marcados por semana |
| `taskDefs` | Lista customizada de contratos |
| `habitDefs` | Lista customizada de habitos |
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

## Paginas

| Pagina | Rota interna | Conteudo |
| --- | --- | --- |
| Home | `home` | Contratos do dia, Intel, Habits tracker, Routines e Distritos |
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
- Habitos semanais
- Rotinas
- Skills de Dev
- Tecnicas de Violao
- Distritos

Os controles de edicao aparecem como `EDIT` ao lado do titulo de cada bloco.

## Modo amigo

A navbar possui a acao `AMIGO`, que carrega o outro perfil:

- Victor visualiza Caio.
- Caio visualiza Victor.

Antes de abrir o perfil, o app verifica se o amigo aprovou o acesso. Se ainda nao houver permissao, a acao `AMIGO` envia um pedido. Quando o outro usuario entrar, ele recebe um banner para `APROVAR` ou `RECUSAR`.

Depois da aprovacao, o modo amigo mostra um banner de `SOMENTE LEITURA`, troca os dados exibidos para o perfil do amigo e bloqueia edicoes, exclusoes, checks, pontuacoes e salvamento. A acao `VOLTAR` retorna para o proprio perfil.

A permissao fica salva na chave `friendRequests` do usuario que precisa aprovar.

## Salvamento

O botao `SALVAR` na navbar chama `saveAll()`, que coleta o estado atual da interface e faz `upsert` das chaves no Supabase com `Promise.all`.

## Reset semanal dos habitos

O bloco `Habits tracker` possui a acao `RESET SEMANA`.

Ao clicar, o app pede confirmacao antes de limpar todos os habitos marcados na semana atual. Depois da confirmacao, a chave semanal em `habits` e zerada, a tabela e atualizada e o auto-save agenda o envio para o Supabase.

## Roadmap

- Auto-save sem precisar clicar em `SALVAR`
- Notificacoes e lembretes
- Graficos de consistencia ao longo do tempo
