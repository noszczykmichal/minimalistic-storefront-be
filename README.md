# Minimalistic Storefront — Backend

> REST API for [Minimalistic Storefront](https://github.com/noszczykmichal/minimalistic-storefront), a mock-up of an online shop. This service handles user accounts and authentication.
> You can check the frontend live demo [_here_](https://minimalistic-storefront.web.app/).

## Table of Contents

- [General Info](#general-info)
- [Frontend](#frontend)
- [Technologies Used](#technologies-used)
- [Features](#features)
- [API](#api)
- [Setup](#setup)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contact](#contact)

## General Info

Minimalistic Storefront started as a frontend-only project. It loads its product catalog from an external GraphQL endpoint. This repository adds a backend of its own, beginning with user sign-up and session-based authentication. The goal is to move more of the shop's logic here over time.

The API is built with NestJS and Prisma on PostgreSQL. It issues short-lived JWT access tokens and keeps the user signed in with rotating refresh tokens stored in an httpOnly cookie.

## Frontend

The client app lives in a separate repository: **[noszczykmichal/minimalistic-storefront](https://github.com/noszczykmichal/minimalistic-storefront)** (React, TypeScript, Vite, Apollo Client, Redux Toolkit).

- Live demo: https://minimalistic-storefront.web.app/ (a test account for logging in without signing up is listed in the [frontend README](https://github.com/noszczykmichal/minimalistic-storefront#readme))
- In local development the frontend runs at `http://localhost:3000`. This is the only origin the API allows through CORS, with credentials enabled so the session cookie can be sent.

| Home page                                                                                                                         | Login page                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| ![Home page with the product listing](https://raw.githubusercontent.com/noszczykmichal/minimalistic-storefront/main/img/home.png) | ![Login page](https://raw.githubusercontent.com/noszczykmichal/minimalistic-storefront/main/img/login.png) |

## Technologies Used

- [NestJS 12](https://nestjs.com/) and [TypeScript](https://www.typescriptlang.org/) (ESM)
- [Prisma 7](https://www.prisma.io/) with the [`@prisma/adapter-pg`](https://www.prisma.io/docs/orm/overview/databases/postgresql) driver adapter
- [PostgreSQL 18](https://www.postgresql.org/), with [Docker Compose](https://docs.docker.com/compose/) and [Adminer](https://www.adminer.org/) for local development
- Auth: [@nestjs/jwt](https://github.com/nestjs/jwt), [bcryptjs](https://github.com/dcodeIO/bcrypt.js), [cookie-parser](https://github.com/expressjs/cookie-parser)
- Validation: [class-validator](https://github.com/typestack/class-validator) and [class-transformer](https://github.com/typestack/class-transformer)
- Rate limiting: [@nestjs/throttler](https://github.com/nestjs/throttler)
- API docs: [Swagger / OpenAPI](https://docs.nestjs.com/openapi/introduction)
- Testing: [Vitest](https://vitest.dev/) and [Supertest](https://github.com/ladjs/supertest)
- Code quality: [oxlint](https://oxc.rs/docs/guide/usage/linter) (type-aware) and [Prettier](https://prettier.io/)
- Package manager: [pnpm](https://pnpm.io/)

## Features

1. **Sign-up.** Passwords are hashed with bcrypt. A duplicate email returns a generic error, so the response doesn't reveal which addresses are registered.
2. **Login.** Returns a JWT access token that expires after 5 minutes and sets an opaque refresh token in an httpOnly `__session` cookie that lasts 7 days.
3. **Refresh-token rotation.** Every refresh replaces the old session with a new one inside a database transaction, so each refresh token works only once.
4. **Logout.** Deletes the session on the server and clears the cookie.
5. **Hashed refresh tokens.** The database stores only SHA-256 hashes of refresh tokens, never the tokens themselves.
6. **Timing-safe login.** When the user doesn't exist, the password is still checked against a dummy hash, so response times don't reveal which emails are registered.
7. **Strict input validation.** DTOs reject unknown fields and normalise input, for example by trimming whitespace and lowercasing emails.
8. **Row Level Security** is enabled on the `User` and `Session` tables.
9. **Rate limiting.** Every route allows 100 requests per minute per IP. Login is limited to 10 attempts per minute, failed ones included, and sign-up to 5 per hour. On Cloud Run the client IP comes from `X-Forwarded-For`, and entries a client could have faked are ignored (see [Deployment](#deployment)).

## API

All routes are served under the `/api` prefix.

| Method | Route               | Description                                                      | Rate limit (per IP) |
| ------ | ------------------- | ---------------------------------------------------------------- | ------------------- |
| POST   | `/api/auth/signup`  | Create an account (`firstName`, `lastName`, `email`, `password`) | 5 / hour            |
| POST   | `/api/auth/login`   | Log in; returns an access token and sets the session cookie      | 10 / minute         |
| POST   | `/api/auth/refresh` | Rotate the session cookie and get a new access token             | 100 / minute        |
| POST   | `/api/auth/logout`  | End the session and clear the cookie                             | 100 / minute        |

Over the limit, a route responds with `429 Too Many Requests` and a `Retry-After` header that says how many seconds to wait.

Outside production, interactive Swagger docs are available at [`http://localhost:8000/docs`](http://localhost:8000/docs).

## Setup

**Requirements:** Node.js 24+, pnpm, and Docker.

1. Clone the repo and install dependencies:

   ```bash
   git clone https://github.com/noszczykmichal/minimalistic-storefront-be.git
   cd minimalistic-storefront-be
   pnpm install
   ```

2. Copy `.env.example` to `.env` and fill in the values:

   ```bash
   POSTGRES_DB=storefront
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=postgres
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/storefront
   JWT_SECRET=<a long random string>
   ```

3. Start PostgreSQL (port `5432`) and Adminer (port `8080`):

   ```bash
   docker compose up -d
   ```

4. Apply the migrations and generate the Prisma client. The Prisma config file has a non-default name, so it must be passed explicitly:

   ```bash
   pnpm prisma migrate dev --config prisma7.config.ts
   pnpm prisma generate --config prisma7.config.ts
   ```

5. Start the API in watch mode. It listens on `PORT`, or on `8000` if `PORT` isn't set:

   ```bash
   pnpm start:dev
   ```

6. Optionally, run the [frontend](https://github.com/noszczykmichal/minimalistic-storefront) on `http://localhost:3000`.

## Testing

```bash
pnpm test        # unit tests (src/**/*.spec.ts)
pnpm test:e2e    # e2e tests (test/**/*.e2e-spec.ts)
pnpm test:cov    # unit tests with coverage
```

The e2e tests boot the whole app against a separate `storefront_test` database, configured in `.env.test`. The global setup creates that database if it's missing and applies the migrations. As a safeguard, it refuses to run against any database whose name doesn't contain `test`. Docker Compose must be running first.

## Deployment

The API runs on [Google Cloud Run](https://cloud.google.com/run) (`europe-west1`) at **https://storefront-api-498798658012.europe-west1.run.app**. All routes are `POST` endpoints under `/api` (see [API](#api)), so opening the URL in a browser only returns a 404. The live frontend reaches the API through a Firebase Hosting rewrite.

The repository includes a multi-stage `Dockerfile` that builds the app and generates the Prisma client, then runs `node dist/main.js` on `node:24-slim`. In production (`NODE_ENV=production`), the session cookie is marked `secure` and Swagger is turned off.

On Cloud Run, set `TRUST_PROXY=cloud-run` so the rate limiter sees the real client IP. The app then reads it from `X-Forwarded-For`, trusting the extra hop only when it comes from Firebase Hosting (the frontend's `/api` rewrite), so clients calling the `run.app` URL directly can't spoof their IP.

### CI/CD

GitHub Actions (`.github/workflows/ci-cd.yml`) runs on every pull request to `main` and on every push to `main`:

1. **Lint**, **Unit tests** and **E2E tests** run in parallel. The e2e job uses a Postgres 18 service container that matches `.env.test`.
2. **Build** runs `pnpm build` and `docker build`, but only after all three checks above pass.
3. **Deploy to Cloud Run** runs only on pushes to `main` (that is, after a PR is merged), once the whole pipeline has passed again on the merged code. It builds the image, pushes it to Artifact Registry tagged with the commit SHA, applies pending Prisma migrations and deploys the new image. The service's env vars, secrets and scaling settings stay as they are.

One-time setup:

- **Branch protection.** Under _Settings → Rules → Rulesets_, add a ruleset for `main` that requires a pull request and requires these status checks to pass: `Lint`, `Unit tests`, `E2E tests`, `Build`. Also block force pushes.
- **GitHub environment `production`.** Under _Settings → Environments_, create it and limit its deployment branches to `main`. Then add:
  - variables `GCP_PROJECT_ID`, `GCP_ARTIFACT_REPOSITORY` (an Artifact Registry Docker repository in `europe-west1`), `GCP_WORKLOAD_IDENTITY_PROVIDER` (`projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`) and `GCP_SERVICE_ACCOUNT`
  - secret `PROD_DATABASE_URL`, a direct (non-pooled) connection string used for `prisma migrate deploy`. If it's not set, the migration step is skipped.
- **Google Cloud.** Set up [Workload Identity Federation for GitHub](https://github.com/google-github-actions/auth#workload-identity-federation-through-a-service-account), with the provider restricted to this repository (`attribute.repository == "noszczykmichal/minimalistic-storefront-be"`). Grant the deploy service account `roles/run.admin`, `roles/artifactregistry.writer`, and `roles/iam.serviceAccountUser` on the Cloud Run runtime service account.

## Contact

Built by [@noszczykmichal](https://michalnoszczyk.com/) - feel free to contact me!
