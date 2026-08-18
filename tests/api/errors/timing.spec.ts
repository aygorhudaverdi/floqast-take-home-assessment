// spec: specs/api-test-plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '../../fixtures';

const GATEWAY_URL = 'http://localhost:4000';
const API_KEY = 'dev-secret-key';

test.describe('2. Error Scenario Handling', () => {
  test('2.12 Race condition — a notification created by a transaction may not be immediately visible via GET', async ({
    request,
  }) => {
    // 1. Create a user
    const uniqueEmail = `timing-race-${Date.now()}@example.com`;
    const createUserResponse = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        name: 'Timing Race User',
        email: uniqueEmail,
        accountType: 'basic',
      },
    });
    expect(createUserResponse.status()).toBe(201);
    const user = await createUserResponse.json();

    // 2. POST a transaction
    const createTransactionResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        userId: user.id,
        amount: 250,
        type: 'deposit',
      },
    });
    expect(createTransactionResponse.status()).toBe(201);
    const transaction = await createTransactionResponse.json();

    // 3. Immediately (no wait) GET /api/notifications/:userId
    // expect: Document actual behavior — the immediate GET may or may not include the new
    // notification yet, since transaction-service's internal notify() call is fire-and-forget
    // and not awaited before the transaction response returns. Deliberately not asserted either
    // way here to avoid a flaky test.
    const immediateResponse = await request.get(`${GATEWAY_URL}/api/notifications/${user.id}`, {
      headers: { 'x-api-key': API_KEY },
    });
    expect(immediateResponse.status()).toBe(200);
    const immediateNotifications = await immediateResponse.json();
    const immediateHasNotification = immediateNotifications.some(
      (n: { transactionId: string }) => n.transactionId === transaction.id
    );

    // 4. Repeat the GET after a short poll/delay
    // expect: The delayed GET reliably includes the notification with the expected auto-generated
    // message and correct transactionId linkage — asserting eventual consistency rather than
    // immediate consistency avoids a flaky false-negative test.
    await expect
      .poll(
        async () => {
          const pollResponse = await request.get(`${GATEWAY_URL}/api/notifications/${user.id}`, {
            headers: { 'x-api-key': API_KEY },
          });
          const notifications = await pollResponse.json();
          return notifications.some((n: { transactionId: string }) => n.transactionId === transaction.id);
        },
        { message: 'expected the transaction-triggered notification to eventually appear', timeout: 5000 }
      )
      .toBe(true);

    const finalResponse = await request.get(`${GATEWAY_URL}/api/notifications/${user.id}`, {
      headers: { 'x-api-key': API_KEY },
    });
    const finalNotifications = await finalResponse.json();
    const notification = finalNotifications.find(
      (n: { transactionId: string }) => n.transactionId === transaction.id
    );
    expect(notification).toBeTruthy();
    expect(notification.message).toBe('deposit of $250 completed');

    // Document (not assert) whether the immediate call happened to catch the race — informational only.
    // eslint-disable-next-line no-console
    console.log(`Immediate GET included the notification: ${immediateHasNotification}`);
  });
});
