// spec: specs/api-test-plan.md
// seed: tests/seed.spec.ts
// Pure HTTP/API tests against the gateway (http://localhost:4000) using Playwright's
// built-in `request` fixture. No page.goto, no UI interaction of any kind.

import { test, expect } from '@playwright/test';
import { GATEWAY_URL, AUTH_HEADERS, createUser } from '../helpers';

test.describe('Data Validation Tests', () => {
  test('3.8 Transaction amount — required, type-checked, and boundary-tested at the API layer', async ({
    request,
  }) => {
    const { body: user } = await createUser(request, { accountType: 'basic' });

    // 1. POST /api/transactions with amount omitted entirely
    const missingAmountResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, type: 'deposit' },
    });
    expect(missingAmountResponse.status()).toBe(400);
    expect(await missingAmountResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'amount must be a positive number',
    });

    // 2. POST /api/transactions with amount=null
    const nullAmountResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, amount: null, type: 'deposit' } as any,
    });
    expect(nullAmountResponse.status()).toBe(400);
    expect(await nullAmountResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'amount must be a positive number',
    });

    // 3. POST /api/transactions with amount='100' (numeric string, not a JS number)
    const stringAmountResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, amount: '100', type: 'deposit' } as any,
    });
    expect(stringAmountResponse.status()).toBe(400);
    expect(await stringAmountResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'amount must be a positive number',
    });

    // 4. POST /api/transactions with amount=0 and amount=-50
    const zeroAmountResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, amount: 0, type: 'deposit' },
    });
    expect(zeroAmountResponse.status()).toBe(400);
    expect(await zeroAmountResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'amount must be a positive number',
    });

    const negativeAmountResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, amount: -50, type: 'deposit' },
    });
    expect(negativeAmountResponse.status()).toBe(400);
    expect(await negativeAmountResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'amount must be a positive number',
    });

    // 5. POST /api/transactions with amount that overflows to Infinity (e.g. 1e400 as a JSON number literal).
    // Sent as a raw JSON string body (rather than a JS object) because JSON.stringify would otherwise collapse
    // a JS-level Infinity value down to `null` before it ever reaches the wire.
    const overflowBody = `{"userId":"${user.id}","type":"deposit","amount":1e400}`;
    const overflowResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: overflowBody,
    });
    expect(overflowResponse.status()).toBe(400);
    expect(await overflowResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'amount must be a positive number',
    });

    // 6. POST /api/transactions with amount=5000 for a basic-account user, then amount=5000.01 for the same user
    const atLimitResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, amount: 5000, type: 'deposit' },
    });
    expect(atLimitResponse.status()).toBe(201);
    const atLimitBody = await atLimitResponse.json();
    expect(atLimitBody.amount).toBe(5000);

    const overLimitResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, amount: 5000.01, type: 'deposit' },
    });
    expect(overLimitResponse.status()).toBe(403);
    expect(await overLimitResponse.json()).toEqual({
      error: 'Forbidden',
      message: 'basic accounts are limited to $5000 per transaction; upgrade to premium for higher limits',
    });

    // 7. POST /api/transactions with a very large finite amount (e.g. 99999999999) for a premium-account user
    const { body: premiumUser } = await createUser(request, { accountType: 'premium' });
    const largeAmountResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: premiumUser.id, amount: 99999999999, type: 'deposit' },
    });
    expect(largeAmountResponse.status()).toBe(201);
    const largeAmountBody = await largeAmountResponse.json();
    expect(largeAmountBody.amount).toBe(99999999999);
  });

  test('3.9 Transaction userId — required, type-checked, and existence-checked', async ({ request }) => {
    // 1. POST /api/transactions with userId omitted, userId='' (empty string), and userId='   ' (whitespace only)
    const missingUserIdResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { amount: 100, type: 'deposit' },
    });
    expect(missingUserIdResponse.status()).toBe(400);
    expect(await missingUserIdResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'userId is required',
    });

    const emptyUserIdResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: '', amount: 100, type: 'deposit' },
    });
    expect(emptyUserIdResponse.status()).toBe(400);
    expect(await emptyUserIdResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'userId is required',
    });

    const whitespaceUserIdResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: '   ', amount: 100, type: 'deposit' },
    });
    expect(whitespaceUserIdResponse.status()).toBe(400);
    expect(await whitespaceUserIdResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'userId is required',
    });

    // 2. POST /api/transactions with userId=12345 (a JSON number instead of a string)
    const numericUserIdResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: 12345, amount: 100, type: 'deposit' } as any,
    });
    expect(numericUserIdResponse.status()).toBe(400);
    expect(await numericUserIdResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'userId is required',
    });
  });

  test('3.10 Transaction type allow-list enforcement', async ({ request }) => {
    const { body: user } = await createUser(request, { accountType: 'basic' });

    // 1. POST /api/transactions with type omitted, and separately with type='bogus'
    const missingTypeResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, amount: 50 },
    });
    expect(missingTypeResponse.status()).toBe(400);
    expect(await missingTypeResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'type must be one of: transfer, deposit, withdrawal',
    });

    const bogusTypeResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, amount: 50, type: 'bogus' },
    });
    expect(bogusTypeResponse.status()).toBe(400);
    expect(await bogusTypeResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'type must be one of: transfer, deposit, withdrawal',
    });
  });

  test('3.11 Transfer-specific recipientId validation', async ({ request }) => {
    const { body: user } = await createUser(request, { accountType: 'basic' });

    // 1. POST /api/transactions with type='transfer' and recipientId omitted
    const missingRecipientResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, amount: 50, type: 'transfer' },
    });
    expect(missingRecipientResponse.status()).toBe(400);
    expect(await missingRecipientResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'recipientId is required for transfers',
    });

    // 2. POST /api/transactions with type='transfer' and recipientId='   ' (whitespace only)
    const whitespaceRecipientResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, amount: 50, type: 'transfer', recipientId: '   ' },
    });
    expect(whitespaceRecipientResponse.status()).toBe(400);
    expect(await whitespaceRecipientResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'recipientId is required for transfers',
    });

    // 3. POST /api/transactions with type='deposit' (non-transfer) and recipientId omitted
    const depositResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, amount: 50, type: 'deposit' },
    });
    expect(depositResponse.status()).toBe(201);
  });

  test('3.12 Known business-logic gaps re-verified directly at the API: unchecked recipientId / self-transfer', async ({
    request,
  }) => {
    const { body: user } = await createUser(request, { accountType: 'basic' });

    // 1. POST /api/transactions with type='transfer', a valid userId, and recipientId='not-a-real-user-id' (never
    // registered)
    const unknownRecipientResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, amount: 50, type: 'transfer', recipientId: 'not-a-real-user-id' },
    });
    expect(unknownRecipientResponse.status()).toBe(201);
    const unknownRecipientBody = await unknownRecipientResponse.json();
    expect(unknownRecipientBody.recipientId).toBe('not-a-real-user-id');

    // 2. POST /api/transactions with type='transfer' and recipientId equal to the sender's own userId
    const selfTransferResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, amount: 50, type: 'transfer', recipientId: user.id },
    });
    expect(selfTransferResponse.status()).toBe(201);
    const selfTransferBody = await selfTransferResponse.json();
    expect(selfTransferBody.recipientId).toBe(user.id);
  });
});
