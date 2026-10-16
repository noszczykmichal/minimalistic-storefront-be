# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

NestJS 12 backend (ESM, TypeScript) for a minimalistic storefront, using Prisma 7 with PostgreSQL. A frontend is expected at `http://localhost:3000` (CORS with credentials is enabled for that origin only); the API listens on `PORT` or `8000`.

## Commands

- Package manager is **pnpm**.
- After changing schema.prisma: `pnpm prisma migrate dev --name <name>` then `pnpm prisma generate`

```bash
docker compose up -d          # Postgres on :5432 + Adminer on :8080 (credentials: see docker-compose.yml / .env)
pnpm start:dev                # watch mode
pnpm build                    # nest build -> dist/
pnpm lint                     # oxlint --type-aware (no-floating-promises is an error)
pnpm format                   # prettier
pnpm test                     # vitest unit tests (**/*.spec.ts)
pnpm test:e2e                 # vitest e2e tests (**/*.e2e-spec.ts, config: vitest.config.e2e.ts)
pnpm vitest run path/to/file.spec.ts       # single test file
pnpm vitest run -t "test name"             # single test by name
```

Prisma — the config file is **`prisma7.config.ts`** (non-default name), so pass it explicitly:

```bash
pnpm prisma generate --config prisma7.config.ts
pnpm prisma migrate dev --name <name> --config prisma7.config.ts
```

Required env vars (`.env`, loaded by `@nestjs/config` and by the Prisma config via `dotenv`): `DATABASE_URL`, `JWT_SECRET`.

E2E tests use **`.env.test`** (committed; loaded with override by `test/setup/`), which points at the `storefront_test` database. The global setup creates that database if missing and runs `prisma migrate deploy`; it refuses to run unless the database name contains `test`. Files run sequentially (`fileParallelism: false`) because they share one database. Requires `docker compose up -d`.

## Architecture

- **ESM project**: `"type": "module"` with `nodenext` resolution — relative and alias imports must use the `.js` extension (e.g. `@/auth/auth.service.js`). `@/*` maps to `src/*` (resolved in tests via `vite-tsconfig-paths`). `main.ts` uses top-level `await`.
- **Prisma client is generated into `src/generated/prisma`** (gitignored; `prisma-client` generator, ESM). Import from `@/generated/prisma/client.js`, not `@prisma/client`. Regenerate after any schema change.
- **`PrismaService`** (`src/prisma/`) extends `PrismaClient` using the `@prisma/adapter-pg` driver adapter and is provided by a `@Global()` `PrismaModule`. It sets a global `omit: { user: { passwordHash: true } }` — queries that need the hash (e.g. `UserService.findOneWithEmail`) must `select` it explicitly.
- **`configureApp(app)`** (`src/app.setup.ts`) applies `cookieParser`, CORS and the global `ValidationPipe`; it's called by `main.ts` and must be called by e2e tests too. Swagger setup stays in `main.ts`.
- **Global `ValidationPipe`** with `whitelist`, `forbidNonWhitelisted`, `transform` — DTOs (class-validator + class-transformer) define the accepted request shape; unknown fields are rejected. DTOs normalize input (trim, lowercase email) via `@Transform`.
- **Auth flow** (`src/auth/`):
  - `POST /auth/signup` → `UserService.create` (bcrypt hash; unique-email violation `P2002` mapped to a generic 400).
  - `POST /auth/login` returns a short-lived JWT access token (5 min, `JwtModule` registered globally) in the body, and sets an opaque refresh token in the httpOnly `__session` cookie.
  - Refresh tokens are random bytes stored only as SHA-256 hashes in the `Session` table (7-day TTL). `POST /auth/refresh` rotates the token: deletes the old session and creates a new one inside a transaction. `POST /auth/logout` deletes the session and clears the cookie.
  - Login compares against a dummy bcrypt hash when the user doesn't exist to avoid user-enumeration timing differences.
  - TTLs and bcrypt rounds live in `src/auth/auth.constants.ts`.
- **Tests**: unit specs sit next to the code (`src/**/*.spec.ts`) and construct classes directly with mocked dependencies. E2E specs live in `test/` and boot the full app via `createTestApp()` (`test/helpers/app.ts`, which calls `configureApp`); `test/helpers/auth.ts` has signup/login helpers and session-cookie parsing.
