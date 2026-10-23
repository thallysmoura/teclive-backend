# Estrutura PostgreSQL do euGestor

- `schema.sql`: snapshot completo da estrutura do banco local, exportado por `pg_dump --schema-only --no-owner --no-privileges`.
- `schema.metadata.json`: data da exportação, tabelas, checksum SHA-256 e resultado da restauração de teste.
- `../prisma/schema.prisma`: modelos mantidos pela aplicação.
- `../prisma/migrations/`: histórico versionado para criar e atualizar o banco.

Inclui tabelas, tipos, índices, constraints e relacionamentos. Não inclui registros da aplicação, senhas, tokens, coordenadas de usuários ou credenciais. O conteúdo de `_prisma_migrations` também não é exportado.

## Atualizar o snapshot

Com Docker ativo e o PostgreSQL local `eugestor-postgres` disponível, execute na pasta da API:

```sh
node scripts/backup-schema.mjs --verify
```

O script lê `DATABASE_URL` do ambiente ou `.env`, aceita somente o banco local `eugestor`, exporta a estrutura e testa a restauração em um banco temporário. O banco temporário é removido ao final. Para outro nome de container, configure `PG_CONTAINER`.

## Recriar a estrutura para a aplicação

Configure `DATABASE_URL` para um banco vazio no ambiente desejado e execute:

```sh
npx prisma migrate deploy
npx prisma generate
```

Esse é o caminho recomendado: cria as tabelas e registra corretamente o histórico das migrations. Não restaura usuários nem dados operacionais. O seed é opcional e deve ser revisado antes de qualquer execução.

Para inspeção ou restauração estrutural isolada, `schema.sql` pode ser aplicado com `psql --set=ON_ERROR_STOP=1 --single-transaction --file=database/schema.sql` em um banco vazio. Como o snapshot não contém o histórico de migrations, não execute `migrate deploy` sobre essa restauração sem antes fazer o baseline do Prisma.

Alterações em produção precisam ter suas migrations aplicadas no ambiente correspondente. O envio ao GitHub não aplica migrations nem comprova deploy.
