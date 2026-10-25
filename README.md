# EuGestor API (Teclive)

API em **NestJS** (ESM) + **Prisma** + **PostgreSQL** do clone local do EuGestor.

## Como rodar

```bash
npm install
cp .env.example .env        # preencha DATABASE_URL, JWT_SECRET etc.
npx prisma migrate deploy   # aplica as migrações
npx prisma db seed          # itens de menu e usuário inicial
npm run start:dev           # http://localhost:4301
```

## Variáveis de ambiente (nomes)

| Variável | Para quê |
| --- | --- |
| `DATABASE_URL` | conexão do PostgreSQL |
| `JWT_SECRET` | assinatura dos tokens de sessão |
| `PORT`, `WEB_ORIGIN` | porta da API e origem permitida (CORS) |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_PUBLIC_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Cloudflare R2 (fotos de perfil e capturas das sugestões; o banco guarda só a URL) |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | integração com a OpenAI (`AiService` / `POST /ai/chat`) |

Segredos ficam só no `.env` (fora do git).

## Módulos principais

`auth` · `users` (permissões por item de menu) · `navigation` (menu dinâmico) · `cadastros` · `comercial` · `operacional` · `stock-locations` · `dashboard` · `settings` · `notifications` · `suggestions` (sugestões de melhoria) · `ai` (OpenAI) · `storage` (Cloudflare R2) · `presence` · `access-logs`.

## Estrutura do banco (PostgreSQL)

Gerada do banco real em 25/10/2026. A fonte da verdade são as migrações em `prisma/migrations` e o `prisma/schema.prisma`. **Dados de clientes não ficam no repositório.**


33 tabelas.

### `access_logs`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `userId` | text | sim |  | FK → users.id |
| `userName` | varchar(100) | não |  |  |
| `userEmail` | varchar(254) | não |  |  |
| `device` | varchar(16) | não |  |  |
| `userAgent` | varchar(512) | sim |  |  |
| `ip` | varchar(64) | sim |  |  |
| `locationStatus` | varchar(20) | não | `'not_requested'::character varying` |  |
| `latitude` | float8 | sim |  |  |
| `longitude` | float8 | sim |  |  |
| `accuracy` | float8 | sim |  |  |
| `city` | varchar(160) | sim |  |  |
| `region` | varchar(160) | sim |  |  |
| `country` | varchar(2) | sim |  |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |
| `avatarUrl` | text | sim |  |  |
| `status` | varchar(16) | não | `'VALID'::character varying` |  |

### `app_settings`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `key` | varchar(80) | não |  | PK |
| `value` | jsonb | não |  |  |
| `updatedBy` | varchar(200) | sim |  |  |
| `updatedAt` | timestamp | não |  |  |

### `calendar_events`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `title` | varchar(200) | não |  |  |
| `startsAt` | timestamp | não |  |  |
| `endsAt` | timestamp | não |  |  |
| `allDay` | boolean | não | `false` |  |
| `description` | text | sim |  |  |
| `ownerName` | varchar(200) | não |  |  |
| `ownerId` | text | sim |  |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `catalog_items`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `kind` | varchar(30) | não |  |  |
| `legacyId` | integer | sim |  |  |
| `description` | varchar(200) | não |  |  |
| `isActive` | boolean | não | `true` |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `company_profile`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não | `'main'::text` | PK |
| `cnpj` | varchar(14) | não |  |  |
| `legalName` | varchar(160) | não |  |  |
| `tradeName` | varchar(160) | não | `''::character varying` |  |
| `email` | varchar(254) | não | `''::character varying` |  |
| `phone` | varchar(20) | não | `''::character varying` |  |
| `postalCode` | varchar(8) | não |  |  |
| `street` | varchar(160) | não |  |  |
| `number` | varchar(20) | não |  |  |
| `district` | varchar(100) | não |  |  |
| `complement` | varchar(160) | não | `''::character varying` |  |
| `city` | varchar(100) | não |  |  |
| `state` | varchar(2) | não |  |  |
| `municipalRegistration` | varchar(40) | não | `''::character varying` |  |
| `stateRegistration` | varchar(40) | não | `''::character varying` |  |
| `substituteRegistration` | varchar(40) | não | `''::character varying` |  |
| `taxRegime` | varchar(24) | não |  |  |
| `cnae` | varchar(7) | não | `''::character varying` |  |
| `accountantEnabled` | boolean | não | `false` |  |
| `accountantName` | varchar(100) | não | `''::character varying` |  |
| `accountantEmail` | varchar(254) | não | `''::character varying` |  |
| `accountantPhone` | varchar(20) | não | `''::character varying` |  |
| `accountantCrc` | varchar(40) | não | `''::character varying` |  |
| `logoDataUrl` | text | sim |  |  |
| `boletoLogoDataUrl` | text | sim |  |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |
| `updatedAt` | timestamp | não |  |  |

