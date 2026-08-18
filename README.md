# FloQast Take-Home — Staff Quality Engineer

A mock fintech microservices system and the test automation framework built against it.

The assessment provided a scenario but no running code, so this repo contains both halves: a working four-service Express app modeled on the scenario (User, Transaction, Notification, API Gateway, plus a minimal frontend), and a Playwright/TypeScript framework that tests it — 107 tests across API and UI suites, with data factories, custom assertions, environment configuration, and multi-format reporting.

Everything runs locally with zero external infrastructure. No MongoDB, no Redis, no Docker.

## Quick start

```bash
cp .env.example .env
npm install
npx playwright install    # first run only — downloads the browser
npm run dev               # starts all 4 services + frontend, leave running
```

Then in a second terminal:

```bash
npx playwright test              # full suite — 107 tests
npx playwright show-report       # open the HTML report
```

Poke at the app by hand at http://localhost:3000 — register a user, copy the returned ID, create a transaction for it, then look up that user's history.

Useful subsets:

```bash
npx playwright test tests/api               # API suite only (~4s)
npx playwright test tests/registration      # one UI spec file
npx playwright test -g "duplicate email"    # filter by test name
```

## Requirement coverage at a glance

| Requirement | Where it lives |
|---|---|
| 1. API suite — CRUD | `tests/api/crud/` — create + read for all three resources, plus explicit Update/Delete absence checks |
| 1. API suite — error scenarios | `tests/api/errors/` — malformed bodies, wrong methods, wrong content-types, unknown routes, dependency failures, a race condition |
| 1. API suite — data validation | `tests/api/validation/` — required fields, allow-lists, type coercion, regex edges, boundaries |
| 1. API suite — authn/authz | `tests/api/auth/api-key.spec.ts` (authentication) + the $5,000 basic-account limit → 403 in `tests/api/validation/transactions.spec.ts` and the UI boundary tests (authorization) |
| 2. UI suite — registration flow | `tests/registration/register.spec.ts` |
| 2. UI suite — transaction flow | `tests/transactions/create-transaction.spec.ts`, `transaction-history.spec.ts` |
| 2. UI suite — error messages | asserted throughout both flows, plus `tests/security/error-handling.spec.ts` |
| 3. Utilities — data factories | `tests/support/factories.ts` |
| 3. Utilities — helpers | `tests/api/helpers.ts` |
| 3. Utilities — env config | `tests/support/env.ts` + `.env.example` |
| 3. Utilities — custom assertions | `tests/support/matchers.ts` |
| 4. Reporting — multiple formats (bonus) | `list` + `html` + `json` reporters in `playwright.config.ts` |
| 4. Reporting — screenshots on UI failure | `screenshot: only-on-failure`, plus video and trace |
| 4. Reporting — API response logging | every helper call attaches a `{request, status, response}` record to the report |

Test counts: 46 API (`tests/api/`) + 61 UI and cross-cutting = 107 total, 18 spec files.

## Approach

- **Explore the real system before writing a line of test code.** Every behavior in the test plans under `specs/` was verified live against the running app, not inferred from source. That distinction matters: reading `services/` tells you what the code intends, but only running it tells you that a malformed JSON body returns an HTML stack trace instead of the app's normal clean JSON error shape. The plans document the verified behavior first; the tests then pin it down.
- **Test each rule at the layer that actually enforces it.** The frontend does HTML5 validation; each service does its own server-side validation; the gateway does auth. These do not always agree, and the gaps between them are where the interesting bugs live. So the suite deliberately splits: UI tests assert the browser guard fires and that the request never leaves the page, while API tests re-verify the same rule independently against the gateway. `test@test` is the clearest example — it satisfies the browser's built-in email check but fails the server's stricter regex. A UI-only suite would never find it; an API-only suite would never prove the browser guard exists.
- **Weight toward negative and boundary cases.** Happy paths are included as a per-flow sanity baseline, but the bulk of the suite is error handling, boundaries, tampering, and edge encoding. A regression suite earns its keep on the failures.
- **Document gaps instead of hiding them.** Where the application has a genuine behavioral hole, the test asserts the current behavior and names it — see the `KNOWN GAP` tests. That pins the behavior so an intentional fix shows up as a deliberate test change rather than a mystery failure, and it gives a reviewer a defect list rather than a silent omission.
- **No shared state between tests.** Every test builds its own data through the factories, with UUID-suffixed emails so parallel workers can never collide on the uniqueness constraint. The suite runs `fullyParallel` and finishes the API layer in about four seconds.

