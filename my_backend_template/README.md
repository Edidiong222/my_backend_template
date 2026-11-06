# My Backend Starter

A reusable, production-minded NestJS API template with email/password authentication, JWT access and refresh tokens, TypeORM, PostgreSQL, Swagger, validation, rate limiting, migrations, health checks, tests, Docker and CI.

The goal is a small, readable foundation you can copy into a new project without deleting a pile of demo code.

## Features

- NestJS 11 on Express 5, strict TypeScript
- PostgreSQL with TypeORM and explicit migrations (`synchronize` is off)
- Register, login, refresh, logout, email verification, forgot/reset password
- Argon2 password hashing
- SHA-256 hashed refresh tokens with rotation and reuse detection
- Hashed, expiring, single-use email verification and password reset tokens
- Global JWT guard, role guard and `@Public()` / `@Roles()` decorators
- Global validation, consistent success and error envelopes
- In-memory rate limiting with stricter limits on auth endpoints
- Helmet, CORS allow-list, trusted proxy support
- Swagger / OpenAPI at `/api/docs`
- Health check with database probe at `/health`
- Admin user listing and soft deactivation
- Seed script for the first admin
- Unit tests, PostgreSQL e2e tests, GitHub Actions CI
- Multi-stage Dockerfile and local PostgreSQL compose file

## Requirements

- Node.js `^20.19.0 || ^22.13.0 || >=24.11.0`
- PostgreSQL 14+ (16 recommended)
- Docker (optional, for the local database)

## Quick start

```bash
cp .env.example .env
# Windows PowerShell: Copy-Item .env.example .env
```

Edit `.env` and set `DB_*`, plus two long random JWT secrets:

```bash
openssl rand -hex 32
```

With Docker for the database:

```bash
docker compose up -d
```

Without Docker, create the database on your local PostgreSQL server and point `DB_*` at it.

Then install, migrate, optionally seed an admin, and start:

```bash
npm install
npm run migration:run
npm run seed
npm run start:dev
```

- API base URL: `http://localhost:4000/api/v1`
- Swagger: `http://localhost:4000/api/docs`
- Health: `http://localhost:4000/health`

`npm run seed` requires `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`. It is idempotent and skips an existing email.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development`, `production` or `test` |
| `APP_PORT` | no | `4000` | HTTP port |
| `APP_HOST` | no | `0.0.0.0` | Listen address |
| `APP_NAME` | no | `My Backend Starter` | Display name and Swagger title |
| `APP_PREFIX` | no | `api/v1` | Global route prefix; health is excluded |
| `APP_URL` | no | `http://localhost:4000` | Base URL used in email links |
| `CORS_ORIGINS` | no | `http://localhost:3000` | Comma separated allowed origins |
| `TRUSTED_PROXIES` | no | empty | Comma separated trusted proxy addresses |
| `DB_HOST` | yes | - | PostgreSQL host |
| `DB_PORT` | no | `5432` | PostgreSQL port |
| `DB_USER` | yes | - | PostgreSQL user |
| `DB_PASSWORD` | yes | - | PostgreSQL password |
| `DB_NAME` | yes | - | PostgreSQL database |
| `DB_LOGGING` | no | `false` | Log SQL queries |
| `JWT_ACCESS_SECRET` | yes | - | Access token secret, minimum 32 chars |
| `JWT_REFRESH_SECRET` | yes | - | Refresh token secret, minimum 32 chars |
| `JWT_ACCESS_EXPIRES_IN` | no | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | no | `7d` | Refresh token lifetime |
| `THROTTLE_TTL_SECONDS` | no | `60` | Global throttle window |
| `THROTTLE_LIMIT` | no | `100` | Global requests per window |
| `EMAIL_SERVICE` | no | `console` | Email provider; only `console` ships today |
| `EMAIL_FROM` | no | `no-reply@example.com` | Reserved for a real email provider |
| `EMAIL_VERIFICATION_TOKEN_TTL` | no | `24h` | Verification token lifetime |
| `PASSWORD_RESET_TOKEN_TTL` | no | `1h` | Reset token lifetime |
| `ADMIN_EMAIL` | seed only | - | Seed admin email |
| `ADMIN_PASSWORD` | seed only | - | Seed admin password, minimum 8 chars |
| `ADMIN_FIRST_NAME` | no | `Admin` | Seed admin first name |
| `ADMIN_LAST_NAME` | no | `User` | Seed admin last name |