### `notifications`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `userId` | text | não |  | FK → users.id |
| `title` | varchar(160) | não |  |  |
| `message` | text | não |  |  |
| `data` | jsonb | sim |  |  |
| `readAt` | timestamp | sim |  |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `op_causes`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `legacyId` | integer | sim |  |  |
| `description` | varchar(200) | não |  |  |
| `isActive` | boolean | não | `true` |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `op_defects`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `legacyId` | integer | sim |  |  |
| `description` | varchar(200) | não |  |  |
| `serviceMinutes` | integer | não | `0` |  |
| `closingMinutes` | integer | não | `0` |  |
| `isActive` | boolean | não | `true` |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `op_questionnaires`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `legacyId` | integer | sim |  |  |
| `title` | varchar(200) | não |  |  |
| `description` | varchar(500) | sim |  |  |
| `questionCount` | integer | não | `0` |  |
| `isActive` | boolean | não | `true` |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `op_solutions`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `legacyId` | integer | sim |  |  |
| `description` | varchar(200) | não |  |  |
| `isActive` | boolean | não | `true` |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `people`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `legacyId` | integer | sim |  |  |
| `type` | varchar(1) | não | `'F'::character varying` |  |
| `document` | varchar(20) | sim |  |  |
| `name` | varchar(200) | não |  |  |
| `nickname` | varchar(200) | sim |  |  |
| `rg` | varchar(30) | sim |  |  |
| `identifier` | varchar(60) | sim |  |  |
| `isClient` | boolean | não | `true` |  |
| `isSupplier` | boolean | não | `false` |  |
| `isEmployee` | boolean | não | `false` |  |
| `isTechnician` | boolean | não | `false` |  |
| `isCarrier` | boolean | não | `false` |  |
| `isSeller` | boolean | não | `false` |  |
| `taxpayerType` | integer | sim |  |  |
| `isFinalConsumer` | boolean | não | `false` |  |
| `municipalRegistration` | varchar(40) | sim |  |  |
| `stateRegistration` | varchar(40) | sim |  |  |
| `email` | varchar(200) | sim |  |  |
| `phone` | varchar(40) | sim |  |  |
| `isActive` | boolean | não | `true` |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |
| `becameClientAt` | timestamp | sim |  |  |
| `isLead` | boolean | não | `false` |  |
| `sellerName` | varchar(200) | sim |  |  |

### `quote_attachments`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `quoteId` | text | não |  | FK → quotes.id |
| `fileName` | varchar(200) | não |  |  |
| `caption` | varchar(200) | sim |  |  |
| `mimeType` | varchar(120) | não |  |  |
| `size` | integer | não |  |  |
| `fileData` | bytea | não |  |  |
| `userName` | varchar(200) | não |  |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `quote_history`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `quoteId` | text | não |  | FK → quotes.id |
| `userName` | varchar(200) | não |  |  |
| `description` | varchar(500) | não |  |  |
| `at` | timestamp | não |  |  |

### `quote_items`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `quoteId` | text | não |  | FK → quotes.id |
| `kind` | varchar(12) | não |  |  |
| `description` | varchar(300) | não |  |  |
| `identifier` | varchar(60) | sim |  |  |
| `unit` | varchar(20) | sim |  |  |
| `quantity` | numeric | não |  |  |
| `unitValue` | numeric | não |  |  |
| `discountValue` | numeric | não | `0` |  |
| `discountPercent` | numeric | não | `0` |  |
| `total` | numeric | não |  |  |
| `cost` | numeric | não | `0` |  |
| `rental` | boolean | não | `false` |  |
| `sortOrder` | integer | não | `0` |  |

### `quote_models`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `legacyId` | integer | sim |  |  |
| `description` | varchar(200) | não |  |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `quote_payments`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `quoteId` | text | não |  | FK → quotes.id |
| `method` | varchar(120) | não |  |  |
| `installments` | integer | não | `1` |  |
| `total` | numeric | não |  |  |
| `selected` | boolean | não | `false` |  |

