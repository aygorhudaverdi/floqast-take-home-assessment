// spec: specs/ui-test-plan.md
// seed: tests/seed.spec.ts

import { test, expect } from "../fixtures";
import { GATEWAY_URL } from '../support/env';
import { uniqueEmail } from "../support/factories";
import type { RegisterPage } from "../../pages/RegisterPage";
import type { AccountType } from "../../pages/RegisterPage";

const TRANSACTION_SUCCESS_REGEX =
  /^Transaction [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12} completed\.$/i;

const BASIC_LIMIT_ERROR =
  "basic accounts are limited to $5000 per transaction; upgrade to premium for higher limits";

/** Registers a brand-new user via the real registration form and returns the created user's ID. */
async function registerFreshUser(
  registerPage: RegisterPage,
  accountType: AccountType,
  label: string
): Promise<string> {
  await registerPage.goto();
  await registerPage.register({
    name: `TX ${label}`,
    email: uniqueEmail(label),
    accountType,
  });
  return registerPage.getCreatedUserId();
}

test.describe("Transaction Creation (transaction.html — create form)", () => {
  test("Happy path — deposit for a Basic account under the limit", async ({
    registerPage,
    transactionPage,
  }) => {
    // 1. Register a fresh Basic user (setup), navigate to /transaction.html, fill that user's ID, amount 100, type Deposit, submit
    const userId = await registerFreshUser(registerPage, "basic", "deposit-basic");
    await transactionPage.goto();
    await transactionPage.createTransaction({ userId, amount: "100", type: "deposit" });

    // expect: Success message 'Transaction <uuid> completed.' is shown
    await expect(transactionPage.transactionMessage).toHaveText(TRANSACTION_SUCCESS_REGEX);
    expect(await transactionPage.getTransactionMessageKind()).toBe("success");

    // expect: Form resets (type reverts to default 'Transfer')
    await expect(transactionPage.userIdInput).toHaveValue("");
    await expect(transactionPage.amountInput).toHaveValue("");
    await expect(transactionPage.typeSelect).toHaveValue("transfer");
    await expect(transactionPage.recipientIdInput).toHaveValue("");
  });

  test("Happy path — withdrawal for a Basic account", async ({ registerPage, transactionPage }) => {
    // 1. Using a registered Basic user, submit a withdrawal transaction with a valid amount
    const userId = await registerFreshUser(registerPage, "basic", "withdrawal-basic");
    await transactionPage.goto();
    await transactionPage.createTransaction({ userId, amount: "200", type: "withdrawal" });

    // expect: Transaction completes successfully with a confirmation message
    await expect(transactionPage.transactionMessage).toHaveText(TRANSACTION_SUCCESS_REGEX);
    expect(await transactionPage.getTransactionMessageKind()).toBe("success");
  });

  test("Happy path — transfer with a valid recipient ID", async ({ registerPage, transactionPage }) => {
    // 1. Submit a transfer transaction with userId, amount, and a non-empty recipientId
    const senderId = await registerFreshUser(registerPage, "basic", "transfer-sender");
    const recipientId = await registerFreshUser(registerPage, "basic", "transfer-recipient");
    await transactionPage.goto();
    await transactionPage.createTransaction({
      userId: senderId,
      amount: "50",
      type: "transfer",
      recipientId,
    });

    // expect: Transaction completes successfully with a confirmation message
    await expect(transactionPage.transactionMessage).toHaveText(TRANSACTION_SUCCESS_REGEX);
    expect(await transactionPage.getTransactionMessageKind()).toBe("success");
  });

  test("Boundary — amount exactly at the Basic account limit ($5000) succeeds", async ({
    registerPage,
    transactionPage,
  }) => {
    // 1. For a Basic account, submit a deposit of exactly 5000
    const userId = await registerFreshUser(registerPage, "basic", "limit-boundary");
    await transactionPage.goto();
    await transactionPage.createTransaction({ userId, amount: "5000", type: "deposit" });

    // expect: Transaction succeeds with a completion message (this boundary is inclusive)
    await expect(transactionPage.transactionMessage).toHaveText(TRANSACTION_SUCCESS_REGEX);
    expect(await transactionPage.getTransactionMessageKind()).toBe("success");
  });

  test("Boundary — amount just above the Basic account limit ($5000.01) is rejected", async ({
    registerPage,
    transactionPage,
  }) => {
    // 1. For a Basic account, submit a deposit of 5000.01
    const userId = await registerFreshUser(registerPage, "basic", "limit-over");
    await transactionPage.goto();
    await transactionPage.createTransaction({ userId, amount: "5000.01", type: "deposit" });

    // expect: Error banner shows 'basic accounts are limited to $5000 per transaction; upgrade to premium for higher limits'
    await expect(transactionPage.transactionMessage).toHaveText(BASIC_LIMIT_ERROR);
    expect(await transactionPage.getTransactionMessageKind()).toBe("error");
  });

  test("Zero amount is rejected", async ({ registerPage, transactionPage }) => {
    // 1. Submit a transaction with amount = 0
    const userId = await registerFreshUser(registerPage, "basic", "zero-amount");
    await transactionPage.goto();
    await transactionPage.createTransaction({ userId, amount: "0", type: "deposit" });

    // expect: Error banner shows 'amount must be a positive number'
    await expect(transactionPage.transactionMessage).toHaveText("amount must be a positive number");
    expect(await transactionPage.getTransactionMessageKind()).toBe("error");
  });

  test("Negative amount is rejected", async ({ registerPage, transactionPage }) => {
    // 1. Submit a transaction with amount = -50
    const userId = await registerFreshUser(registerPage, "basic", "negative-amount");
    await transactionPage.goto();
    await transactionPage.createTransaction({ userId, amount: "-50", type: "deposit" });

    // expect: Error banner shows 'amount must be a positive number'
    await expect(transactionPage.transactionMessage).toHaveText("amount must be a positive number");
    expect(await transactionPage.getTransactionMessageKind()).toBe("error");
  });

  test("Non-numeric amount input is blocked by the number field", async ({ transactionPage }) => {
    await transactionPage.goto();

    // 1. Attempt to type non-numeric characters (e.g. 'abc') into the Amount field, then submit
    await transactionPage.fillUserId("11111111-1111-1111-1111-111111111111");
    await transactionPage.amountInput.pressSequentially("abc");

    // expect: The number input rejects/ignores non-numeric characters (value stays empty)
    await expect(transactionPage.amountInput).toHaveValue("");

    await transactionPage.submit();

    // expect: Native required validation blocks submission
    await expect(transactionPage.transactionMessage).toHaveText("");
  });

  test("Amount as Infinity via scientific notation overflow", async ({
    registerPage,
    transactionPage,
  }) => {
    // 1. Enter an extreme scientific-notation amount that overflows to Infinity when parsed (e.g. '1e400') and submit
    //
    // Verified live: Chromium's <input type="number"> treats '1e400' as badInput (it exceeds
    // the type's representable range) and clears the field entirely rather than storing the raw
    // string, so the value never reaches app.js or the server. The scenario is therefore
    // equivalent to the non-numeric-input case (2.8): the browser's own validation blocks
    // submission before any request is made, so the server's Number.isFinite guard is never
    // exercised through this UI path.
    const userId = await registerFreshUser(registerPage, "basic", "infinity-amount");
    await transactionPage.goto();
    await transactionPage.fillUserId(userId);
    await transactionPage.amountInput.fill("1e400");

    // expect: The number input rejects the out-of-range value (value stays empty)
    await expect(transactionPage.amountInput).toHaveValue("");

    await transactionPage.submit();

    // expect: Native required validation blocks submission; no request is ever sent
    await expect(transactionPage.transactionMessage).toHaveText("");
  });

  test("Extremely large finite amount for a Basic account is rejected by the limit check, not accepted or crashed", async ({
    registerPage,
    transactionPage,
  }) => {
    // 1. For a Basic account, submit a large but finite amount (e.g. 999999999)
    const userId = await registerFreshUser(registerPage, "basic", "large-finite");
    await transactionPage.goto();
    await transactionPage.createTransaction({ userId, amount: "999999999", type: "deposit" });

    // expect: Rejected with the $5000 basic-account limit error, not a server crash or generic error
    await expect(transactionPage.transactionMessage).toHaveText(BASIC_LIMIT_ERROR);
    expect(await transactionPage.getTransactionMessageKind()).toBe("error");
  });

  test("Extremely large amount for a Premium account succeeds", async ({
    registerPage,
    transactionPage,
  }) => {
    // 1. Register a Premium user, submit a deposit of 99999999999
    const userId = await registerFreshUser(registerPage, "premium", "premium-unlimited");
    await transactionPage.goto();
    await transactionPage.createTransaction({ userId, amount: "99999999999", type: "deposit" });

    // expect: Transaction completes successfully with no limit-related error
    await expect(transactionPage.transactionMessage).toHaveText(TRANSACTION_SUCCESS_REGEX);
    expect(await transactionPage.getTransactionMessageKind()).toBe("success");
  });

  test("Missing User ID is blocked client-side", async ({ transactionPage, page }) => {
    await transactionPage.goto();
    const transactionRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/transactions")) transactionRequests.push(req.url());
    });

    // 1. Leave User ID blank, fill Amount and Type, submit
    await transactionPage.fillAmount("100");
    await transactionPage.selectType("deposit");
    await transactionPage.submit();

    // expect: Native required validation blocks submission; no API call is made
    await expect(transactionPage.transactionMessage).toHaveText("");
    expect(transactionRequests).toHaveLength(0);
  });

  test("Missing Amount is blocked client-side", async ({ transactionPage, page }) => {
    await transactionPage.goto();
    const transactionRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/transactions")) transactionRequests.push(req.url());
    });

    // 1. Fill User ID, leave Amount blank, submit
    await transactionPage.fillUserId("11111111-1111-1111-1111-111111111111");
    await transactionPage.selectType("deposit");
    await transactionPage.submit();

    // expect: Native required validation blocks submission; no API call is made
    await expect(transactionPage.transactionMessage).toHaveText("");
    expect(transactionRequests).toHaveLength(0);
  });

  test("Transaction for a non-existent User ID is rejected", async ({ transactionPage }) => {
    await transactionPage.goto();

    // 1. Submit a transaction using a syntactically valid but unregistered userId (e.g. all-zero UUID)
    await transactionPage.createTransaction({
      userId: "00000000-0000-0000-0000-000000000000",
      amount: "100",
      type: "deposit",
    });

    // expect: Error banner shows 'user not found'
    await expect(transactionPage.transactionMessage).toHaveText("user not found");
    expect(await transactionPage.getTransactionMessageKind()).toBe("error");
  });

  test("Transfer with no Recipient ID is rejected", async ({ registerPage, transactionPage }) => {
    // 1. Select type Transfer, fill User ID and Amount, leave Recipient ID blank, submit
    const userId = await registerFreshUser(registerPage, "basic", "transfer-no-recipient");
    await transactionPage.goto();
    await transactionPage.createTransaction({ userId, amount: "50", type: "transfer" });

    // expect: Error banner shows 'recipientId is required for transfers'
    await expect(transactionPage.transactionMessage).toHaveText("recipientId is required for transfers");
    expect(await transactionPage.getTransactionMessageKind()).toBe("error");
  });

  test("Transfer with whitespace-only Recipient ID is rejected", async ({
    registerPage,
    transactionPage,
  }) => {
    // 1. Select type Transfer, fill User ID and Amount, set Recipient ID to spaces only, submit
    const userId = await registerFreshUser(registerPage, "basic", "transfer-space-recipient");
    await transactionPage.goto();
    await transactionPage.createTransaction({
      userId,
      amount: "50",
      type: "transfer",
      recipientId: "   ",
    });

    // expect: Error banner shows 'recipientId is required for transfers'
    await expect(transactionPage.transactionMessage).toHaveText("recipientId is required for transfers");
  });

  test("KNOWN GAP — transfer to a non-existent Recipient ID succeeds silently", async ({
    registerPage,
    transactionPage,
  }) => {
    // 1. Submit a transfer with a valid sender userId and a recipientId that is an arbitrary string not tied to any registered user
    const userId = await registerFreshUser(registerPage, "basic", "transfer-ghost-recipient");
    await transactionPage.goto();
    await transactionPage.createTransaction({
      userId,
      amount: "50",
      type: "transfer",
      recipientId: "nonexistent-recipient-not-a-real-user",
    });

    // expect: Transaction is accepted and shows a completion message even though the recipient does not exist.
    // KNOWN GAP: the API never checks that recipientId corresponds to an existing user; flagged here as a
    // product risk to confirm with the team, not a test to be "fixed" around.
    await expect(transactionPage.transactionMessage).toHaveText(TRANSACTION_SUCCESS_REGEX);
    expect(await transactionPage.getTransactionMessageKind()).toBe("success");
  });

  test("Self-transfer where Recipient ID equals the sender's User ID", async ({
    registerPage,
    transactionPage,
  }) => {
    // 1. Submit a transfer where recipientId is set to the same value as userId
    const userId = await registerFreshUser(registerPage, "basic", "self-transfer");
    await transactionPage.goto();
    await transactionPage.createTransaction({
      userId,
      amount: "50",
      type: "transfer",
      recipientId: userId,
    });

    // expect: Baseline captured — current behavior allows a self-transfer to succeed silently, with no guard
    // comparing recipientId to the sender's own userId.
    await expect(transactionPage.transactionMessage).toHaveText(TRANSACTION_SUCCESS_REGEX);
    expect(await transactionPage.getTransactionMessageKind()).toBe("success");
  });

  test("Recipient ID supplied on a non-transfer transaction (deposit/withdrawal)", async ({
    registerPage,
    transactionPage,
  }) => {
    // 1. Select type Deposit, fill User ID and Amount, also fill Recipient ID with a value, submit
    const userId = await registerFreshUser(registerPage, "basic", "deposit-with-recipient");
    await transactionPage.goto();
    const recipientValue = "unexpected-recipient-value";
    await transactionPage.createTransaction({
      userId,
      amount: "75",
      type: "deposit",
      recipientId: recipientValue,
    });

    // expect: Transaction succeeds
    await expect(transactionPage.transactionMessage).toHaveText(TRANSACTION_SUCCESS_REGEX);

    // expect: In the transaction history table, confirm whether the Recipient column shows '-' or the
    // unexpected recipient value for this deposit — documented actual behavior: the API forwards and stores
    // recipientId regardless of type, so it renders as the supplied value, not '-'.
    await transactionPage.lookupTransactions(userId);
    const rows = await transactionPage.getTransactionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].recipient).toBe(recipientValue);
  });

  test("Invalid transaction type via tampering", async ({ registerPage, request }) => {
    // 1. Submit the equivalent payload directly against the gateway API with type: 'bogus', with a valid
    // userId/amount (the UI's Type dropdown can only ever submit transfer/deposit/withdrawal, so a tampered
    // value must be sent as a raw API call to exercise the server-side allow-list).
    const userId = await registerFreshUser(registerPage, "basic", "bogus-type");
    const response = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: { "x-api-key": "dev-secret-key", "Content-Type": "application/json" },
      data: { userId, amount: 50, type: "bogus" },
    });

    // expect: Server rejects with 'type must be one of: transfer, deposit, withdrawal'
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.message).toBe("type must be one of: transfer, deposit, withdrawal");
  });

  test("Form fully resets after a successful transaction", async ({ registerPage, transactionPage }) => {
    // 1. Fill and submit a fully valid transaction
    const userId = await registerFreshUser(registerPage, "basic", "form-reset");
    const recipientId = await registerFreshUser(registerPage, "basic", "form-reset-recipient");
    await transactionPage.goto();
    await transactionPage.createTransaction({ userId, amount: "25", type: "transfer", recipientId });
    await expect(transactionPage.transactionMessage).toHaveText(TRANSACTION_SUCCESS_REGEX);

    // expect: After success, User ID, Amount, and Recipient ID fields are empty and Type is reset to
    // 'Transfer' (the default option)
    await expect(transactionPage.userIdInput).toHaveValue("");
    await expect(transactionPage.amountInput).toHaveValue("");
    await expect(transactionPage.recipientIdInput).toHaveValue("");
    await expect(transactionPage.typeSelect).toHaveValue("transfer");
  });

  test("Form retains entered values after a validation/business error", async ({
    registerPage,
    transactionPage,
  }) => {
    // 1. Submit a transaction that triggers a server-side rejection (e.g. amount over the basic limit)
    const userId = await registerFreshUser(registerPage, "basic", "retain-on-error");
    await transactionPage.goto();
    await transactionPage.createTransaction({ userId, amount: "5000.01", type: "deposit" });
    await expect(transactionPage.transactionMessage).toHaveText(BASIC_LIMIT_ERROR);

    // expect: User ID and Amount field values remain populated after the error is shown (fields are not
    // cleared on error)
    await expect(transactionPage.userIdInput).toHaveValue(userId);
    await expect(transactionPage.amountInput).toHaveValue("5000.01");
  });

  test("Double-submit / rapid duplicate click on Create Transaction", async ({
    registerPage,
    transactionPage,
    page,
  }) => {
    const userId = await registerFreshUser(registerPage, "basic", "double-submit");
    await transactionPage.goto();
    await transactionPage.fillUserId(userId);
    await transactionPage.fillAmount("40");
    await transactionPage.selectType("deposit");

    // 1. Fill a fully valid transaction, click Create Transaction twice in rapid succession
    const bothResponses = Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/transactions") && res.request().method() === "POST"
      ),
      page.waitForResponse(
        (res) => res.url().includes("/api/transactions") && res.request().method() === "POST"
      ),
    ]);
    await transactionPage.submitButton.dblclick();
    await bothResponses;

    // expect: Document actual behavior: confirm whether one or two transactions were created for a single
    // intended submission via the transaction history lookup. No submit-guard exists in app.js, so both rapid
    // clicks independently submit and succeed, creating two transactions.
    await transactionPage.lookupTransactions(userId);
    const rows = await transactionPage.getTransactionRows();
    expect(rows).toHaveLength(2);
  });
});
