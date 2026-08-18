# Mock Fintech App — UI Test Plan (Negative/Edge-Case Weighted)

## Application Overview

## Application Under Test

A mock fintech microservices app served at http://localhost:3000 (static frontend) backed by an API Gateway at http://localhost:4000 that proxies to independent User, Transaction, and Notification services (ports 4001-4003). The frontend has three pages: `index.html` (dashboard), `register.html` (user registration form), and `transaction.html` (transaction creation form + transaction history lookup).

**Important scoping notes discovered during exploration:**
- There is **no login/session/password flow** anywhere in this app. Registration only collects name, email, and account type (basic/premium) — there is no password field. All "authentication" is a single static API key (`x-api-key: dev-secret-key`) hardcoded client-side in `public/app.js` and checked by gateway middleware (`services/gateway/middleware/auth.js`). Because of this, classic "session expiry" scenarios do not apply; they have been replaced below with equivalent API-key-based unauthorized-access scenarios (e.g., calling the gateway directly without the key, tampering with the key from the console).
- The frontend performs **HTML5 client-side validation** (`required`, `type=email`, `type=number`) on top of **server-side validation** in each microservice. Several server-side rules are stricter than the browser's, creating a class of edge cases where input passes client validation but is rejected by the API (e.g., `test@test` passes the browser's built-in email check but fails the server's `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` regex; a name of only spaces passes the `required` attribute but fails the server's `.trim().length === 0` check). These "client says OK, server says no" cases are high-value and are called out explicitly.
- Server-confirmed behaviors verified live during exploration (all captured directly from the running app, not assumed):
  - Registration: empty submit is blocked by native `required` validation (no request sent); malformed emails blocked client-side; `test@test` reaches the server and is rejected with "a valid email is required"; whitespace-only name is rejected with "name is required"; duplicate email returns "email already registered" (HTTP 409); successful registration shows "User created successfully." and a UUID (`ID: ...`) and resets the form.
  - Transactions: amount `0` and negative amounts are rejected with "amount must be a positive number"; a basic account is limited to $5000 per transaction — exactly `5000` succeeds, `5000.01` is rejected with "basic accounts are limited to $5000 per transaction..."; a premium account successfully processed a transaction of `99999999999` (no upper limit enforced for premium); a `transfer` with no `recipientId` is rejected with "recipientId is required for transfers"; a transaction against a non-existent `userId` returns "user not found"; **a transfer to a `recipientId` that does not correspond to any registered user succeeds silently** — there is no server-side check that the recipient exists, which is a notable business-logic gap worth explicit regression coverage.
  - Transaction history lookup: submitting with an empty User ID shows a client-side "Enter a user ID first." message without a network call; looking up a non-existent user returns "user not found"; a valid lookup renders a table row per transaction with correctly formatted currency (`$5000.00`), recipient (`-` for non-transfers), status, and timestamp.
  - Direct, unauthenticated navigation to a gateway API route (`http://localhost:4000/api/users/<id>`) returns HTTP 401 Unauthorized because the browser does not send the custom `x-api-key` header on plain navigation — this is the closest equivalent this app has to an "unauthorized access to a protected route" scenario.
  - Navigating to an unknown frontend path or unknown gateway path both return HTTP 404.

This plan is intentionally weighted toward negative, boundary, and error-handling scenarios per the review request, with a minimal set of happy-path scenarios included only as a baseline/sanity check for each flow.

## Test Scenarios

### 1. User Registration (register.html)

**Seed:** `tests/seed.spec.ts`

#### 1.1. Happy path — register a new Basic user with valid data

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Navigate to /register.html
    - expect: Form loads with empty Name/Email fields and Account Type defaulted to Basic
  2. Fill Name with a valid string, Email with a unique valid address, leave Account Type as Basic, click Create User
    - expect: Message banner shows 'User created successfully.' with success styling
    - expect: Result area shows 'ID: <uuid>'
    - expect: Form fields are reset to empty

#### 1.2. Happy path — register a new Premium user

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Navigate to /register.html, fill a unique Name/Email, select Account Type = Premium, submit
    - expect: Success message and a new UUID are shown
    - expect: Account type is persisted correctly (verified later via a transaction that exceeds the $5000 basic limit succeeding for this user)