Environment values are validated at boot with Joi. The app fails fast on missing or invalid values.

## API

Every route except `GET /health` is under the global prefix. Routes are protected by default; only endpoints marked public can be called without a bearer token.

### Auth

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | public | Create a user and send a verification email |
| `POST` | `/auth/login` | public | Email + password login, returns token pair |
| `POST` | `/auth/refresh` | public | Rotate a refresh token, returns a new pair |
| `POST` | `/auth/logout` | bearer | Revoke one refresh token, or all when omitted |
| `POST` | `/auth/forgot-password` | public | Always returns the same generic message |
| `POST` | `/auth/reset-password` | public | Consume a reset token and set a new password |
| `POST` | `/auth/verify-email` | public | Consume a verification token |

Login body: `{ "email": "...", "password": "..." }`

Register body:

```json
{
  "email": "user@example.com",
  "password": "at-least-8-characters",
  "firstName": "Ada",
  "lastName": "Lovelace"
}
```

Token pair response data:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "tokenType": "Bearer",
  "expiresIn": "15m"
}
```

Registration does not log the user in. Call `/auth/login` afterwards.

### Users

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/users/me` | bearer | Current profile |
| `PATCH` | `/users/me` | bearer | Update `firstName` / `lastName` |
| `PATCH` | `/users/me/password` | bearer | Change password, revokes refresh tokens |
| `GET` | `/users` | admin | Paginated user list |
| `GET` | `/users/:id` | admin | Single user |
| `DELETE` | `/users/:id` | admin | Soft deactivate a user |

List query parameters: `page`, `limit` (max 100), `search`, `role`, `isActive`.

Paginated data shape:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

### Health

`GET /health` is public, outside the API prefix, and returns `503` when the database probe fails.

## Response format

Success:

```json
{
  "success": true,
  "data": {},
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

Error:

```json
{
  "success": false,
  "statusCode": 400,
  "message": ["password must be longer than or equal to 8 characters"],
  "error": "Bad Request",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "path": "/api/v1/auth/register"
}
```

Unexpected errors never expose internal details in the response.

## Project structure

```text
src/
  auth/
    dto/                 auth request and response DTOs
    entities/            refresh token and one-time token entities
    guards/              local, jwt and roles guards
    interfaces/          JWT payload and email provider contracts
    services/            console email implementation
    strategies/          passport local and jwt strategies
    auth.controller.ts
    auth.module.ts
    auth.service.ts
  common/
    decorators/          CurrentUser, Public, Roles
    dto/                 pagination and message DTOs
    entities/            UUID/timestamp base entity
    filters/             global exception filter
    helpers/             pagination helper
    interceptors/        success envelope interceptor
    utils/               password and token helpers
  config/                configuration factory and Joi schema
  database/
    migrations/          explicit SQL migrations
    data-source.ts       TypeORM CLI data source
    typeorm.options.ts   shared options
  health/                database health controller
  scripts/seed.ts        first admin seed
  users/                 user entity, DTOs, service, controller
  app.module.ts          global wiring
  main.ts                bootstrap
test/
  auth.e2e-spec.ts       PostgreSQL-backed auth and health flow
  setup-e2e.ts           e2e environment defaults
