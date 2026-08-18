# Mock Fintech App — API Test Plan (Gateway HTTP Surface)

## Application Overview

API-level regression suite for the mock fintech gateway (http://localhost:4000), tested exclusively via direct HTTP requests (Playwright APIRequestContext / `request` fixture) against the proxied routes — no browser page, no UI navigation. The gateway (services/gateway/server.js) sits in front of three independent Express microservices: user-service (4001), transaction-service (4002), and notification-service (4003), each reachable only through /api/users, /api/transactions, /api/notifications behind a shared auth middleware (services/gateway/middleware/auth.js) that requires header `x-api-key: dev-secret-key`.

**Scope note — no Update/Delete anywhere in this system:** Every microservice implements Create + Read only (confirmed by reading services/user-service/server.js, services/transaction-service/server.js, services/notification-service/server.js — each only registers GET/POST routes). There is no PUT/PATCH/DELETE route defined on any resource. Because http-proxy-middleware forwards all HTTP methods through the gateway's `app.use(...)` mounts regardless of verb, a PUT/PATCH/DELETE request to any of these routes is NOT rejected by the gateway's own 404 handler (which only fires for entirely unmatched paths) — it is proxied through to the downstream service, which has no matching route and falls through to Express's own default handler. This plan treats "CRUD testing" as full Create+Read coverage plus explicit assertions that Update/Delete requests fail predictably (verified live below), the same way the UI plan called out the missing login flow as a documented scope gap rather than silently skipping it.

**Key facts verified live against the running app during exploration (not assumed from source alone):**
- PUT/PATCH/DELETE against `/api/users`, `/api/users/:id` return HTTP 404 with an HTML body `Cannot <METHOD> <path>` (Express's default not-found handler on the downstream service) — a different shape than the gateway's own JSON 404 (`{error:"NotFound", message:"no such gateway route"}`) used for entirely unknown paths. Both are 404s but with meaningfully different bodies/content-types, which the plan tests separately.
- Auth: missing key, wrong key, empty-string key, and an uppercase key value (`DEV-SECRET-KEY`) are all rejected with 401 `{error:"Unauthorized", message:"missing or invalid x-api-key header"}`. The header **name** is case-insensitive (`X-API-KEY` works, per HTTP spec) but the header **value** is compared with strict `!==`, so casing/whitespace differences in the value are rejected (a trailing-space value sent via Playwright's request API is normalized away by the HTTP client itself before hitting the wire — documented as a client-behavior caveat, not a server bug). Verified independently on all three route groups (users/transactions/notifications) for both GET and POST.
- Malformed JSON body (invalid syntax) with `Content-Type: application/json` returns HTTP 400 but with an **HTML** body containing a raw Node.js stack trace with full local filesystem paths (body-parser's default error page) — this is a real information-disclosure smell worth flagging, and is a materially different failure shape than the app's normal clean JSON validation errors.
- A JSON-looking body sent with the wrong Content-Type (`text/plain`) or no Content-Type header at all is **silently never parsed** by `express.json()` — `req.body` stays `{}` and the request proceeds to normal validation, returning a clean 400 `{error:"ValidationError", message:"name is required"}` rather than any parsing error. This is a meaningfully different code path than the malformed-JSON case above and both are covered.
- An empty POST body (`''`) with `Content-Type: application/json` is treated as invalid JSON (empty string is not valid JSON) and hits the same HTML stack-trace path as malformed JSON.
- A JSON array as the POST body is accepted by the parser (valid JSON) but destructures to all-undefined fields, producing the normal clean "name is required" validation error — no crash.
- `GET /api/notifications/:userId` (the never-covered-by-UI route) does **not** verify the user exists via user-service at all — it returns `200 []` both for a real user with zero notifications and for a completely made-up/nonexistent userId. This is a real behavioral asymmetry versus `GET /api/transactions/:userId`, which does call user-service first and returns a clean `404 user not found` for an unregistered user. Both behaviors are pinned down explicitly.
- `POST /api/notifications` also never validates that `userId` corresponds to a real user — an arbitrary string like `"totally-made-up-user-id"` is accepted and creates a notification (201), mirroring the already-known "transfer to nonexistent recipientId succeeds silently" gap from the UI plan. `transactionId` is optional and defaults to `null` when omitted; a whitespace-only `message` is correctly rejected (`.trim().length === 0` check, same pattern as `name`/`recipientId`).
- Creating a transaction triggers a **fire-and-forget, unawaited** internal `POST` to notification-service (`transaction-service/server.js`'s `notify()` is called without `await` and its response is caught/swallowed on failure) — verified live that the resulting notification (with the auto-generated message `"<type> of $<amount> completed"` and the correct `transactionId`) is reliably present after a short wait, but is not guaranteed to exist in a `GET /api/notifications/:userId` call made immediately after the transaction response returns. This race condition is called out as its own test.
- Extra/unexpected fields in a request body (e.g. `isAdmin: true` on user creation) are silently ignored, not rejected — no strict schema/whitelist enforcement.
- Numeric fields sent as the wrong JS type (numeric string `"100"` for amount, `null`, a number for `userId`) are correctly rejected by the `typeof`/`Number.isFinite` checks rather than being coercively accepted.
- The $5000 basic-account boundary is inclusive (`amount > 5000` is the check): exactly `5000` succeeds (201), `5000.01` fails (403) — re-verified live at the API level, matching the UI plan's browser-level finding.
- `GET /api/users/` (trailing slash, empty id) and `GET /api/users` (no id segment at all) both return the downstream service's default Express 404 HTML page (`Cannot GET /users/` / `Cannot GET /users`), since neither matches user-service's only two registered routes (`POST /users`, `GET /users/:id`).
- Simulating a genuine downstream-outage 502 (`unable to reach user-service`, from transaction-service/server.js's `fetchUser` catch block) is not reproducible via pure HTTP requests alone since it requires the user-service process itself to be unreachable; this is called out as a scope note requiring test-level process/service orchestration (stopping user-service before the call) rather than a plain APIRequestContext call, mirroring how the UI plan handled this same scenario via route interception (unavailable here since there is no browser page in scope).

## Test Scenarios

### 1. 1. CRUD Operations Testing

**Seed:** `tests/seed.spec.ts`

#### 1.1. 1.1 Create and read a user (happy path)

**File:** `tests/api/crud/users.spec.ts`

**Steps:**
  1. Why: baseline Create+Read confirmation for the user resource, the foundation every other suite depends on.
  2. POST /api/users with a valid unique name, email, and accountType='basic', with a valid x-api-key header
    - expect: Response status is 201
    - expect: Response body contains id (UUID), name, email, accountType='basic', and createdAt (ISO timestamp)
  3. GET /api/users/:id using the id returned above
    - expect: Response status is 200
    - expect: Response body exactly matches the object returned by the create call

#### 1.2. 1.2 Create a premium user and confirm accountType persists

**File:** `tests/api/crud/users.spec.ts`

**Steps:**
  1. Why: confirms the second allow-listed accountType value round-trips correctly, independent of the UI dropdown.
  2. POST /api/users with accountType='premium' and a unique name/email
    - expect: Response status 201 with accountType='premium' in the body
  3. GET /api/users/:id for that user
    - expect: accountType is still 'premium'

#### 1.3. 1.3 Read a nonexistent user returns a clean 404

**File:** `tests/api/crud/users.spec.ts`

**Steps:**
  1. Why: confirms Read half of CRUD fails predictably and safely for a well-formed but unknown id, not a 500 or a hang.
  2. GET /api/users/00000000-0000-0000-0000-000000000000 (syntactically valid UUID, never created)
    - expect: Response status is 404
    - expect: Body is {error:'NotFound', message:'user not found'}

#### 1.4. 1.4 Read a user with a non-UUID-shaped id string

**File:** `tests/api/crud/users.spec.ts`

**Steps:**
  1. Why: confirms the id parameter is treated as an opaque string lookup, not validated/parsed as a UUID, so garbage input fails the same clean way as a well-formed-but-missing id.
  2. GET /api/users/not-a-real-id-123
    - expect: Response status 404 with the same clean {error:'NotFound', message:'user not found'} JSON body (verified live — no 400/500 from malformed-id handling)

#### 1.5. 1.5 Create and read a transaction, including cross-resource Read (list by user)

**File:** `tests/api/crud/transactions.spec.ts`

**Steps:**
  1. Why: baseline Create+Read for the transaction resource, which additionally exercises the userId list-endpoint shape (array response), not just a single-object GET.
  2. Create a fresh user, then POST /api/transactions with that user's id, amount=100, type='deposit'
    - expect: Response status 201
    - expect: Body has id, userId, amount=100, type='deposit', recipientId=null, status='completed', createdAt
  3. GET /api/transactions/:userId for that user
    - expect: Response status 200
    - expect: Body is an array containing exactly one entry matching the created transaction

#### 1.6. 1.6 List transactions for a user with multiple transactions of different types

**File:** `tests/api/crud/transactions.spec.ts`

**Steps:**
  1. Why: confirms the list-Read endpoint isn't truncated/paginated and preserves all records and per-record field correctness at the API layer (complements the UI plan's rendering-focused version of this check).
  2. Create a user, then POST 5+ transactions of mixed types (deposit, withdrawal, transfer) and amounts
    - expect: Each create call returns 201 with a unique transaction id
  3. GET /api/transactions/:userId
    - expect: Array length equals the number of transactions created, in creation order, with correct type/amount/recipientId per entry

#### 1.7. 1.7 Read transactions for a user with zero transactions returns an empty array, not an error

**File:** `tests/api/crud/transactions.spec.ts`

**Steps:**
  1. Why: confirms the 'valid user, no data yet' case is a normal 200 empty-array response, distinct from the 404 'user not found' case in 1.8.
  2. Create a fresh user, immediately GET /api/transactions/:userId without creating any transaction
    - expect: Response status 200
    - expect: Body is []

#### 1.8. 1.8 Read transactions for a nonexistent user returns 404, not an empty array

**File:** `tests/api/crud/transactions.spec.ts`

**Steps:**
  1. Why: transaction-service's GET handler explicitly calls user-service to validate existence before listing — confirms that check is live and correctly ordered before the list lookup.
  2. GET /api/transactions/00000000-0000-0000-0000-000000000099 (never-created user id)
    - expect: Response status 404 with body {error:'NotFound', message:'user not found'} (verified live)

#### 1.9. 1.9 Create and read a notification directly (manual, non-transaction-triggered)

**File:** `tests/api/crud/notifications.spec.ts`

**Steps:**
  1. Why: baseline Create+Read for the notification resource, exercised directly via the gateway even though the frontend never calls it — this is the least-covered resource in the whole app and needs its own explicit CRUD baseline.
  2. Create a user, then POST /api/notifications with {userId, message}, omitting transactionId
    - expect: Response status 201
    - expect: Body has id, userId, transactionId=null (defaulted), message, createdAt
  3. GET /api/notifications/:userId
    - expect: Response status 200
    - expect: Body is an array containing the created notification exactly

#### 1.10. 1.10 Notification auto-created as a side effect of a transaction (cross-resource Read)

**File:** `tests/api/crud/notifications.spec.ts`

**Steps:**
  1. Why: confirms the documented fire-and-forget internal call from transaction-service to notification-service actually produces a persisted, retrievable record with the expected auto-generated message shape ('<type> of $<amount> completed') and correct transactionId linkage — verified live.
  2. Create a user, POST a deposit transaction of amount=250 for them, then poll/wait briefly and GET /api/notifications/:userId
    - expect: A notification appears whose message equals 'deposit of $250 completed' and whose transactionId matches the created transaction's id

#### 1.11. 1.11 Notification list for a user with zero notifications returns an empty array

**File:** `tests/api/crud/notifications.spec.ts`

**Steps:**
  1. Why: baseline empty-state Read check for parity with the transactions empty-state test (1.7).
  2. Create a fresh user, GET /api/notifications/:userId with no notifications created
    - expect: Response status 200, body []

#### 1.12. 1.12 Notification list for a nonexistent user ALSO returns 200 empty array, not 404 (documented asymmetry vs. transactions)

**File:** `tests/api/crud/notifications.spec.ts`

**Steps:**
  1. Why: verified live that, unlike GET /api/transactions/:userId, this route never calls user-service to validate existence — it always returns whatever (possibly empty) list is on file for that key, real user or not. This is a real behavioral inconsistency across two structurally similar list-Read endpoints and deserves an explicit pinned-down regression test rather than being assumed to 404 like its sibling.
  2. GET /api/notifications/00000000-0000-0000-0000-000000000000 (never-created user)
    - expect: Response status 200 with body [] (NOT 404) — flag as a documented product/consistency gap, mirroring how the UI plan flagged the silent-transfer-to-nonexistent-recipient gap

#### 1.13. 1.13 No Update route exists for any resource — PUT/PATCH return 404, not a silent update

**File:** `tests/api/crud/no-update-delete.spec.ts`

**Steps:**
  1. Why: this is the core scope-note assertion for the whole plan — proves the absence of an Update capability is an intentional, stable, testable contract rather than an assumption from reading source once.
  2. Create a user, then PUT /api/users/:id with a modified name and valid auth header
    - expect: Response status 404
    - expect: Body is HTML containing 'Cannot PUT /users/<id>' (verified live — this is the downstream Express default handler, not the gateway's own JSON 404)
  3. Repeat with PATCH /api/users (collection-level, no id) with an arbitrary body
    - expect: Response status 404 with HTML body 'Cannot PATCH /users'
  4. GET /api/users/:id for the same user afterward
    - expect: User record is completely unchanged from its original creation — confirms the failed PUT/PATCH had zero side effects

#### 1.14. 1.14 No Delete route exists for any resource — DELETE returns 404, record is still readable afterward

**File:** `tests/api/crud/no-update-delete.spec.ts`

**Steps:**
  1. Why: confirms Delete absence is equally enforced and, critically, that a failed delete attempt does not corrupt or remove the record as a side effect.
  2. Create a user, then DELETE /api/users/:id with valid auth
    - expect: Response status 404 with HTML body 'Cannot DELETE /users/<id>' (verified live)
  3. GET /api/users/:id for the same user afterward
    - expect: Response is still 200 with the original, unmodified user record — record was never deleted

#### 1.15. 1.15 PUT/PATCH/DELETE against /api/transactions and /api/notifications routes also 404 cleanly

**File:** `tests/api/crud/no-update-delete.spec.ts`

**Steps:**
  1. Why: extends 1.13/1.14 to the other two resource groups to confirm the Update/Delete absence is consistent app-wide, not just on the one route already spot-checked.
  2. Issue PUT, PATCH, and DELETE requests against /api/transactions, /api/transactions/:userId, /api/notifications, and /api/notifications/:userId, each with valid auth
    - expect: Every combination returns 404 (either the downstream Express default-handler HTML page, or in cases where the path segment itself doesn't exist upstream, an equivalent 404) — document the exact body/content-type per route as a baseline snapshot

### 2. 2. Error Scenario Handling

**Seed:** `tests/seed.spec.ts`

#### 2.1. 2.1 Malformed JSON body returns 400 with an HTML stack-trace body (documented info-disclosure smell)

**File:** `tests/api/errors/malformed-requests.spec.ts`

**Steps:**
  1. Why: this is only reachable at the API level (HTML forms can't produce invalid JSON) and verified live to expose a raw Node.js stack trace including local filesystem paths via body-parser's default error page — this is a real, worth-flagging difference from every other error path in the app, which returns clean JSON.
  2. POST /api/users with Content-Type: application/json and a syntactically invalid JSON body (e.g. '{ name: "bad json", email: ')
    - expect: Response status is 400
    - expect: Response Content-Type is text/html (not application/json)
    - expect: Body contains a raw SyntaxError stack trace — assert its presence to pin down current behavior, and flag in review as a candidate for a JSON-formatted error handler instead

#### 2.2. 2.2 Empty string body with JSON content-type hits the same malformed-JSON path as 2.1

**File:** `tests/api/errors/malformed-requests.spec.ts`

**Steps:**
  1. Why: an empty string is not valid JSON, so this is a distinct-but-related edge of the same parser behavior — confirms it isn't special-cased into a cleaner 'body is required' message.
  2. POST /api/users with Content-Type: application/json and body = '' (zero-length)
    - expect: Response status 400 with the same HTML SyntaxError body as 2.1 (verified live)

#### 2.3. 2.3 Wrong Content-Type header (e.g. text/plain) silently skips body parsing — clean validation error, not a parse error

**File:** `tests/api/errors/malformed-requests.spec.ts`

**Steps:**
  1. Why: confirms express.json() only parses bodies whose Content-Type matches, and the resulting empty req.body flows into normal validation rather than crashing — a meaningfully different failure mode than 2.1/2.2 despite both being '400s from bad requests', worth distinguishing explicitly.
  2. POST /api/users with Content-Type: text/plain and a valid JSON-stringified user payload as the raw body
    - expect: Response status 400 with clean JSON body {error:'ValidationError', message:'name is required'} (verified live — NOT a parser error, and NOT treated as if name/email were actually present)
  3. Repeat with no Content-Type header at all
    - expect: Same clean 'name is required' 400 JSON response (verified live)

#### 2.4. 2.4 JSON array as the request body is valid JSON but destructures to nothing useful

**File:** `tests/api/errors/malformed-requests.spec.ts`

**Steps:**
  1. Why: confirms a structurally-valid-but-wrong-shape JSON payload (array instead of object) doesn't crash the destructuring logic — it's parsed fine, fields come out undefined, and normal validation catches it.
  2. POST /api/users with Content-Type: application/json and body = JSON.stringify(['name','email'])
    - expect: Response status 400 with clean JSON {error:'ValidationError', message:'name is required'} (verified live, no 500)

#### 2.5. 2.5 Wrong HTTP method on a collection route returns a downstream 404, not a 405

**File:** `tests/api/errors/wrong-method.spec.ts`

**Steps:**
  1. Why: since none of these Express apps register an explicit method-not-allowed handler, confirms the actual (arguably non-ideal but current) behavior is a 404 rather than a 405 Method Not Allowed, for every unsupported verb — pins this down so a future change is a visible test failure rather than an undetected regression.
  2. Issue GET /api/users (collection root, no id — no route registered for this) and DELETE /api/transactions (no route registered) with valid auth
    - expect: Both return 404 with an HTML 'Cannot <METHOD> <path>' body (verified live for GET /api/users)

#### 2.6. 2.6 GET /api/users/ (trailing slash, empty id segment) 404s cleanly

**File:** `tests/api/errors/wrong-method.spec.ts`

**Steps:**
  1. Why: an easy-to-overlook URL-shape edge case; confirms the router doesn't treat a trailing slash as matching :id with an empty string, and doesn't crash on it.
  2. GET /api/users/ with valid auth
    - expect: Response status 404 with HTML body 'Cannot GET /users/' (verified live)

#### 2.7. 2.7 Nonexistent resource id on every Read route returns its resource-specific 404, never a 500

**File:** `tests/api/errors/not-found.spec.ts`

**Steps:**
  1. Why: consolidated sweep confirming every single GET-by-id/list route in the app fails the same predictable, documented way for an unknown identifier — a core reliability guarantee for API consumers.
  2. GET /api/users/:id, GET /api/transactions/:userId with a never-created id for each
    - expect: Both return 404 with the resource-appropriate {error:'NotFound', message:'user not found'} body (verified live for both)
  3. GET /api/notifications/:userId with a never-created id
    - expect: Returns 200 [] rather than 404 — cross-reference with 1.12; assert this explicitly here too so the 'error scenario' suite and the 'CRUD' suite each independently pin down this asymmetry

#### 2.8. 2.8 Unknown gateway path returns the gateway's own JSON 404 catch-all (distinct from downstream 404s)

**File:** `tests/api/errors/not-found.spec.ts`

**Steps:**
  1. Why: distinguishes the gateway-level catch-all handler (services/gateway/server.js's final app.use) from the downstream-service 404s tested elsewhere in this suite — confirms requests that don't even match one of the three proxied prefixes are caught before ever reaching a microservice.
  2. GET /api/does-not-exist and GET /totally-unknown, both with valid auth
    - expect: Both return 404 with JSON body exactly {error:'NotFound', message:'no such gateway route'} — content-type application/json, distinct from the HTML bodies seen in 1.13-1.15 and 2.5-2.6

#### 2.9. 2.9 Transaction creation for a nonexistent userId returns a clean 404 before any limit/type checks matter

**File:** `tests/api/errors/downstream-dependency.spec.ts`

**Steps:**
  1. Why: transaction-service depends on user-service via an internal fetch call before creating the transaction — confirms this dependency check runs (and fails correctly) even when the rest of the payload is perfectly valid, i.e. it's not just relying on client-side referential integrity.
  2. POST /api/transactions with a syntactically valid but never-registered userId, a valid amount, and type='deposit'
    - expect: Response status 404 with body {error:'NotFound', message:'user not found'} (verified live) — no transaction is recorded

#### 2.10. 2.10 Downstream user-service outage produces a 502 from transaction-service (documented scope note — requires service-level orchestration, not pure HTTP)

**File:** `tests/api/errors/downstream-dependency.spec.ts`

**Steps:**
  1. Why: transaction-service/server.js's fetchUser() explicitly catches fetch failures and returns 502 {error:'UpstreamError', message:'unable to reach user-service'} — this is a real, code-confirmed path, but SCOPE NOTE: reproducing it via pure HTTP calls through the gateway is not possible without actually taking user-service offline (there is no browser page/route-interception available in this API-only suite, unlike the UI plan's equivalent test). Implement this as an integration-style test that stops the user-service process (or points USER_SERVICE_URL at an unreachable port) as part of test setup/teardown, isolated from the rest of the suite so it doesn't affect other tests' ability to reach user-service.
  2. With user-service intentionally unreachable, POST /api/transactions with an otherwise fully valid payload
    - expect: Response status 502 with body {error:'UpstreamError', message:'unable to reach user-service'}
    - expect: No transaction record is created (verify once user-service is restored, by confirming the transaction id was never returned/never appears in a subsequent list call)

#### 2.11. 2.11 Notification delivery failure does not fail the originating transaction (fire-and-forget contract)

**File:** `tests/api/errors/downstream-dependency.spec.ts`

**Steps:**
  1. Why: transaction-service/server.js's notify() call is explicitly wrapped in try/catch with a console.warn on failure and is never awaited before responding — confirms this best-effort contract holds even when notification-service is degraded, which is core to why this architecture is resilient. SCOPE NOTE: like 2.10, fully forcing notification-service offline requires service-level orchestration rather than a plain HTTP call.
  2. With notification-service intentionally stopped/unreachable, POST /api/transactions with a fully valid payload
    - expect: Response is still 201 with a normal transaction body — the transaction succeeds regardless of notification-service's availability

#### 2.12. 2.12 Race condition — a notification created by a transaction may not be immediately visible via GET

**File:** `tests/api/errors/timing.spec.ts`

**Steps:**
  1. Why: verified live that transaction-service does not await the internal notify() call before returning its own 201 response, so a consumer that immediately calls GET /api/notifications/:userId right after receiving the transaction response has no strict guarantee the notification is persisted yet. This is a real timing characteristic of the system worth pinning down as documented (not necessarily 'fixed') behavior.
  2. Create a user, POST a transaction, and immediately (no wait) GET /api/notifications/:userId, then repeat the GET after a short poll/delay
    - expect: Document actual behavior: the immediate GET may or may not include the new notification; the delayed GET reliably includes it (verified live with a 500ms wait) — assert eventual consistency rather than asserting the immediate GET must contain it, to avoid a flaky false-negative test

### 3. 3. Data Validation Tests

**Seed:** `tests/seed.spec.ts`

#### 3.1. 3.1 User creation — required field checks (name, email, accountType) each fail independently

**File:** `tests/api/validation/users.spec.ts`

**Steps:**
  1. Why: baseline field-by-field required-ness sweep at the API layer, since the UI plan could only test 'blank required attribute' behavior, not the server logic these attributes stand in front of.
  2. POST /api/users omitting name entirely (valid email/accountType present)
    - expect: 400, {error:'ValidationError', message:'name is required'}
  3. POST /api/users with name present but email omitted
    - expect: 400, message 'a valid email is required'
  4. POST /api/users with name/email present but accountType omitted
    - expect: 400, message 'accountType must be one of: basic, premium'

#### 3.2. 3.2 Whitespace-only name is rejected server-side (reuses UI-verified rule, confirmed independently at the API)

**File:** `tests/api/validation/users.spec.ts`

**Steps:**
  1. Why: cross-references the UI plan's 1.6, but proves the server-side .trim().length===0 check works even when bypassing the browser entirely — the true source of truth for this rule.
  2. POST /api/users with name='   ' (spaces only) and a valid unique email/accountType
    - expect: 400, message 'name is required'

#### 3.3. 3.3 Email regex edge cases reachable only at the API layer

**File:** `tests/api/validation/users.spec.ts`

**Steps:**
  1. Why: the UI plan already confirmed 'test@test' fails server validation despite passing the browser's HTML5 email check; this test sweeps additional regex boundary cases that have no client-side equivalent to even attempt.
  2. POST /api/users with email values: 'test@test' (no TLD), 'plainstring' (no @), '@nodomain.com' (empty local part), 'user@' (empty domain), 'user@@double.com' (double @)
    - expect: Every case returns 400 with message 'a valid email is required' per the server regex /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  3. POST /api/users with a syntactically valid but unusual email: 'user+tag@sub.example.co.uk'
    - expect: 201 — confirms the regex isn't overly strict on legitimate plus-addressing/subdomain formats

#### 3.4. 3.4 accountType allow-list is enforced independently of the UI dropdown

**File:** `tests/api/validation/users.spec.ts`

**Steps:**
  1. Why: the UI can only ever submit 'basic' or 'premium'; this proves the server itself, not just the dropdown, is the actual enforcement point (cross-references UI plan 1.16, verified live here directly against the API).
  2. POST /api/users with accountType='gold' (valid name/email)
    - expect: 400, message 'accountType must be one of: basic, premium' (verified live)
  3. POST /api/users with accountType='' (empty string) and accountType=null
    - expect: Both rejected with the same allow-list message

#### 3.5. 3.5 Duplicate email is rejected with 409, case-insensitively

**File:** `tests/api/validation/users.spec.ts`

**Steps:**
  1. Why: confirms the uniqueness constraint and its case-insensitive comparison (UI plan 1.9/1.10) hold at the API layer independent of any client-side pre-check.
  2. POST /api/users with a unique email, then POST again with the exact same email
    - expect: First: 201. Second: 409 {error:'Conflict', message:'email already registered'}
  3. POST /api/users with the same email as an existing user but different casing (e.g. 'DUP@EXAMPLE.COM' vs 'dup@example.com')
    - expect: 409 Conflict — case-insensitive match confirmed

#### 3.6. 3.6 Wrong JS type for string fields is rejected, not coerced

**File:** `tests/api/validation/users.spec.ts`

**Steps:**
  1. Why: the `typeof name !== 'string'` / `typeof email !== 'string'` guards mean sending a JSON number, boolean, object, or array for these fields must be rejected outright rather than stringified/coerced — only reachable by crafting a raw JSON payload, impossible from the HTML form.
  2. POST /api/users with name=12345 (number) and a valid email/accountType
    - expect: 400, 'name is required' (typeof guard rejects non-string even though the field is 'present')
  3. POST /api/users with email=true (boolean) and a valid name/accountType
    - expect: 400, 'a valid email is required'

#### 3.7. 3.7 Extra/unexpected fields in the payload are silently ignored, not rejected

**File:** `tests/api/validation/users.spec.ts`

**Steps:**
  1. Why: confirms there's no strict schema/allow-list on the request body shape — verified live that an extra field like isAdmin:true is simply dropped rather than causing a 400 or being persisted onto the created record, which is worth pinning down as current (if permissive) behavior.
  2. POST /api/users with a valid payload plus an extra field, e.g. isAdmin:true
    - expect: 201 success; response body contains only the expected fields (id, name, email, accountType, createdAt) — no isAdmin field present (verified live)

#### 3.8. 3.8 Transaction amount — required, type-checked, and boundary-tested at the API layer

**File:** `tests/api/validation/transactions.spec.ts`

**Steps:**
  1. Why: consolidates the UI plan's amount rules (positive, finite) with API-only edge cases like wrong JS type, that the number input's type=number attribute makes unreachable through the browser.
  2. POST /api/transactions with amount omitted entirely
    - expect: 400, 'amount must be a positive number'
  3. POST /api/transactions with amount=null
    - expect: 400, same message (verified live)
  4. POST /api/transactions with amount='100' (numeric string, not a JS number)
    - expect: 400, same message — confirms typeof amount !== 'number' rejects numeric strings outright rather than coercing them (verified live)
  5. POST /api/transactions with amount=0 and amount=-50
    - expect: Both rejected with 'amount must be a positive number'
  6. POST /api/transactions with amount that overflows to Infinity (e.g. 1e400 as a JSON number literal)
    - expect: Rejected with 'amount must be a positive number' — confirms the Number.isFinite guard, cross-referencing UI plan 2.9
  7. POST /api/transactions with amount=5000 for a basic-account user, then amount=5000.01 for the same user
    - expect: 5000 succeeds (201); 5000.01 is rejected with 403 and message 'basic accounts are limited to $5000 per transaction; upgrade to premium for higher limits' (both re-verified live at the API layer)
  8. POST /api/transactions with a very large finite amount (e.g. 99999999999) for a premium-account user
    - expect: 201 success — confirms no upper bound is enforced for premium accounts, independent of the browser's number input

#### 3.9. 3.9 Transaction userId — required, type-checked, and existence-checked

**File:** `tests/api/validation/transactions.spec.ts`

**Steps:**
  1. Why: sweeps the userId field the same way 3.8 swept amount, since it has its own independent typeof/trim guard before the user-service existence check even runs.
  2. POST /api/transactions with userId omitted, userId='' (empty string), and userId='   ' (whitespace only)
    - expect: All three rejected with 400 'userId is required'
  3. POST /api/transactions with userId=12345 (a JSON number instead of a string)
    - expect: 400 'userId is required' — typeof guard rejects non-string types outright (verified live)

#### 3.10. 3.10 Transaction type allow-list enforcement

**File:** `tests/api/validation/transactions.spec.ts`

**Steps:**
  1. Why: cross-references UI plan 2.20; confirms the server-side allow-list ['transfer','deposit','withdrawal'] is the true enforcement point, tested directly rather than by tampering with a select element.
  2. POST /api/transactions with type omitted, and separately with type='bogus'
    - expect: Both rejected with 400 'type must be one of: transfer, deposit, withdrawal' (verified live for both)

#### 3.11. 3.11 Transfer-specific recipientId validation

**File:** `tests/api/validation/transactions.spec.ts`

**Steps:**
  1. Why: cross-references UI plan 2.15/2.16; confirms this conditional (type==='transfer' only) required-field rule is enforced server-side with the same trim-based check as name/userId.
  2. POST /api/transactions with type='transfer' and recipientId omitted
    - expect: 400, 'recipientId is required for transfers'
  3. POST /api/transactions with type='transfer' and recipientId='   ' (whitespace only)
    - expect: 400, same message (verified live)
  4. POST /api/transactions with type='deposit' (non-transfer) and recipientId omitted
    - expect: 201 success — confirms recipientId is only required conditionally, not universally

#### 3.12. 3.12 Known business-logic gaps re-verified directly at the API: unchecked recipientId / self-transfer

**File:** `tests/api/validation/transactions.spec.ts`

**Steps:**
  1. Why: cross-references UI plan 2.17/2.18's flagged gaps; re-confirms them at the API layer as the authoritative source (the UI's behavior is just a reflection of this), and documents them here as accepted current behavior pending a product decision, not a test bug.
  2. POST /api/transactions with type='transfer', a valid userId, and recipientId='not-a-real-user-id' (never registered)
    - expect: 201 success, transaction created with that recipientId verbatim — no server-side existence check on recipientId (verified live)
  3. POST /api/transactions with type='transfer' and recipientId equal to the sender's own userId
    - expect: 201 success — self-transfer is currently permitted (verified live), flagged as a baseline to track, not necessarily correct behavior

#### 3.13. 3.13 Notification field validation (userId, message required; transactionId optional)

**File:** `tests/api/validation/notifications.spec.ts`

**Steps:**
  1. Why: the least-covered route in the app — this is the first-ever explicit validation sweep of POST /api/notifications, mirroring the required/whitespace-trim pattern already proven for users and transactions.
  2. POST /api/notifications with userId omitted (message present)
    - expect: 400, 'userId is required'
  3. POST /api/notifications with message omitted (userId present)
    - expect: 400, 'message is required'
  4. POST /api/notifications with message='   ' (whitespace only)
    - expect: 400, 'message is required' — confirms the same trim-based check pattern used elsewhere in the app
  5. POST /api/notifications with a valid userId and message, transactionId omitted entirely
    - expect: 201 success; response body has transactionId=null (defaulted, verified live)

#### 3.14. 3.14 Notification userId is never existence-checked (Create or Read) — documented gap

**File:** `tests/api/validation/notifications.spec.ts`

**Steps:**
  1. Why: parallels 3.12's documentation of the recipientId gap in transactions — notification-service's POST handler has no dependency on user-service at all, so any non-empty string is accepted as a userId, verified live.
  2. POST /api/notifications with userId='totally-made-up-user-id' (never registered) and a valid message
    - expect: 201 success — no rejection for a nonexistent user (verified live), cross-reference with 1.12/2.7's read-side version of the same gap

### 4. 4. Authentication / Authorization Tests

**Seed:** `tests/seed.spec.ts`

#### 4.1. 4.1 Missing x-api-key header is rejected on every CRUD route, individually, across all three resources

**File:** `tests/api/auth/api-key.spec.ts`

**Steps:**
  1. Why: the existing UI-adjacent suite only spot-checked one representative route per resource group; this sweeps every distinct route (not just one GET per group) to confirm the auth middleware is genuinely applied per-mount and not accidentally bypassable on a route that was never explicitly tested before.
  2. Without any x-api-key header, call: GET /api/users/:id, POST /api/users, GET /api/transactions/:userId, POST /api/transactions, GET /api/notifications/:userId, POST /api/notifications
    - expect: Every single call returns 401 with body {error:'Unauthorized', message:'missing or invalid x-api-key header'} (all six verified live)

#### 4.2. 4.2 Invalid (wrong-value) x-api-key is rejected identically to a missing key

**File:** `tests/api/auth/api-key.spec.ts`

**Steps:**
  1. Why: confirms the check is an exact-match comparison against the configured key, not merely 'header is present' — proves a guessed/incorrect key can't slip through.
  2. Call GET /api/users/:id with x-api-key: 'wrong-key'
    - expect: 401, identical error body to the missing-key case (verified live)
  3. Call the same route with x-api-key: '' (present but empty string)
    - expect: 401, same error body — an empty value does not satisfy `!key` short-circuit differently than a missing header (verified live)

#### 4.3. 4.3 Case sensitivity of the API key VALUE is enforced (uppercase variant rejected)

**File:** `tests/api/auth/api-key.spec.ts`

**Steps:**
  1. Why: directly answers the case-sensitivity question raised in scope — confirms the comparison is a strict `!==` on the raw string, so 'DEV-SECRET-KEY' is a different value from 'dev-secret-key' and must not authenticate.
  2. Call GET /api/users/:id with x-api-key: 'DEV-SECRET-KEY' (uppercase variant of the real key)
    - expect: 401 Unauthorized (verified live) — confirms no case-insensitive comparison is happening on the key value

#### 4.4. 4.4 Case-insensitivity of the HEADER NAME itself (HTTP spec compliance, not a security hole)

**File:** `tests/api/auth/api-key.spec.ts`

**Steps:**
  1. Why: distinguishes header-NAME case-insensitivity (a correct, spec-mandated HTTP behavior via req.header()) from header-VALUE case-sensitivity (4.3) — verified live that sending 'X-API-KEY' (uppercase name) with the correct value still authenticates successfully, which is expected/correct and should be pinned down as such rather than mistaken for a bug.
  2. Call GET /api/users/:id with header name 'X-API-KEY' (all caps) and the correct value 'dev-secret-key'
    - expect: Request passes auth (not a 401) — proceeds to normal 404 'user not found' for a made-up id, confirming the auth check itself succeeded (verified live)

#### 4.5. 4.5 Valid API key succeeds identically across all three resource route groups (positive control)

**File:** `tests/api/auth/api-key.spec.ts`

**Steps:**
  1. Why: balances the negative-heavy auth tests above with an explicit positive baseline — confirms the correct key genuinely authenticates every resource group, not just users, so the negative tests above are meaningful by contrast.
  2. With a correct x-api-key header, call one representative GET and one representative POST route on each of /api/users, /api/transactions, /api/notifications
    - expect: All six calls pass the auth layer (none return 401); each proceeds to its normal success or validation-driven response

#### 4.6. 4.6 Auth is checked before body/route validation (order-of-operations check)

**File:** `tests/api/auth/api-key.spec.ts`

**Steps:**
  1. Why: confirms the auth middleware is mounted ahead of the proxy on every route, so an unauthenticated request never reaches downstream validation logic even when its payload would otherwise be perfectly valid or perfectly invalid — auth failure must take precedence either way.
  2. POST /api/users with no x-api-key header and a completely empty/invalid body
    - expect: 401 Unauthorized (auth error), NOT a 400 validation error — confirms auth is evaluated first
  3. POST /api/users with no x-api-key header and a fully valid, well-formed user payload
    - expect: Still 401 Unauthorized, and no user is actually created — confirms a valid payload alone can never bypass auth

#### 4.7. 4.7 Unauthenticated requests never reach downstream services or leak downstream data

**File:** `tests/api/auth/api-key.spec.ts`

**Steps:**
  1. Why: confirms the 401 response body itself never echoes back any part of the request or any downstream service data — an important defense-in-depth property of a gateway-level auth check.
  2. GET /api/users/:id for a real, previously-created user's id, but without a valid x-api-key header
    - expect: 401 with the generic {error:'Unauthorized', message:'missing or invalid x-api-key header'} body — the real user's data (name/email/etc.) is never present anywhere in the response