### `quote_templates`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `description` | varchar(200) | não |  |  |
| `fileName` | varchar(200) | não |  |  |
| `fileData` | bytea | não |  |  |
| `isActive` | boolean | não | `true` |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `quotes`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `legacyId` | integer | sim |  |  |
| `number` | integer | não |  |  |
| `title` | varchar(200) | sim |  |  |
| `personId` | text | sim |  | FK → people.id |
| `personName` | varchar(200) | não |  |  |
| `personNickname` | varchar(200) | sim |  |  |
| `personDocument` | varchar(20) | sim |  |  |
| `personType` | varchar(1) | não | `'F'::character varying` |  |
| `personIsLead` | boolean | não | `false` |  |
| `sellerName` | varchar(200) | sim |  |  |
| `status` | integer | não | `3` |  |
| `purpose` | integer | não | `1` |  |
| `modality` | integer | não | `2` |  |
| `openedAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |
| `validUntil` | timestamp | não |  |  |
| `wonAt` | timestamp | sim |  |  |
| `releasedAt` | timestamp | sim |  |  |
| `cancelledAt` | timestamp | sim |  |  |
| `refusalReason` | varchar(200) | sim |  |  |
| `technicalSheet` | text | sim |  |  |
| `notes` | text | sim |  |  |
| `showNotes` | boolean | não | `false` |  |
| `contactName` | varchar(200) | sim |  |  |
| `contactEmail` | varchar(200) | sim |  |  |
| `contactPhone` | varchar(40) | sim |  |  |
| `address` | jsonb | sim |  |  |
| `openedBy` | varchar(200) | não |  |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `refresh_tokens`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `userId` | text | não |  | FK → users.id |
| `tokenHash` | text | não |  |  |
| `remember` | boolean | não | `false` |  |
| `expiresAt` | timestamp | não |  |  |
| `revokedAt` | timestamp | sim |  |  |
| `replacedBy` | text | sim |  |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `refusal_reasons`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `description` | varchar(200) | não |  |  |
| `usedWhen` | varchar(12) | não | `'CLIENT'::character varying` |  |
| `isActive` | boolean | não | `true` |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `sales_actions`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `personId` | text | sim |  | FK → people.id |
| `personName` | varchar(200) | não |  |  |
| `title` | varchar(200) | não |  |  |
| `actionDate` | timestamp | não |  |  |
| `durationHours` | numeric | não | `0` |  |
| `channel` | varchar(60) | não |  |  |
| `supportTeam` | varchar(120) | sim |  |  |
| `description` | text | sim |  |  |
| `isActive` | boolean | não | `true` |  |
| `createdBy` | varchar(200) | não |  |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `service_items`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `legacyId` | integer | sim |  |  |
| `description` | varchar(200) | não |  |  |
| `category` | varchar(200) | sim |  |  |
| `modality` | integer | não | `1` |  |
| `serviceType` | integer | não | `3` |  |
| `allowsRental` | boolean | não | `false` |  |
| `blocksOnDelinquency` | boolean | não | `false` |  |
| `cost` | numeric | não | `0` |  |
| `margin` | numeric | não | `50` |  |
| `price` | numeric | não | `0` |  |
| `isActive` | boolean | não | `true` |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `service_order_files`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `orderId` | text | não |  |  |
| `fileName` | varchar(200) | não |  |  |
| `mimeType` | varchar(120) | não |  |  |
| `size` | integer | não |  |  |
| `fileData` | bytea | não |  |  |
| `userId` | text | sim |  |  |
| `userName` | varchar(200) | não |  |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `service_orders`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `legacyId` | integer | sim |  |  |
| `number` | integer | não |  |  |
| `type` | integer | não | `1` |  |
| `purpose` | integer | não | `0` |  |
| `status` | integer | não | `0` |  |
| `defectName` | varchar(200) | sim |  |  |
| `personId` | text | sim |  |  |
| `personName` | varchar(200) | não |  |  |
| `personNickname` | varchar(200) | sim |  |  |
| `personType` | varchar(1) | não | `'F'::character varying` |  |
| `address` | jsonb | sim |  |  |
| `contact` | jsonb | sim |  |  |
| `openedBy` | varchar(200) | não | `'—'::character varying` |  |
| `openedAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |
| `closedAt` | timestamp | sim |  |  |
| `cancelledAt` | timestamp | sim |  |  |
| `interruptedAt` | timestamp | sim |  |  |
| `scheduleStart` | timestamp | sim |  |  |
| `scheduleEnd` | timestamp | sim |  |  |
| `technicians` | ARRAY | sim | `ARRAY[]::text[]` |  |
| `sellers` | ARRAY | sim | `ARRAY[]::text[]` |  |
| `quoteNumbers` | ARRAY | sim | `ARRAY[]::integer[]` |  |
| `technicalSheet` | text | sim |  |  |
| `totalServices` | numeric | não | `0` |  |
| `totalProducts` | numeric | não | `0` |  |
| `causeName` | varchar(200) | sim |  |  |
| `solutionName` | varchar(200) | sim |  |  |
| `paymentMethod` | varchar(100) | sim |  |  |
| `installments` | integer | sim |  |  |
| `detail` | jsonb | sim |  |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |
| `updatedAt` | timestamp | não |  |  |

