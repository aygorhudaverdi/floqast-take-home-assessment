// spec: specs/api-test-plan.md
// seed: tests/seed.spec.ts
// Pure HTTP/API tests against the gateway (http://localhost:4000) using Playwright's
// built-in `request` fixture. No page.goto, no UI interaction of any kind.

import { test, expect } from '@playwright/test';
import { GATEWAY_URL, AUTH_HEADERS, createUser } from '../helpers';

test.describe('1. CRUD Operations Testing', () => {
  test('1.9 Create and read a notification directly (manual, non-transaction-triggered)', async ({ request }) => {
    // 2. Create a user, then POST /api/notifications with {userId, message}, omitting transactionId
    const { body: user } = await createUser(request);
    const createResponse = await request.post(`${GATEWAY_URL}/api/notifications`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, message: 'hello there' },
    });
    expect(createResponse.status()).toBe(201);
    const createdNotification = await createResponse.json();
    expect(createdNotification).toMatchObject({
      userId: user.id,
      transactionId: null,
      message: 'hello there',
    });
    expect(createdNotification.id).toBeTruthy();
    expect(createdNotification.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // 3. GET /api/notifications/:userId
    const listResponse = await request.get(`${GATEWAY_URL}/api/notifications/${user.id}`, {
      headers: AUTH_HEADERS,
    });
    expect(listResponse.status()).toBe(200);
    const notifications = await listResponse.json();
    expect(notifications).toEqual([createdNotification]);
  });

  test('1.10 Notification auto-created as a side effect of a transaction (cross-resource Read)', async ({ request }) => {
    // 2. Create a user, POST a deposit transaction of amount=250 for them, then poll/wait briefly and GET /api/notifications/:userId
    const { body: user } = await createUser(request);
    const txResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, amount: 250, type: 'deposit' },
    });
    expect(txResponse.status()).toBe(201);
    const transaction = await txResponse.json();

    // Transaction creation triggers a fire-and-forget internal call to notification-service,
    // so poll briefly instead of asserting on the very next GET (see 2.12 for the race-condition test).
    await expect(async () => {
      const listResponse = await request.get(`${GATEWAY_URL}/api/notifications/${user.id}`, {
        headers: AUTH_HEADERS,
      });
      expect(listResponse.status()).toBe(200);
      const notifications = await listResponse.json();
      const autoNotification = notifications.find((n: any) => n.transactionId === transaction.id);
      expect(autoNotification).toBeTruthy();
      expect(autoNotification.message).toBe('deposit of $250 completed');
    }).toPass({ timeout: 5000 });
  });

  test('1.11 Notification list for a user with zero notifications returns an empty array', async ({ request }) => {
    // 2. Create a fresh user, GET /api/notifications/:userId with no notifications created
    const { body: user } = await createUser(request);
    const response = await request.get(`${GATEWAY_URL}/api/notifications/${user.id}`, {
      headers: AUTH_HEADERS,
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test('1.12 Notification list for a nonexistent user ALSO returns 200 empty array, not 404 (documented asymmetry vs. transactions)', async ({ request }) => {
    // 2. GET /api/notifications/00000000-0000-0000-0000-000000000000 (never-created user)
    const response = await request.get(
      `${GATEWAY_URL}/api/notifications/00000000-0000-0000-0000-000000000000`,
      { headers: AUTH_HEADERS }
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
