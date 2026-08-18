// spec: specs/api-test-plan.md
// seed: tests/seed.spec.ts
// Pure HTTP/API tests against the gateway (http://localhost:4000) using Playwright's
// built-in `request` fixture. No page.goto, no UI interaction of any kind.

import { test, expect } from '@playwright/test';
import { GATEWAY_URL, AUTH_HEADERS, createUser } from '../helpers';

test.describe('1. CRUD Operations Testing', () => {
  test('1.5 Create and read a transaction, including cross-resource Read (list by user)', async ({ request }) => {
    // 2. Create a fresh user, then POST /api/transactions with that user's id, amount=100, type='deposit'
    const { body: user } = await createUser(request);
    const createResponse = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: { userId: user.id, amount: 100, type: 'deposit' },
    });
    expect(createResponse.status()).toBe(201);
    const createdTransaction = await createResponse.json();
    expect(createdTransaction).toMatchObject({
      userId: user.id,
      amount: 100,
      type: 'deposit',
      recipientId: null,
      status: 'completed',
    });
    expect(createdTransaction.id).toBeTruthy();
    expect(createdTransaction.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // 3. GET /api/transactions/:userId for that user
    const listResponse = await request.get(`${GATEWAY_URL}/api/transactions/${user.id}`, {
      headers: AUTH_HEADERS,
    });
    expect(listResponse.status()).toBe(200);
    const transactions = await listResponse.json();
    expect(transactions).toEqual([createdTransaction]);
  });

  test('1.6 List transactions for a user with multiple transactions of different types', async ({ request }) => {
    // 2. Create a user, then POST 5+ transactions of mixed types (deposit, withdrawal, transfer) and amounts
    const { body: user } = await createUser(request);
    const { body: recipient } = await createUser(request);
    const payloads: Array<{ userId: string; amount: number; type: string; recipientId?: string }> = [
      { userId: user.id, amount: 100, type: 'deposit' },
      { userId: user.id, amount: 50, type: 'withdrawal' },
      { userId: user.id, amount: 200, type: 'transfer', recipientId: recipient.id },
      { userId: user.id, amount: 75.5, type: 'deposit' },
      { userId: user.id, amount: 300, type: 'withdrawal' },
      { userId: user.id, amount: 20, type: 'transfer', recipientId: recipient.id },
    ];

    const createdIds = new Set<string>();
    for (const payload of payloads) {
      const response = await request.post(`${GATEWAY_URL}/api/transactions`, {
        headers: AUTH_HEADERS,
        data: payload,
      });
      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.id).toBeTruthy();
      createdIds.add(body.id);
    }
    expect(createdIds.size).toBe(payloads.length);

    // 3. GET /api/transactions/:userId
    const listResponse = await request.get(`${GATEWAY_URL}/api/transactions/${user.id}`, {
      headers: AUTH_HEADERS,
    });
    expect(listResponse.status()).toBe(200);
    const transactions = await listResponse.json();
    expect(transactions).toHaveLength(payloads.length);
    transactions.forEach((tx: any, index: number) => {
      expect(tx.type).toBe(payloads[index].type);
      expect(tx.amount).toBe(payloads[index].amount);
      expect(tx.recipientId).toBe(payloads[index].recipientId ?? null);
    });
  });

  test('1.7 Read transactions for a user with zero transactions returns an empty array, not an error', async ({ request }) => {
    // 2. Create a fresh user, immediately GET /api/transactions/:userId without creating any transaction
    const { body: user } = await createUser(request);
    const response = await request.get(`${GATEWAY_URL}/api/transactions/${user.id}`, {
      headers: AUTH_HEADERS,
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test('1.8 Read transactions for a nonexistent user returns 404, not an empty array', async ({ request }) => {
    // 2. GET /api/transactions/00000000-0000-0000-0000-000000000099 (never-created user id)
    const response = await request.get(
      `${GATEWAY_URL}/api/transactions/00000000-0000-0000-0000-000000000099`,
      { headers: AUTH_HEADERS }
    );
    await expect(response).toBeNotFoundError('user not found');
  });
});
