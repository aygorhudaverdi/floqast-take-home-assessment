// spec: specs/api-test-plan.md
// seed: tests/seed.spec.ts

import { test, expect, GATEWAY_URL, AUTH_HEADERS, createUser, createTransaction } from '../helpers';

test.describe('2. Error Scenario Handling', () => {
  test('2.12 Race condition — a notification created by a transaction may not be immediately visible via GET', async ({
    request,
  }) => {
    // 1. Create a user
    const { response: createUserResponse, body: user } = await createUser(request, { name: 'Timing Race User' });
    expect(createUserResponse.status()).toBe(201);

    // 2. POST a transaction
    const { response: createTransactionResponse, body: transaction } = await createTransaction(request, user.id, {
      amount: 250,
      type: 'deposit',
    });
    expect(createTransactionResponse.status()).toBe(201);

    // 3. Immediately (no wait) GET /api/notifications/:userId
    // expect: Document actual behavior — the immediate GET may or may not include the new
    // notification yet, since transaction-service's internal notify() call is fire-and-forget
    // and not awaited before the transaction response returns. Deliberately not asserted either
    // way here to avoid a flaky test.
    const immediateResponse = await request.get(`${GATEWAY_URL}/api/notifications/${user.id}`, {
      headers: AUTH_HEADERS,
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
            headers: AUTH_HEADERS,
          });
          const notifications = await pollResponse.json();
          return notifications.some((n: { transactionId: string }) => n.transactionId === transaction.id);
        },
        { message: 'expected the transaction-triggered notification to eventually appear', timeout: 5000 }
      )
      .toBe(true);

    const finalResponse = await request.get(`${GATEWAY_URL}/api/notifications/${user.id}`, {
      headers: AUTH_HEADERS,
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
