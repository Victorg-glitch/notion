# Night City — Regras para Claude Code

## Antes de qualquer push para main

**Sempre executar, nesta ordem, antes de `git push`:**

```bash
node --check app.js
node scripts/check.cjs   # deve imprimir: Night City check OK
```

Se qualquer um falhar: corrigir antes de commitar.

Após push, disparar o bughunt no CI:
- O workflow `check.yml` roda automaticamente em todo push.
- Para disparar manualmente: usar `mcp__github__actions_run_trigger` com `workflow_id: check.yml`, `ref: main`.
- Aguardar `conclusion: success` antes de considerar a entrega concluída.

## Regras de segurança (nunca violar)

- Nenhum `onclick=` inline — tudo via `data-action` / `data-value`
- Todo dado de usuário exibido em HTML passa por `htmlEscape()`
- Nenhum `service_role`, nenhuma `policy using(true)`, não abrir RLS
- Manter `friend_profile_directory` com `security_invoker=true`
- Manter `friend_profiles` sem SELECT amplo para `authenticated`
- HOME/LEITURA lendo apenas `friend_shared_sections` por owner e section
- Não enfraquecer `scripts/check.cjs`

## Regras de desenvolvimento

- Todo campo novo em `myData` vai em `SAVE_KEYS` (`modules/state.js`) e recebe normalização em `modules/migrations.js`
- Nenhum commit sem `node scripts/check.cjs` passar primeiro
- Sempre push direto na `main` (não usar feature branches)
- Não usar `--no-verify` para bypassar hooks