#### 1.3. Reject empty form submission — baseline required-field enforcement (why: confirms client never sends an incomplete payload to the API)

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Navigate to /register.html and click Create User without filling any field
    - expect: Browser native validation blocks submission (focus moves to the Name field)
    - expect: No success/error message banner appears
    - expect: No network request to /api/users is made

#### 1.4. Reject submission with Name empty but Email/Account Type filled

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Leave Name blank, fill a valid Email, submit
    - expect: Native required validation blocks submission on the Name field
    - expect: No API request is sent

#### 1.5. Reject submission with Email empty but Name filled

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Fill a valid Name, leave Email blank, submit
    - expect: Native required validation blocks submission on the Email field
    - expect: No API request is sent

#### 1.6. Whitespace-only Name bypasses client validation but is rejected server-side (why: required-attribute only checks length, not meaningful content — server trims and must catch this)

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Set the Name field value to a string of only spaces ('   ') via direct value assignment (bypasses typing-based UX but mirrors e.g. paste), fill a valid unique Email, submit
    - expect: Server rejects with error message 'name is required'
    - expect: Error banner has error styling
    - expect: No user is created

#### 1.7. Obviously malformed email is blocked client-side (why: confirms HTML5 type=email guard is actually wired up and prevents an avoidable round-trip)

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Fill Name with a valid value, Email with 'not-an-email' (no @ symbol), submit
    - expect: Native email-format validation blocks submission
    - expect: No API request is sent

#### 1.8. Email that passes browser validation but fails server-side regex (why: high-value 'client says OK, server says no' gap — TLD-less address like test@test satisfies the HTML5 email pattern but not the stricter server regex)

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Fill Name with a valid value, Email with 'test@test' (no dot/TLD), submit
    - expect: Submission is NOT blocked by the browser
    - expect: Server responds with 'a valid email is required' shown in an error banner
    - expect: No user is created

#### 1.9. Reject duplicate email registration (why: enforces the uniqueness constraint that prevents duplicate identities/accounts)

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Register a user with a unique email and confirm success
    - expect: User is created successfully
  2. Attempt to register a second user reusing the exact same email address
    - expect: Error banner shows 'email already registered'
    - expect: No second user is created

#### 1.10. Reject duplicate email registration with different casing (why: server does a case-insensitive email comparison — confirms this can't be trivially bypassed with 'Test@Example.com' vs 'test@example.com')

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Register a user with email 'dup.case@example.com' and confirm success
    - expect: User is created successfully
  2. Attempt to register a new user with email 'DUP.CASE@EXAMPLE.COM'
    - expect: Error banner shows 'email already registered', confirming case-insensitive duplicate detection

#### 1.11. Oversized Name input (why: no maxlength attribute exists on the field — confirms the app doesn't crash, truncate silently, or store unbounded data unexpectedly)

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Fill Name with a very long string (several thousand characters), fill a valid unique Email, submit
    - expect: App handles the request without crashing/hanging
    - expect: Either the user is created with the full name preserved, or a clear validation error is shown — document actual behavior

#### 1.12. Script/markup injection attempt in Name field (why: XSS defense-in-depth check — ensure any echoed value, e.g. in a future 'welcome back' UI, would be rendered as text not executed)

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Fill Name with '<script>alert(1)</script>' and a valid unique Email, submit
    - expect: No script executes / no JS dialog appears
    - expect: Request either succeeds (value stored as inert text) or is rejected — no HTML is rendered unescaped anywhere on the page

#### 1.13. Unicode/emoji characters in Name field (why: internationalization/edge-encoding coverage)

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Fill Name with a mix of unicode characters and emoji (e.g. 'José 名前 🚀'), fill a valid unique Email, submit
    - expect: Registration succeeds and the ID/result reflects a created user
    - expect: No console errors or garbled encoding in the message banner

#### 1.14. Email with leading/trailing whitespace (why: server trims Name but the code path for Email does not call .trim() before storage/comparison — check for inconsistent normalization)

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Fill Name with a valid value, Email with '  spaced.email@example.com  ' (leading/trailing spaces), submit
    - expect: Document actual behavior: whether it's accepted as-is (with spaces preserved, potentially breaking future lookups/duplicate checks) or rejected — this is a likely latent bug to confirm