```

## Adding a module

1. Create `src/<feature>/<feature>.module.ts`, controller, service, DTOs and entities under `src/<feature>/`.
2. Register the module in `AppModule.imports`.
3. Register entities with `TypeOrmModule.forFeature([...])` in the feature module. `autoLoadEntities` picks them up.
4. Add `@Public()` only to routes that truly need anonymous access. Everything else stays protected globally.
5. Add `@Roles(UserRole.ADMIN)` to admin-only routes.
6. Generate and review a migration:

```bash
npm run migration:generate -- src/database/migrations/AddThings
npm run migration:run
```

Never enable `synchronize` for anything beyond a throwaway experiment.

## Migrations and seed

```bash
npm run migration:run
npm run migration:revert
npm run migration:generate -- src/database/migrations/MigrationName
npm run seed
```

The CLI reads the same `DB_*` variables as the app. The initial migration enables `uuid-ossp`, creates the enum types, the three tables, indexes and foreign keys.

## Tests

Unit tests use mocks and need no database:

```bash
npm test
npm run test:watch
npm run test:cov
```

E2E tests need a reachable PostgreSQL database. By default they use `DB_NAME=my_backend_test` on `localhost:5432` with `postgres` / `postgres`. Override with the same `DB_*` variables:

```bash
npm run test:e2e
```

The e2e suite truncates `auth_tokens`, `refresh_tokens` and `users` in the target database. Never point it at a database with data you care about.

Quality checks:

```bash
npm run format:check
npm run lint:check
npm run build
```

## Email

`EMAIL_SERVICE=console` logs verification and reset links to stdout. Registration and forgot-password never fail because email delivery failed; failures are logged instead.

> The console service writes single-use tokens to logs. Replace it before deploying to production.

To use a real provider:

1. Implement `EmailService` from `src/auth/interfaces/email-service.interface.ts`.
2. Add the provider name to the `EMAIL_SERVICE` allow-list in `src/config/env.validation.ts`.
3. Extend the factory in `src/auth/auth.module.ts` to return the new implementation.

`EMAIL_FROM` is reserved for that provider. The console service ignores it.

## Docker

Build and run the API:

```bash
docker build -t my-backend .
docker run --env-file .env -p 4000:4000 my-backend
```

The image uses a multi-stage build, installs production dependencies only in the final layer, and runs as the non-root `node` user.

For local PostgreSQL only:

```bash
docker compose up -d
```

The compose file uses `DB_USER`, `DB_PASSWORD`, `DB_NAME` and `DB_PORT` from `.env`.

## Using this as a template

1. Copy the folder into your new project and remove `.git` if you copied it.
2. Rename `name`, `description` and `version` in `package.json`.
3. Create a fresh `.env` with new JWT secrets and database credentials.
4. Drop and recreate the database, then run `npm run migration:run`.
5. Seed the admin with `ADMIN_*`.
6. Add your feature modules and generate migrations.
7. Update `APP_NAME`, `APP_URL`, `CORS_ORIGINS` and Swagger metadata as needed.
8. Replace `ConsoleEmailService` before going to production.

## Security notes

- Passwords are hashed with Argon2. Password hashes are excluded from queries by default.
- Refresh tokens are stored only as SHA-256 hashes. A reused or revoked refresh token revokes the whole token family.
- Email verification and password reset tokens are random, hashed, expiring and single-use.
- Access tokens are stateless and remain valid until expiry. Logout and password changes revoke refresh tokens, not already-issued access tokens. Keep access token lifetimes short.
- The JWT strategy loads the user on every request, so deactivation and role changes apply immediately.
- Rate limiting is in-memory and per process. Use a shared store such as Redis before running multiple instances.
- `forgot-password` returns the same response whether or not the email exists. `register` intentionally reports an existing email so the client can guide the user.

## Decisions

- **NestJS 11 instead of 12.** Nest 12 is ESM-only in this environment, requires TypeScript 6 and a newer Node baseline, and breaks the CommonJS Jest setup most teams expect. Nest 11 keeps the template conventional, stable and easy to test.
- **TypeORM 1.x.** The current TypeORM release line is used with `synchronize: false` and a hand-written initial migration. The API surface used here is the same as 0.3.
- **Registration and login are separate.** Register returns the created user only. Login is the single place that issues tokens, which keeps signup policy and token policy independent.
- **Profile updates are name-only.** Changing the account email needs a verification flow of its own, so this template deliberately leaves it out.
- **Deactivation is soft.** `DELETE /users/:id` sets `isActive=false` and revokes refresh tokens. Nothing is hard deleted by default.
- **Email verification is not required to log in.** The token flow is wired end to end, but enforcing verification is a product decision best made in the app.
- **One password-change route.** It lives at `PATCH /users/me/password` because it changes the current user resource.
- **Console email by default.** The template has no mail dependency to install or configure. The provider interface keeps the swap small.
- **Opaque tokens over JWTs for email and password reset.** They are hashed at rest, single-use and easy to revoke.
- **Stricter auth throttling is intentional.** Register, forgot and reset allow 5 requests per minute; login allows 10. Global throttling is configurable.

## License

MIT