### `sidebar_items`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `key` | text | não |  | PK |
| `label` | varchar(80) | não |  |  |
| `href` | text | sim |  |  |
| `section` | varchar(16) | não | `'main'::character varying` |  |
| `sortOrder` | integer | não | `0` |  |
| `embedUrl` | text | sim |  |  |
| `parentKey` | text | sim |  | FK → sidebar_items.key |
| `createdById` | text | sim |  | FK → users.id |

### `stock_balances`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `locationId` | text | não |  | FK → stock_locations.id |
| `balanceDate` | timestamp | não | `CURRENT_TIMESTAMP` |  |
| `userName` | varchar(160) | não |  |  |
| `status` | varchar(20) | não | `'OPEN'::character varying` |  |
| `filterType` | varchar(20) | não | `'PRODUCTS'::character varying` |  |
| `filterIds` | ARRAY | sim |  |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `stock_locations`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `legacyId` | integer | sim |  |  |
| `description` | varchar(160) | não |  |  |
| `isActive` | boolean | não | `true` |  |
| `isPrincipal` | boolean | não | `false` |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |
| `updatedAt` | timestamp | não |  |  |

### `stock_movement_items`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `movementId` | text | não |  | FK → stock_movements.id |
| `productId` | text | sim |  | FK → stock_products.id |
| `description` | varchar(300) | não |  |  |
| `type` | varchar(10) | não |  |  |
| `quantity` | numeric | não |  |  |
| `unit` | varchar(20) | não |  |  |
| `cost` | numeric | não |  |  |
| `locationName` | varchar(200) | não |  |  |

### `stock_movements`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `legacyId` | integer | sim |  |  |
| `description` | varchar(200) | não |  |  |
| `movementDate` | timestamp | não |  |  |
| `cancellationDate` | timestamp | sim |  |  |
| `userName` | varchar(160) | não |  |  |
| `operation` | integer | não |  |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `stock_product_balances`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `productId` | text | não |  | FK → stock_products.id |
| `locationId` | text | não |  | FK → stock_locations.id |
| `quantity` | numeric | não |  |  |

### `stock_products`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `description` | varchar(300) | não |  |  |
| `brand` | varchar(120) | não | `'Geral'::character varying` |  |
| `productGroup` | varchar(120) | não | `'Geral'::character varying` |  |
| `unit` | varchar(20) | não |  |  |
| `unitName` | varchar(60) | sim |  |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |
| `costPrice` | numeric | sim |  |  |
| `isActive` | boolean | não | `true` |  |
| `legacyId` | integer | sim |  |  |
| `model` | varchar(200) | sim |  |  |
| `salePrice` | numeric | sim |  |  |
| `alternativeDescription` | varchar(300) | sim |  |  |
| `allowNegativeStock` | boolean | não | `false` |  |
| `allowRental` | boolean | não | `false` |  |
| `barcode` | varchar(60) | sim |  |  |
| `identifier` | varchar(60) | sim |  |  |
| `margin` | numeric | sim |  |  |
| `supplierCode` | varchar(60) | sim |  |  |

### `suggestions`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `userId` | text | não |  | FK → users.id |
| `screenPath` | varchar(300) | não |  |  |
| `screenTitle` | varchar(200) | não |  |  |
| `category` | varchar(40) | não |  |  |
| `title` | varchar(160) | não |  |  |
| `description` | text | não |  |  |
| `imageUrl` | varchar(500) | sim |  |  |
| `viewport` | varchar(40) | sim |  |  |
| `userAgent` | varchar(300) | sim |  |  |
| `status` | varchar(20) | não | `'NOVA'::character varying` |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |

### `users`

| Coluna | Tipo | Nulo | Padrão | Chave |
| --- | --- | --- | --- | --- |
| `id` | text | não |  | PK |
| `email` | text | não |  |  |
| `passwordHash` | text | não |  |  |
| `name` | text | não |  |  |
| `createdAt` | timestamp | não | `CURRENT_TIMESTAMP` |  |
| `permissions` | ARRAY | sim | `ARRAY[]::text[]` |  |
| `role` | Role | não | `'USER'::"Role"` |  |
| `status` | UserStatus | não | `'ACTIVE'::"UserStatus"` |  |
| `avatarUrl` | text | sim |  |  |
| `lastDevice` | text | sim |  |  |
| `lastLoginAt` | timestamp | sim |  |  |
| `lastSeenAt` | timestamp | sim |  |  |
| `phone` | varchar(20) | sim |  |  |