#### 1.15. SQL/NoSQL-injection-style string in Name and Email (why: defensive check even though the store is in-memory — guards against future persistence-layer regressions)

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Fill Name with e.g. "Robert'); DROP TABLE users;--" and Email with a validly-formatted address, submit
    - expect: No server error/crash (500) occurs
    - expect: Request is handled as ordinary string data — either created successfully or rejected by normal validation, never causing an unhandled exception

#### 1.16. Tamper Account Type to an invalid value beyond the two dropdown options (why: confirms server-side accountType allow-list is enforced independently of the client dropdown, since the UI can only ever submit 'basic' or 'premium')

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Use page-level script injection to add and select a bogus <option value='gold'> in the Account Type select (or submit the equivalent payload directly against the gateway API with accountType: 'gold'), with valid Name/Email
    - expect: Server rejects with 'accountType must be one of: basic, premium'
    - expect: No user is created with an invalid account type

#### 1.17. Single-character Name boundary (why: confirms the minimum valid input size is 1 non-space character, not silently rejected)

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Fill Name with a single character (e.g. 'A'), fill a valid unique Email, submit
    - expect: Registration succeeds

#### 1.18. Form retains user input after a validation error (why: UX/regression check — users should not have to retype everything after a fixable error)

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Fill Name and Email such that the server rejects the submission (e.g. duplicate email), submit
    - expect: After the error banner appears, the Name and Email fields still contain the values the user typed (only the form is reset after a successful submission, not after an error)

#### 1.19. Double-submit / rapid duplicate click on Create User (why: no visible submit-button disable-on-click logic in app.js — check whether two rapid clicks can create two users from one intended submission)

**File:** `tests/registration/register.spec.ts`

**Steps:**
  1. Fill valid unique Name/Email, click Create User twice in rapid succession (double-click)
    - expect: Document actual behavior: either only one user is created (idempotency/guard exists) or two identical requests both succeed, creating two users with different IDs — flag if the latter occurs, since it likely indicates a missing guard

### 2. Transaction Creation (transaction.html — create form)

**Seed:** `tests/seed.spec.ts`

#### 2.1. Happy path — deposit for a Basic account under the limit

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Register a fresh Basic user (setup), navigate to /transaction.html, fill that user's ID, amount 100, type Deposit, submit
    - expect: Success message 'Transaction <uuid> completed.' is shown
    - expect: Form resets (type reverts to default 'Transfer')

#### 2.2. Happy path — withdrawal for a Basic account

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Using a registered Basic user, submit a withdrawal transaction with a valid amount
    - expect: Transaction completes successfully with a confirmation message

#### 2.3. Happy path — transfer with a valid recipient ID

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Submit a transfer transaction with userId, amount, and a non-empty recipientId
    - expect: Transaction completes successfully with a confirmation message

#### 2.4. Boundary — amount exactly at the Basic account limit ($5000) succeeds (why: confirms the limit check is amount > 5000, not >=, i.e. the boundary is inclusive)

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. For a Basic account, submit a deposit of exactly 5000
    - expect: Transaction succeeds with a completion message (verified live: this boundary is inclusive)

#### 2.5. Boundary — amount just above the Basic account limit ($5000.01) is rejected

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. For a Basic account, submit a deposit of 5000.01
    - expect: Error banner shows 'basic accounts are limited to $5000 per transaction; upgrade to premium for higher limits'
    - expect: No transaction is recorded

#### 2.6. Zero amount is rejected (why: amount must be a strictly positive number per server validation)

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Submit a transaction with amount = 0
    - expect: Error banner shows 'amount must be a positive number'

#### 2.7. Negative amount is rejected

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Submit a transaction with amount = -50
    - expect: Error banner shows 'amount must be a positive number'

#### 2.8. Non-numeric amount input is blocked by the number field (why: input type=number should prevent letters/symbols from ever reaching the required check as a valid value)

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Attempt to type non-numeric characters (e.g. 'abc') into the Amount field, then submit
    - expect: The number input rejects/ignores non-numeric characters (value stays empty)
    - expect: Native required validation blocks submission

#### 2.9. Amount as Infinity via scientific notation overflow (why: Number('1e400') evaluates to Infinity in JS — confirms the server's Number.isFinite guard actually catches this rather than silently accepting/crashing)

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Enter an extreme scientific-notation amount that overflows to Infinity when parsed (e.g. '1e400') and submit
    - expect: Server rejects with 'amount must be a positive number' (Number.isFinite check fails) rather than a 500 error or a Forbidden/limit message

