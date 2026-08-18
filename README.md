# FloQast Take-Home: Mock Fintech Microservices App

Staff Quality Engineer take-home assessment. This repo currently contains the **target system
under test**: a mock fintech microservices app modeled on the assessment scenario (User
Service, Transaction Service, Notification Service, API Gateway) plus a minimal mock frontend.
The JS/TS test automation framework (API + UI suites, data factories, reporting, env config)
is the next step, built against this app.

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
later test suite real cross-service behavior to exercise.

## Endpoints (via gateway, `http://localhost:4000`)

All `/api/*` routes require header `x-api-key: <API_KEY>` (see `.env.example`).

| Method | Path                          | Notes                                                   |
|--------|-------------------------------|----------------------------------------------------------|
| POST   | `/api/users`                  | `{ name, email, accountType }` → 201, 400, or 409        |
| GET    | `/api/users/:id`               | 200 or 404                                                |
| POST   | `/api/transactions`            | `{ userId, amount, type, recipientId }` → 201, 400, 403, or 404 |
| GET    | `/api/transactions/:userId`    | 200 (array) or 404                                        |
| GET    | `/api/notifications/:userId`   | 200 (array) — bonus, verify notification side effects     |

Business rules worth knowing for later test design:
- `accountType` must be `basic` or `premium`; email must be unique.
- `type` must be `transfer`, `deposit`, or `withdrawal`; `recipientId` is required for transfers.
- `basic` accounts are capped at $5,000 per transaction (403 if exceeded) — a built-in
  authorization scenario.

## Running it

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

## Environment configuration

All ports, service URLs, and the shared `API_KEY` are read from `.env` (see `.env.example`).
`NODE_ENV` is wired up via `dotenv` so environment-specific `.env.<env>` files can be added
later for the test framework's multi-environment config requirement.

## Next steps

Add the test automation framework (Playwright/Jest) against this running app: API test suite
(CRUD, validation, error, auth), UI test suite (registration + transaction flows, error
messages), test data factories/helpers, and HTML/JSON reporting.
