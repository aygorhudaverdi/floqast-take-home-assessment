# FloQast Take-Home: Mock Fintech Microservices App

Staff Quality Engineer take-home assessment. This repo contains both the **target system
under test** — a mock fintech microservices app modeled on the assessment scenario (User
Service, Transaction Service, Notification Service, API Gateway, plus a minimal frontend)
— and a full Playwright test automation framework built against it: 108 tests across UI
and API suites, shared data factories, custom assertions, environment configuration, and
multi-format reporting with API response logging.

## Architecture

```
        ┌──────────────┐
public  │   Frontend   │  static HTML/CSS/JS, port 3000
(3000)  └──────┬───────┘
               │ fetch (x-api-key header)
        ┌──────▼───────┐
        │  API Gateway │  port 4000 — auth + proxy
        └───┬───┬───┬──┘
            │   │   │
   ┌────────┘   │   └────────┐
┌──▼───┐   ┌────▼─────┐   ┌──▼─────────────┐
│ User │   │Transaction│   │ Notification   │
│ 4001 │   │  4002     │   │   4003         │
└──────┘   └───────────┘   └────────────────┘
```

Each service is an independent Express app with its own in-memory store, standing in for
MongoDB (User/Transaction) and Redis (Notification) so the whole system runs with zero
external infra. The Transaction Service calls the User Service to validate `userId` and enforce
an account-type transaction limit, and fires a best-effort notification on success — giving the
test suite real cross-service behavior to exercise.

## Endpoints (via gateway, `http://localhost:4000`)

All `/api/*` routes require header `x-api-key: <API_KEY>` (see `.env.example`). Every route
below is Create or Read only — there is no Update/Delete anywhere in the system; PUT/PATCH/DELETE
against any of these routes 404 (covered explicitly in `tests/api/crud/no-update-delete.spec.ts`).

| Method | Path                          | Notes                                                   |
|--------|-------------------------------|----------------------------------------------------------|
| POST   | `/api/users`                  | `{ name, email, accountType }` → 201, 400, or 409        |
| GET    | `/api/users/:id`               | 200 or 404                                                |
| POST   | `/api/transactions`            | `{ userId, amount, type, recipientId }` → 201, 400, 403, or 404 |
| GET    | `/api/transactions/:userId`    | 200 (array) or 404                                        |
| GET    | `/api/notifications/:userId`   | 200 (array) — verify notification side effects            |

Business rules worth knowing:
- `accountType` must be `basic` or `premium`; email must be unique (case-insensitive).
- `type` must be `transfer`, `deposit`, or `withdrawal`; `recipientId` is required for transfers.
- `basic` accounts are capped at $5,000 per transaction (403 if exceeded) — a built-in
  authorization scenario.

## Running the app

```bash
cp .env.example .env
npm install
npm run dev
```

This starts all four services plus the static frontend concurrently:

- Frontend: http://localhost:3000
- Gateway: http://localhost:4000
- User Service: http://localhost:4001
- Transaction Service: http://localhost:4002
- Notification Service: http://localhost:4003

Open http://localhost:3000, register a user, then create a transaction for that user's ID and
view their transaction history.

## Running the tests

The app must be running first (`npm run dev` in one terminal), then in another:

```bash
npx playwright test                    # full suite: 62 UI + 46 API tests
npx playwright test tests/api          # just the API suite
npx playwright test tests/registration # just one UI spec file
npx playwright test -g "duplicate email"  # filter by test name
```

## Test architecture

- **Page Objects** (`pages/RegisterPage.ts`, `pages/TransactionPage.ts`) — locators and
  actions for the two UI flows, wired into Playwright via `tests/fixtures.ts` as
  `registerPage`/`transactionPage` fixtures.
- **Data factories** (`tests/support/factories.ts`) — `uniqueEmail`/`uniqueId` plus
  `buildUserPayload`/`buildTransactionPayload`/`buildNotificationPayload`, so every test
  gets collision-free data instead of hand-rolled strings.
- **Environment configuration** (`tests/support/env.ts`) — reads `FRONTEND_URL`,
  `GATEWAY_URL`, and `TEST_API_KEY` from `.env` (see `.env.example`) with sensible
  defaults; `playwright.config.ts` and every API test import from here rather than
  hardcoding URLs.
- **Custom assertions** (`tests/support/matchers.ts`) — `toBeValidationError`,
  `toBeUnauthorized`, `toBeNotFoundError`, `toBeConflictError`, and the generic
  `toBeApiError`, matching the app's standard `{error, message}` response shape.
- **API helpers** (`tests/api/helpers.ts`) — the single import point for the API suite:
  `test`/`expect` (with the custom matchers registered), `GATEWAY_URL`/`AUTH_HEADERS`, and
  action helpers (`createUser`, `createTransaction`, `createNotification`) built on the
  factories above.

## Test reports

`playwright.config.ts` runs three reporters on every run:

- **`list`** — inline terminal output as tests run.
- **`html`** → `playwright-report/` — open with `npx playwright show-report`. Failed UI
  tests attach a screenshot, video, and trace; every API call made through
  `tests/api/helpers.ts` (`createUser`/`createTransaction`/`createNotification`) attaches
  a `{request, status, response}` JSON record per call, labeled `METHOD /path → status`,
  so the full request/response history for a test is inspectable in the report without
  needing a trace.
- **`json`** → `test-results/results.json` — machine-readable results for CI/tooling.

## Environment configuration

Ports, service URLs, and the shared `API_KEY`/`TEST_API_KEY` are read from a single `.env`
(see `.env.example`) via `tests/support/env.ts` and `services/config.js`. There's no
multi-environment (`.env.staging`, etc.) split yet — everything currently points at the
local services started by `npm run dev`.