#### 2.10. Extremely large finite amount for a Basic account is rejected by the limit check, not accepted or crashed

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. For a Basic account, submit a large but finite amount (e.g. 999999999)
    - expect: Rejected with the $5000 basic-account limit error, not a server crash or generic error

#### 2.11. Extremely large amount for a Premium account succeeds (why: confirms premium accounts genuinely have no upper limit enforced, verified live with 99999999999)

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Register a Premium user, submit a deposit of 99999999999
    - expect: Transaction completes successfully with no limit-related error

#### 2.12. Missing User ID is blocked client-side

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Leave User ID blank, fill Amount and Type, submit
    - expect: Native required validation blocks submission; no API call is made

#### 2.13. Missing Amount is blocked client-side

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Fill User ID, leave Amount blank, submit
    - expect: Native required validation blocks submission; no API call is made

#### 2.14. Transaction for a non-existent User ID is rejected

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Submit a transaction using a syntactically valid but unregistered userId (e.g. all-zero UUID)
    - expect: Error banner shows 'user not found'
    - expect: No transaction is created

#### 2.15. Transfer with no Recipient ID is rejected

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Select type Transfer, fill User ID and Amount, leave Recipient ID blank, submit
    - expect: Error banner shows 'recipientId is required for transfers'

#### 2.16. Transfer with whitespace-only Recipient ID is rejected (why: client does not trim this field before submit — confirms server-side trim().length check catches it, mirroring the whitespace-name registration case)

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Select type Transfer, fill User ID and Amount, set Recipient ID to spaces only, submit
    - expect: Error banner shows 'recipientId is required for transfers'

#### 2.17. KNOWN GAP — transfer to a non-existent Recipient ID succeeds silently (why: verified live that the API never checks the recipient actually exists; document this as a regression-worthy business-logic gap, not a false negative in the test)

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Submit a transfer with a valid sender userId and a recipientId that is an arbitrary string not tied to any registered user
    - expect: Transaction is accepted and shows a completion message even though the recipient does not exist — flag this as a product risk to confirm with the team, not necessarily a test failure to 'fix' the test around

#### 2.18. Self-transfer where Recipient ID equals the sender's User ID (why: no check prevents a user from 'transferring' to themselves; confirms current behavior for future regression tracking)

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Submit a transfer where recipientId is set to the same value as userId
    - expect: Document actual behavior — verified code path allows this to succeed silently; capture as baseline

#### 2.19. Recipient ID supplied on a non-transfer transaction (deposit/withdrawal) (why: the API always forwards recipientId regardless of type; confirms it isn't silently dropped or, worse, displayed incorrectly in history)

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Select type Deposit, fill User ID and Amount, also fill Recipient ID with a value, submit
    - expect: Transaction succeeds
    - expect: In the transaction history table, confirm whether the Recipient column shows '-' or the unexpected recipient value for this deposit — document actual behavior

#### 2.20. Invalid transaction type via tampering (why: confirms server-side type allow-list ['transfer','deposit','withdrawal'] is enforced even though the UI can only submit one of these three)

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Inject/select a bogus transaction type value not present in the dropdown (or submit the equivalent payload directly to the gateway with type: 'bogus'), with valid userId/amount
    - expect: Server rejects with 'type must be one of: transfer, deposit, withdrawal'

#### 2.21. Form fully resets after a successful transaction (why: regression check that userId, amount, recipientId are cleared and type reverts to default)

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Fill and submit a fully valid transaction
    - expect: After success, User ID, Amount, and Recipient ID fields are empty and Type is reset to 'Transfer' (the default option)

#### 2.22. Form retains entered values after a validation/business error (why: consistent UX expectation with the registration form)

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Submit a transaction that triggers a server-side rejection (e.g. amount over the basic limit)
    - expect: User ID and Amount field values remain populated after the error is shown (fields are not cleared on error)

#### 2.23. Double-submit / rapid duplicate click on Create Transaction (why: no visible submit-guard in app.js — check for accidental duplicate transactions from one user action)

**File:** `tests/transactions/create-transaction.spec.ts`

**Steps:**
  1. Fill a fully valid transaction, click Create Transaction twice in rapid succession
    - expect: Document actual behavior: confirm whether one or two transactions are created for a single intended submission via the transaction history lookup

### 3. Transaction History Lookup (transaction.html — lookup section)

