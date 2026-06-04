# Supabase Auth SMTP

Use um SMTP proprio para Supabase Auth em producao. O provedor padrao do Supabase e limitado, pode sofrer rate limit e nao deve ser usado como canal principal de emails transacionais.

Esta documentacao nao deve conter senha SMTP, API key, token, segredo ou credencial real.

## Por Que Usar SMTP Proprio

- Reduzir bounces causados por remetente generico.
- Aumentar controle sobre reputacao de dominio.
- Melhorar logs de entrega, abertura, bounce e bloqueio.
- Evitar rate limit do provedor padrao do Supabase.
- Separar ambiente de producao de testes locais.

Provedores recomendados:

- Resend
- Brevo
- Outro SMTP transacional com dominio verificado

## Onde Configurar No Supabase

No painel do Supabase:

1. Abra o projeto.
2. Acesse `Authentication`.
3. Entre em `Emails` ou `SMTP Settings`.
4. Ative SMTP customizado.
5. Preencha os campos do provedor.
6. Salve e envie um email de teste.

Campos necessarios:

| Campo | Descricao |
| --- | --- |
| SMTP Host | Host SMTP do provedor, por exemplo o endpoint SMTP da Resend ou Brevo |
| SMTP Port | Porta recomendada pelo provedor, normalmente `587` com TLS |
| SMTP User | Usuario SMTP informado pelo provedor |
| SMTP Password | Senha SMTP ou API key SMTP do provedor |
| Sender email | Email remetente verificado no provedor |
| Sender name | Nome exibido no email, por exemplo `Night City` |

Nunca salve esses valores no repositorio.

## Checklist De Configuracao

- [ ] Criar conta no provedor SMTP.
- [ ] Configurar dominio ou remetente no provedor.
- [ ] Verificar DNS exigido pelo provedor, como SPF, DKIM e DMARC.
- [ ] Aguardar propagacao/validacao do dominio.
- [ ] Configurar SMTP no Supabase Auth.
- [ ] Enviar email de teste pelo painel do Supabase.
- [ ] Testar signup com email real.
- [ ] Testar reset de senha com email real.
- [ ] Verificar logs de entrega no provedor.
- [ ] Monitorar bounces, blocks e spam complaints.

## Como Testar Cadastro

Use somente email real e acessivel.

1. Abra o app em producao.
2. Entre em `CRIAR CONTA`.
3. Use um email real.
4. Confirme o email recebido.
5. Volte ao app e faca login.
6. Verifique no provedor SMTP se o email foi entregue sem bounce.

Nao use:

- `teste.com`
- `example.com`
- `fake.com`
- emails descartaveis
- emails que voce nao consegue abrir

Aliases reais do Gmail sao aceitaveis para teste manual, por exemplo `usuario+teste@gmail.com`.

## Como Testar Reset De Senha

1. Abra a tela de login.
2. Clique em `ESQUECI A SENHA`.
3. Informe um email real de uma conta existente.
4. Confirme se o email chegou.
5. Abra o link de reset.
6. Defina a nova senha.
7. Verifique logs de entrega no provedor.

## Como Evitar Bounces

- Use apenas emails reais nos testes.
- Nao rode `signUp` em testes automatizados.
- Para E2E, use contas ja criadas e confirmadas com `signInWithPassword`.
- Use aliases reais do Gmail apenas quando precisar testar cadastro manual.
- Bloqueie dominios descartaveis no frontend antes de chamar Supabase Auth.
- Monitore os logs de bounce no provedor SMTP.
- Remova ou corrija qualquer endereco que gere bounce.

## Fluxo De QA

O QA do projeto deve seguir estas regras:

- Nao usar email falso.
- Nao usar `signUp` em teste automatizado.
- Usar contas ja confirmadas para E2E.
- Usar `signInWithPassword` para smoke tests automatizados.
- Usar aliases reais do Gmail somente quando o objetivo for validar cadastro.
- Nao salvar email, senha, token ou segredo em arquivos versionados.
- Nao usar `service_role` em testes de usuario comum.

## Validacao Local

Depois de atualizar documentacao ou fluxo relacionado a Auth, rode:

```bash
node scripts/check.cjs
git diff --check
```

O check minimo deve retornar:

```text
Night City check OK
```
