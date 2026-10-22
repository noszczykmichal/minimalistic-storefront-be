# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working preferences

- When asked for a PR summary (or PR description), return it as raw Markdown inside a fenced ` ```markdown ` code block, so it can be copied and pasted into GitHub as-is.

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

Required env vars (`.env`, loaded by `@nestjs/config` and by the Prisma config via `dotenv`): `DATABASE_URL`, `JWT_SECRET`. Optional: `TRUST_PROXY=cloud-run` (production only, see Rate limiting below).

E2E tests use **`.env.test`** (committed; loaded with override by `test/setup/`), which points at the `storefront_test` database. The global setup creates that database if missing and runs `prisma migrate deploy`; it refuses to run unless the database name contains `test`. Files run sequentially (`fileParallelism: false`) because they share one database. Requires `docker compose up -d`.

## Architecture

- **ESM project**: `"type": "module"` with `nodenext` resolution — relative and alias imports must use the `.js` extension (e.g. `@/auth/auth.service.js`). `@/*` maps to `src/*` (resolved in tests via Vitest's `resolve.tsconfigPaths`). `main.ts` uses top-level `await`.
- **Prisma client is generated into `src/generated/prisma`** (gitignored; `prisma-client` generator, ESM). Import from `@/generated/prisma/client.js`, not `@prisma/client`. Regenerate after any schema change.
- **`PrismaService`** (`src/prisma/`) extends `PrismaClient` using the `@prisma/adapter-pg` driver adapter and is provided by a `@Global()` `PrismaModule`. It sets a global `omit: { user: { passwordHash: true } }` — queries that need the hash (e.g. `UserService.findOneWithEmail`) must `select` it explicitly.
- **`configureApp(app)`** (`src/app.setup.ts`, takes a `NestExpressApplication`) applies the `trust proxy` setting, `cookieParser`, CORS, the global `ValidationPipe` and the global route prefix `api` (all routes live under `/api/...`, e.g. `/api/auth/login`); it's called by `main.ts` and must be called by e2e tests too. Swagger setup stays in `main.ts` and must run after `configureApp`, otherwise the generated docs miss the `/api` prefix. The Swagger UI itself is served at `/docs` (not prefixed).
- **Global `ValidationPipe`** with `whitelist`, `forbidNonWhitelisted`, `transform` — DTOs (class-validator + class-transformer) define the accepted request shape; unknown fields are rejected. DTOs normalize input (trim, lowercase email) via `@Transform`.
- **Auth flow** (`src/auth/`):
  - `POST /auth/signup` → `UserService.create` (bcrypt hash; unique-email violation `P2002` mapped to a generic 400).
  - `POST /auth/login` returns a short-lived JWT access token (5 min, `JwtModule` registered globally) in the body, and sets an opaque refresh token in the httpOnly `__session` cookie.
  - Refresh tokens are random bytes stored only as SHA-256 hashes in the `Session` table (7-day TTL). `POST /auth/refresh` rotates the token: deletes the old session and creates a new one inside a transaction. `POST /auth/logout` deletes the session and clears the cookie.
  - Login compares against a dummy bcrypt hash when the user doesn't exist to avoid user-enumeration timing differences.
  - TTLs, bcrypt rounds and the auth rate limits (`LOGIN_THROTTLE`, `SIGNUP_THROTTLE`) live in `src/auth/auth.constants.ts`.
- **Rate limiting** (`@nestjs/throttler`): `ThrottlerModule.forRoot` in `AppModule` sets the default (100 req/min per IP); `ThrottlerGuard` is a provider plus `{ provide: APP_GUARD, useExisting: ThrottlerGuard }` so tests can override it. Login (10/min) and signup (5/hour) tighten it with `@Throttle`. Storage is in-memory, i.e. per instance (Cloud Run runs with `--max-instances=1`).
- **Client IP on Cloud Run**: the throttler keys on `req.ip`. With `TRUST_PROXY=cloud-run`, `configureApp` sets Express `trust proxy` to `cloudRunTrustProxy` (`src/trust-proxy.ts`): hop 0 (Cloud Run's front end) is always trusted, hop 1 only if it's in Firebase Hosting's range `66.249.64.0/19` (the frontend calls the API through a Firebase `/api/**` rewrite), nothing further. Don't replace it with a fixed hop count — direct calls to the `run.app` URL have one hop fewer, so a fixed count lets clients spoof their IP via `X-Forwarded-For`.
- **CI/CD** (`.github/workflows/ci-cd.yml`, shared setup in `.github/actions/setup`): on PRs to `main` and pushes to `main`, lint + unit + e2e (Postgres service container) run in parallel, then build (`pnpm build` + `docker build`). On push to `main` only, the `deploy` job (GitHub environment `production`, Workload Identity Federation) pushes the image to Artifact Registry, runs `prisma migrate deploy` if `PROD_DATABASE_URL` is set, and runs `gcloud run deploy` with only `--image`, so service config is untouched. The pnpm version is pinned via `packageManager` in `package.json` (used by CI and by corepack in the Dockerfile). If you rename a job, update the required checks in the branch ruleset.
- **Deploy infrastructure** (GCP project `minimalistic-storefront`, number `498798658012`): WIF pool `github` with provider `github-repo`, which only accepts this repo's `production` environment. The deploy service account is `github-deployer@minimalistic-storefront.iam.gserviceaccount.com`, with `run.admin`, `artifactregistry.writer` on `cloud-run-source-deploy`, and `serviceAccountUser` on the runtime account `498798658012-compute@developer.gserviceaccount.com`. The GitHub environment `production` holds these as variables (`GCP_*`) plus the secret `PROD_DATABASE_URL`: Supabase's **session** pooler (port 5432). The transaction pooler (6543) breaks `prisma migrate`, and the direct host is IPv6-only, which GitHub runners can't reach.
- **Tests**: unit specs sit next to the code (`src/**/*.spec.ts`) and construct classes directly with mocked dependencies. E2E specs live in `test/` and boot the full app via `createTestApp()` (`test/helpers/app.ts`, which calls `configureApp`); `test/helpers/auth.ts` has signup/login helpers and session-cookie parsing. `createTestApp()` disables the throttler (specs log in far more often than the limits allow); pass `createTestApp({ throttle: true })` to test rate limiting, and set `process.env.TRUST_PROXY = "cloud-run"` before it to simulate Cloud Run — the local socket then acts as hop 0, so send `X-Forwarded-For` exactly as Cloud Run would deliver it (see `test/auth/throttle.e2e-spec.ts`).