**Seed:** `tests/seed.spec.ts`

#### 3.1. Happy path — lookup a user with existing transactions

**File:** `tests/transactions/transaction-history.spec.ts`

**Steps:**
  1. Register a user, create at least one transaction for them, then look up that user's ID
    - expect: Table becomes visible with one row per transaction
    - expect: Row values match the created transaction(s): Type, Amount formatted as currency with 2 decimals (e.g. $5000.00), Recipient ('-' for non-transfers), Status ('completed'), and a human-readable Created timestamp

#### 3.2. Happy path — lookup a valid user with zero transactions

**File:** `tests/transactions/transaction-history.spec.ts`

**Steps:**
  1. Register a brand-new user and immediately look up their transaction history without creating any transactions
    - expect: Message shows 'No transactions for this user yet.' with success styling
    - expect: The transactions table remains hidden

#### 3.3. Empty User ID lookup is blocked client-side without a network call

**File:** `tests/transactions/transaction-history.spec.ts`

**Steps:**
  1. Leave the lookup User ID field empty, click View Transactions
    - expect: Message shows 'Enter a user ID first.' with error styling
    - expect: No network request is made and the table stays hidden

#### 3.4. Whitespace-only User ID lookup is treated as empty (why: app.js trims the value before checking; confirms this client-side trim actually works)

**File:** `tests/transactions/transaction-history.spec.ts`

**Steps:**
  1. Enter only spaces into the lookup User ID field, click View Transactions
    - expect: Message shows 'Enter a user ID first.' just like a truly empty field

#### 3.5. Lookup for a non-existent User ID

**File:** `tests/transactions/transaction-history.spec.ts`

**Steps:**
  1. Enter a syntactically valid but unregistered userId, click View Transactions
    - expect: Message shows 'user not found' with error styling
    - expect: Table remains hidden

#### 3.6. Table and message reset correctly between successive lookups (why: verifies stale rows/messages from a previous lookup don't linger and mislead the user)

**File:** `tests/transactions/transaction-history.spec.ts`

**Steps:**
  1. Look up a valid user with transactions (table shows rows), then immediately look up a non-existent user
    - expect: The previously shown table is hidden and its rows are cleared
    - expect: Only the 'user not found' message is visible, with no leftover rows from the first lookup

#### 3.7. Multiple transactions for one user all render in history (why: boundary check that the table isn't truncated/paginated and handles more than a trivial row count)

**File:** `tests/transactions/transaction-history.spec.ts`

**Steps:**
  1. Create 5+ transactions of varying types/amounts for the same user, then look up their history
    - expect: All created transactions appear as distinct rows, in a consistent order, with correct per-row data

#### 3.8. Currency formatting is correct for whole-number and decimal amounts

**File:** `tests/transactions/transaction-history.spec.ts`

**Steps:**
  1. Create one transaction with a whole-number amount (e.g. 100) and another with a decimal amount (e.g. 42.5) for the same user, then look up their history
    - expect: Both rows display amount formatted to exactly 2 decimal places (e.g. $100.00 and $42.50)

#### 3.9. Recipient column correctly distinguishes transfer vs non-transfer transactions

**File:** `tests/transactions/transaction-history.spec.ts`

**Steps:**
  1. Create one deposit and one transfer (with a recipientId) for the same user, then look up their history
    - expect: Deposit row shows '-' in the Recipient column
    - expect: Transfer row shows the actual recipientId value

### 4. Cross-Cutting: Authorization, Routing, and Error Handling

**Seed:** `tests/seed.spec.ts`

#### 4.1. Unauthorized direct access to a protected gateway API route (why: the frontend hardcodes an API key on every call; a request that skips the frontend and hits the gateway directly has no key and must be rejected — this is the closest equivalent this app has to 'unauthenticated access to a protected route')

**File:** `tests/security/api-security.spec.ts`

**Steps:**
  1. Navigate the browser directly to a gateway API URL, e.g. http://localhost:4000/api/users/<some-id>, without going through the frontend app (no x-api-key header is sent on a plain navigation)
    - expect: Response is HTTP 401 Unauthorized
    - expect: Response body is JSON with error 'Unauthorized' and message 'missing or invalid x-api-key header'

#### 4.2. Unauthorized access repeated for the transactions and notifications gateway routes (why: confirms the auth middleware is applied consistently to all three proxied route groups, not just /api/users)

