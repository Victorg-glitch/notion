# NIGHT CITY - SECURITY

## RLS Validation Checkpoint

Checkpoint validado com duas contas reais e confirmadas no Supabase.

- Autenticacao usada no teste: `signInWithPassword`.
- Nao foi usado `service_role`.
- Nao foi usado `signUp`.
- Nao foram criados usuarios novos durante o teste.
- Nenhum email, senha, token ou dado sensivel foi salvo no repositorio.

Resultado validado:

- `user_data` ficou isolado por usuario.
- Um usuario nao conseguiu ler dados privados de outro usuario em `user_data`.
- Um usuario nao conseguiu alterar dados privados de outro usuario em `user_data`.
- Um usuario nao conseguiu deletar dados privados de outro usuario em `user_data`.
- `friend_profile_directory` retornou somente campos publicos limitados:
  - `owner`
  - `nick`
  - `tag`
  - `name`
  - `level`
  - `updated_at`
- `friend_profiles` permite somente colunas basicas autorizadas para contatos permitidos.
- `select *` em `friend_profiles` retorna `403`, impedindo leitura ampla de campos privados.
- Secoes compartilhadas respeitam as permissoes do dono do perfil.
- Secoes bloqueadas nao ficam acessiveis pelo contato.
- `friend_messages` restringe leitura e escrita ao canal autorizado.
- Canais de terceiros nao ficam acessiveis para usuarios fora da conversa.
- `node scripts/check.cjs` retornou:

```text
Night City check OK
```

Esse checkpoint nao substitui novas validacoes em producao quando houver mudancas de RLS, novas tabelas, novas views ou alteracoes no Commlink.