## Findings

Behaviors worth flagging, all discovered during exploration and now pinned by tests:

- **Information disclosure on malformed JSON.** A body with invalid JSON syntax returns 400 with an HTML body containing a raw Node stack trace and full local filesystem paths (body-parser's default error page) — materially different from the app's normal clean JSON errors. `tests/api/errors/malformed-requests.spec.ts`
- **Transfers to nonexistent recipients succeed silently.** `recipientId` is required for transfers but never existence-checked, so money "moves" to an ID that was never registered. `tests/transactions/create-transaction.spec.ts`
- **Notification routes never validate the user.** `GET /api/notifications/:userId` returns `200 []` for a completely made-up user, while `GET /api/transactions/:userId` correctly returns `404` — an asymmetry between two sibling services. `POST /api/notifications` likewise accepts an arbitrary `userId`. `tests/api/crud/notifications.spec.ts`
- **Notification creation is fire-and-forget.** The transaction service calls the notification service without awaiting it, so a notification triggered by a transaction is not guaranteed to be visible in a `GET` issued immediately after the transaction response returns. A real race, covered explicitly rather than papered over with a sleep. `tests/api/errors/timing.spec.ts`
- **No submit-button locking.** Neither form disables its button on click, so rapid double-clicks are testable for duplicate submissions.
- **Extra fields are silently accepted.** `isAdmin: true` on user creation is ignored rather than rejected — no schema whitelist. Benign here, a real risk in a system with privileged fields.
- **Wrong Content-Type silently skips parsing.** A valid JSON body sent as `text/plain` never reaches `req.body`; the request proceeds to normal validation and returns a clean error, which makes the underlying cause invisible from the response alone.

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
┌──▼───┐   ┌────▼──────┐  ┌──▼─────────────┐
│ User │   │Transaction│  │  Notification  │
│ 4001 │   │   4002    │  │      4003      │
└──────┘   └───────────┘  └────────────────┘
```

Each service is an independent Express app with its own in-memory store, standing in for MongoDB (User, Transaction) and Redis (Notification). The Transaction Service calls the User Service to validate `userId` and enforce the account-type limit, then fires a best-effort notification on success — giving the suite genuine cross-service behavior to exercise rather than three isolated CRUD endpoints.

## Endpoints

All `/api/*` routes require the header `x-api-key: <API_KEY>` (see `.env.example`). Every route is Create or Read only — there is no Update or Delete anywhere in the system, and `tests/api/crud/no-update-delete.spec.ts` asserts that PUT/PATCH/DELETE fail predictably rather than silently mutating.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/users` | `{ name, email, accountType }` → 201, 400, 409 |
| GET | `/api/users/:id` | 200 or 404 |
| POST | `/api/transactions` | `{ userId, amount, type, recipientId }` → 201, 400, 403, 404 |
| GET | `/api/transactions/:userId` | 200 (array) or 404 |
| POST | `/api/notifications` | `{ userId, message, transactionId? }` → 201 or 400 |
| GET | `/api/notifications/:userId` | 200 (array) |

Business rules:

- `accountType` must be `basic` or `premium`; email must be unique, case-insensitively.
- `type` must be `transfer`, `deposit`, or `withdrawal`; `recipientId` is required for transfers.
- Basic accounts are capped at $5,000 per transaction — the cap is inclusive, so `5000.00` succeeds and `5000.01` returns 403. This is the system's authorization scenario, and it is boundary-tested at both the API and UI layers.

## Test architecture

- **Page Objects** — `pages/RegisterPage.ts`, `pages/TransactionPage.ts` hold locators and actions for the two UI flows, wired in as `registerPage` / `transactionPage` fixtures via `tests/fixtures.ts`. UI specs never touch a raw selector.
- **Data factories** — `tests/support/factories.ts` provides `uniqueId` / `uniqueEmail` and `buildUserPayload` / `buildTransactionPayload` / `buildNotificationPayload`, each taking overrides. Pure data, no network calls, so the same builder serves both a UI form fill and an API request body.
- **Custom assertions** — `tests/support/matchers.ts` extends `expect` with `toBeValidationError`, `toBeUnauthorized`, `toBeNotFoundError`, `toBeConflictError`, and the generic `toBeApiError`. Each checks status and the app's `{error, message}` shape in one call, and prints the full received body on failure. `expect(res).toBeConflictError(/already registered/)` reads better and fails more usefully than three separate assertions.
- **API helpers** — `tests/api/helpers.ts` is the single import point for the API suite: it re-exports `test` and the matcher-extended `expect` (so importing from here guarantees the custom matchers are registered), plus `GATEWAY_URL`, `AUTH_HEADERS`, and the action helpers `createUser` / `createTransaction` / `createNotification`, which return `{ response, body, payload }` — the payload included so tests can assert the response echoes what was actually sent.
- **Environment configuration** — `tests/support/env.ts` reads `FRONTEND_URL`, `GATEWAY_URL`, and `TEST_API_KEY` from `.env` with sensible defaults. `playwright.config.ts` and every API test import from here, so no URL is hardcoded anywhere in the suite and pointing the framework at a deployed environment is a one-file change.
- **Test plans** — `specs/api-test-plan.md` and `specs/ui-test-plan.md` are the written plans behind the suites: scope notes, live-verified application behavior, and per-scenario steps with expectations. Worth skimming for the reasoning behind the coverage.

## Reporting

`playwright.config.ts` runs three reporters on every run:

- **`list`** — inline terminal output.
- **`html`** → `playwright-report/`, opened with `npx playwright show-report`. Failed tests attach a screenshot, video, and trace (`retain-on-failure`, so traces appear on the first failure rather than only on a retry).
- **`json`** → `test-results/results.json`, machine-readable for CI.

API response logging is built into the helpers: every call made through `createUser`, `createTransaction`, or `createNotification` attaches a JSON record to the current test, labeled `METHOD /path → status` and containing the request payload, the status, and the parsed response body. The full request/response history for any API test is inspectable directly in the HTML report without needing to open a trace.

## Scope decisions

Things deliberately left out, and why:

- **No login/session tests.** The app has no password, session, or token flow — authentication is a single static API key checked at the gateway. Classic session-expiry scenarios do not apply, so they were replaced with equivalent API-key scenarios: missing key, tampered key, key-value case sensitivity, and auth-before-validation ordering.
- **Single `.env`, no multi-environment split.** `env.ts` is the seam that makes a `.env.staging` split a small change, but with only local services running there is nothing honest to point a second environment at, so it was not fabricated.
- **True downstream-outage 502 is not covered at the API layer.** Reproducing it requires stopping the user-service process mid-run, which needs orchestration beyond an HTTP request. The equivalent scenario is covered at the UI layer through route interception in `tests/security/error-handling.spec.ts`.
- **Chromium only.** Cross-browser projects are a config addition, not a framework change, and add runtime without adding signal on a static two-page frontend.

Next steps with more time: wire the suite into GitHub Actions with the HTML report published as an artifact; add the `.env.<env>` split with a smoke-tagged subset for post-deploy checks; add a service-orchestration fixture to cover genuine downstream outages; and add contract tests between the transaction and notification services, since the fire-and-forget call between them is the least-defended seam in the system.

## How this was built

Test planning and generation were assisted by Claude Code using the Playwright MCP server, with agent definitions checked in under `.claude/agents/` (planner, generator, healer). The workflow was: drive the running app through the MCP browser to observe real behavior, produce the written plans in `specs/`, generate specs against those plans, then review, correct, and consolidate by hand — the factories, matchers, helper layer, and reporting design are hand-authored, and every generated assertion was verified against live application behavior before being kept.

This is how I work day to day, so it is checked in rather than scrubbed. The `.mcp.json` server command is Windows-flavored (`cmd /c`); it is only used for authoring and has no bearing on running the suite.
