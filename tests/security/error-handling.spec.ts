// spec: specs/ui-test-plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '../fixtures';

test.describe('Cross-Cutting: Authorization, Routing, and Error Handling', () => {
  test('Downstream service unreachable during transaction creation', async ({ page, registerPage, transactionPage }) => {
    // Setup: register a user to submit a transaction for
    await registerPage.goto();
    await registerPage.register({
      name: 'Downstream Failure User',
      email: `downstream-failure-${Date.now()}@example.com`,
      accountType: 'basic',
    });
    const userId = await registerPage.getCreatedUserId();

    await transactionPage.goto();

    // 1. Use Playwright route interception to make the gateway's transaction-creation call respond with HTTP 502 and body {error: 'UpstreamError', message: 'unable to reach user-service'}, then submit a transaction from the UI
    await page.route('http://localhost:4000/api/transactions', async (route) => {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'UpstreamError', message: 'unable to reach user-service' }),
      });
    });

    await transactionPage.createTransaction({ userId, amount: '100', type: 'deposit' });

    // expect: Error banner displays 'unable to reach user-service'
    await expect(transactionPage.transactionMessage).toHaveText('unable to reach user-service');
    expect(await transactionPage.getTransactionMessageKind()).toBe('error');

    // expect: The app does not crash or hang; the form remains usable for retry
    await expect(transactionPage.submitButton).toBeEnabled();
    await expect(transactionPage.userIdInput).toHaveValue(userId);
    await expect(transactionPage.amountInput).toHaveValue('100');
  });

  test('Malformed/non-JSON error response from the API is handled gracefully', async ({ page, registerPage }) => {
    // 1. Intercept a POST to /api/users or /api/transactions and fulfill it with a non-2xx status and a non-JSON body (e.g. plain text or empty body)
    await page.route('http://localhost:4000/api/users', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'Internal Server Error',
      });
    });

    await registerPage.goto();
    await registerPage.register({
      name: 'Malformed Response User',
      email: `malformed-response-${Date.now()}@example.com`,
      accountType: 'basic',
    });

    // expect: UI shows a generic fallback error message (e.g. 'Request failed with status <code>') instead of throwing an unhandled JS error or leaving the message banner blank
    // (app.js falls back to `response.json().catch(() => ({}))`, so a non-JSON body yields an empty
    // parsed body and the generic `Request failed with status ${response.status}` message is shown)
    await expect(registerPage.messageBanner).toHaveText('Request failed with status 500');
    expect(await registerPage.getMessageKind()).toBe('error');
    await expect(registerPage.resultText).toHaveText('');
  });

  test('Network failure / connection refused during form submission', async ({ page, registerPage }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    // 1. Intercept the relevant API call and abort it (simulating a dropped connection / DNS failure) instead of returning any response, then submit the registration or transaction form
    await page.route('http://localhost:4000/api/users', async (route) => {
      await route.abort('connectionrefused');
    });

    await registerPage.goto();
    await registerPage.register({
      name: 'Network Failure User',
      email: `network-failure-${Date.now()}@example.com`,
      accountType: 'basic',
    });

    // expect: UI displays an error message rather than hanging indefinitely or showing a false success
    // (an aborted fetch() rejects with a TypeError whose message is surfaced verbatim by app.js's catch block)
    await expect(registerPage.messageBanner).toHaveText('Failed to fetch');
    expect(await registerPage.getMessageKind()).toBe('error');

    // expect: No unhandled promise rejection is visible in the console that leaves the UI stuck
    expect(pageErrors).toHaveLength(0);
    await expect(registerPage.submitButton).toBeEnabled();
  });

  test('Slow/hanging API response does not silently appear successful', async ({ page, registerPage, transactionPage }) => {
    // Setup: register a user to submit a transaction for
    await registerPage.goto();
    await registerPage.register({
      name: 'Slow Response User',
      email: `slow-response-${Date.now()}@example.com`,
      accountType: 'basic',
    });
    const userId = await registerPage.getCreatedUserId();

    await transactionPage.goto();

    // 1. Intercept the relevant API call and delay the response by several seconds before fulfilling it normally, observing the UI state during the delay
    await page.route('http://localhost:4000/api/transactions', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'delayed-transaction-id',
          userId,
          amount: 100,
          type: 'deposit',
          recipientId: null,
          status: 'completed',
          createdAt: new Date().toISOString(),
        }),
      });
    });

    // createTransaction() itself waits for the response to land, which would swallow the
    // mid-flight state this test needs to observe — so drive the form directly instead.
    await transactionPage.fillUserId(userId);
    await transactionPage.fillAmount('100');
    await transactionPage.selectType('deposit');
    await transactionPage.submit();

    // expect: Document actual UX during the delay (e.g. button remains clickable, no loading indicator) as a baseline
    // (the markup has no spinner/loading element and app.js does not disable the button on submit)
    await expect(transactionPage.transactionMessage).toHaveText('');
    await expect(transactionPage.submitButton).toBeEnabled();

    // expect: confirm the eventual success/error message still renders correctly once the delayed response arrives
    await expect(transactionPage.transactionMessage).toHaveText('Transaction delayed-transaction-id completed.', {
      timeout: 10000,
    });
    expect(await transactionPage.getTransactionMessageKind()).toBe('success');
  });

  test('Browser back navigation after a successful submission does not cause duplicate or stale action', async ({
    page,
    registerPage,
  }) => {
    let registerRequestCount = 0;
    page.on('request', (req) => {
      if (req.url() === 'http://localhost:4000/api/users' && req.method() === 'POST') {
        registerRequestCount += 1;
      }
    });

    // 1. Submit a valid registration, then use the browser Back button to return to the (now-reset) register page, then forward again
    await page.goto('/index.html');
    await registerPage.goto();
    await registerPage.register({
      name: 'Back Navigation User',
      email: `back-navigation-${Date.now()}@example.com`,
      accountType: 'basic',
    });
    await expect(registerPage.messageBanner).toHaveText('User created successfully.');
    const createdUserId = await registerPage.getCreatedUserId();
    expect(registerRequestCount).toBe(1);

    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Mock Fintech Microservices App' })).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/register/);

    // expect: No duplicate submission occurs automatically
    expect(registerRequestCount).toBe(1);

    // expect: Page state is consistent (either a fresh empty form or the last known state), with no leftover success message tied to stale data
    await expect(registerPage.nameInput).toHaveValue('');
    await expect(registerPage.emailInput).toHaveValue('');
    const messageAfterForward = await registerPage.getMessageText();
    expect(messageAfterForward === '' || messageAfterForward === 'User created successfully.').toBe(true);
    if (messageAfterForward === 'User created successfully.') {
      await expect(registerPage.resultText).toHaveText(`ID: ${createdUserId}`);
    }
  });
});