**File:** `tests/security/api-security.spec.ts`

**Steps:**
  1. Directly navigate to http://localhost:4000/api/transactions/<id> and separately to http://localhost:4000/api/notifications
    - expect: Both return HTTP 401 Unauthorized with the same missing-key error body

#### 4.3. Invalid/tampered API key is rejected the same as a missing key (why: confirms the check is an exact match, not just presence-of-header)

**File:** `tests/security/api-security.spec.ts`

**Steps:**
  1. Intercept/override the frontend's outgoing request (e.g. via route interception or by overriding the API_KEY constant in-page) to send an incorrect x-api-key value, then trigger a registration or transaction submission from the UI
    - expect: Request is rejected with 401
    - expect: UI surfaces a generic failure message in the relevant error banner rather than crashing or hanging

#### 4.4. Unknown gateway route returns 404 (why: confirms the catch-all handler behaves correctly and doesn't leak a stack trace or an unrelated proxy error)

**File:** `tests/security/api-security.spec.ts`

**Steps:**
  1. Navigate directly to an undefined gateway path, e.g. http://localhost:4000/api/does-not-exist or http://localhost:4000/totally-unknown
    - expect: Response is HTTP 404 with JSON body {error: 'NotFound', message: 'no such gateway route'}

#### 4.5. Unknown frontend route returns 404

**File:** `tests/security/api-security.spec.ts`

**Steps:**
  1. Navigate to a nonexistent frontend path, e.g. http://localhost:3000/does-not-exist.html
    - expect: Frontend server responds with HTTP 404

#### 4.6. Downstream service unreachable during transaction creation (why: transaction-service depends on user-service via fetch; if that call fails, the API is documented to return 502 'unable to reach user-service' — verify the UI surfaces this cleanly instead of a raw/opaque error)

**File:** `tests/security/error-handling.spec.ts`

**Steps:**
  1. Use Playwright route interception to make the gateway's transaction-creation call respond with HTTP 502 and body {error: 'UpstreamError', message: 'unable to reach user-service'}, then submit a transaction from the UI
    - expect: Error banner displays 'unable to reach user-service'
    - expect: The app does not crash or hang; the form remains usable for retry

#### 4.7. Malformed/non-JSON error response from the API is handled gracefully (why: app.js has a .catch(() => ({})) fallback around response.json() specifically to avoid crashing on unparsable bodies — confirm this fallback path actually works)

**File:** `tests/security/error-handling.spec.ts`

**Steps:**
  1. Intercept a POST to /api/users or /api/transactions and fulfill it with a non-2xx status and a non-JSON body (e.g. plain text or empty body)
    - expect: UI shows a generic fallback error message (e.g. 'Request failed with status <code>') instead of throwing an unhandled JS error or leaving the message banner blank

#### 4.8. Network failure / connection refused during form submission (why: simulates the gateway or a downstream service being completely down, not just returning an error status)

**File:** `tests/security/error-handling.spec.ts`

**Steps:**
  1. Intercept the relevant API call and abort it (simulating a dropped connection / DNS failure) instead of returning any response, then submit the registration or transaction form
    - expect: UI displays an error message rather than hanging indefinitely or showing a false success
    - expect: No unhandled promise rejection is visible in the console that leaves the UI stuck

#### 4.9. Slow/hanging API response does not silently appear successful (why: there is no visible loading/spinner state in the markup — confirm the UI doesn't mislead the user into re-submitting or assuming failure during a long wait)

**File:** `tests/security/error-handling.spec.ts`

**Steps:**
  1. Intercept the relevant API call and delay the response by several seconds before fulfilling it normally, observing the UI state during the delay
    - expect: Document actual UX during the delay (e.g. button remains clickable, no loading indicator) as a baseline; confirm the eventual success/error message still renders correctly once the delayed response arrives

#### 4.10. Browser back navigation after a successful submission does not cause duplicate or stale action (why: confirms bfcache/back-forward navigation doesn't resubmit a form or show a misleading cached success state)

**File:** `tests/security/error-handling.spec.ts`

**Steps:**
  1. Submit a valid registration, then use the browser Back button to return to the (now-reset) register page, then forward again
    - expect: No duplicate submission occurs automatically
    - expect: Page state is consistent (either a fresh empty form or the last known state), with no leftover success message tied to stale data
