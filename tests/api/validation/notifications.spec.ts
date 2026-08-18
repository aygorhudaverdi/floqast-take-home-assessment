// spec: specs/api-test-plan.md
// seed: tests/seed.spec.ts
// Pure HTTP/API tests against the gateway (http://localhost:4000) using Playwright's
// built-in `request` fixture. No page.goto, no UI interaction of any kind.

import { test, expect } from '@playwright/test';
import { GATEWAY_URL, AUTH_HEADERS, createUser } from '../helpers';

test.describe('Data Validation Tests', () => {
  test('3.13 Notification field validation (userId, message required; transactionId optional)', async ({
    request,
  }) => {
    const { body: user } = await createUser(request, { accountType: 'basic' });

    // 1. POST /api/notifications with userId omitted (message present)
    const missingUserIdResponse = await request.post(`${GATEWAY_URL}/api/notifications`, {
      headers: AUTH_HEADERS,
      data: { message: 'A notification message' },
    });
    await expect(missingUserIdResponse).toBeValidationError('userId is required');

    // 2. POST /api/notifications with message omitted (userId present)
    const missingMessageResponse = await request.post(`${GATEWAY_URL}/api/notifications`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id },
    });
    await expect(missingMessageResponse).toBeValidationError('message is required');

    // 3. POST /api/notifications with message='   ' (whitespace only)
    const whitespaceMessageResponse = await request.post(`${GATEWAY_URL}/api/notifications`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, message: '   ' },
    });
    await expect(whitespaceMessageResponse).toBeValidationError('message is required');

    // 4. POST /api/notifications with a valid userId and message, transactionId omitted entirely
    const validResponse = await request.post(`${GATEWAY_URL}/api/notifications`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, message: 'Your balance has changed' },
    });
    expect(validResponse.status()).toBe(201);
    const validBody = await validResponse.json();
    expect(validBody.transactionId).toBeNull();
    expect(validBody.userId).toBe(user.id);
    expect(validBody.message).toBe('Your balance has changed');
  });

  test('3.14 Notification userId is never existence-checked (Create or Read) — documented gap', async ({
    request,
  }) => {
    // 1. POST /api/notifications with userId='totally-made-up-user-id' (never registered) and a valid message
    const response = await request.post(`${GATEWAY_URL}/api/notifications`, {
      headers: AUTH_HEADERS,
      data: { userId: 'totally-made-up-user-id', message: 'Notification for an unregistered user' },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.userId).toBe('totally-made-up-user-id');
  });
});
