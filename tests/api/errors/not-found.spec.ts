// spec: specs/api-test-plan.md
// seed: tests/seed.spec.ts

import { randomUUID } from 'node:crypto';
import { test, expect } from '../../fixtures';

const GATEWAY_URL = 'http://localhost:4000';
const API_KEY = 'dev-secret-key';

test.describe('2. Error Scenario Handling', () => {
  test('2.7 Nonexistent resource id on every Read route returns its resource-specific 404, never a 500', async ({
    request,
  }) => {
    const neverCreatedUserId = randomUUID();

    // 2. GET /api/users/:id with a never-created id
    const userResponse = await request.get(`${GATEWAY_URL}/api/users/${neverCreatedUserId}`, {
      headers: { 'x-api-key': API_KEY },
    });

    // expect: Returns 404 with the resource-appropriate {error:'NotFound', message:'user not found'} body
    expect(userResponse.status()).toBe(404);
    expect(await userResponse.json()).toEqual({ error: 'NotFound', message: 'user not found' });

    // 2 (cont'd). GET /api/transactions/:userId with a never-created id
    const transactionsResponse = await request.get(`${GATEWAY_URL}/api/transactions/${neverCreatedUserId}`, {
      headers: { 'x-api-key': API_KEY },
    });

    // expect: Returns 404 with the resource-appropriate {error:'NotFound', message:'user not found'} body
    expect(transactionsResponse.status()).toBe(404);
    expect(await transactionsResponse.json()).toEqual({ error: 'NotFound', message: 'user not found' });

    // 3. GET /api/notifications/:userId with a never-created id
    const notificationsResponse = await request.get(`${GATEWAY_URL}/api/notifications/${neverCreatedUserId}`, {
      headers: { 'x-api-key': API_KEY },
    });

    // expect: Returns 200 [] rather than 404 — cross-reference with 1.12; pinned down explicitly here too
    // so the 'error scenario' suite independently confirms this asymmetry
    expect(notificationsResponse.status()).toBe(200);
    expect(await notificationsResponse.json()).toEqual([]);
  });

  test("2.8 Unknown gateway path returns the gateway's own JSON 404 catch-all (distinct from downstream 404s)", async ({
    request,
  }) => {
    // 2. GET /api/does-not-exist, with valid auth
    const unknownApiPath = await request.get(`${GATEWAY_URL}/api/does-not-exist`, {
      headers: { 'x-api-key': API_KEY },
    });

    // expect: Returns 404 with JSON body exactly {error:'NotFound', message:'no such gateway route'} —
    // content-type application/json, distinct from the HTML bodies seen elsewhere in this suite
    expect(unknownApiPath.status()).toBe(404);
    expect(unknownApiPath.headers()['content-type']).toContain('application/json');
    expect(await unknownApiPath.json()).toEqual({ error: 'NotFound', message: 'no such gateway route' });

    // 2 (cont'd). GET /totally-unknown, with valid auth
    const totallyUnknownPath = await request.get(`${GATEWAY_URL}/totally-unknown`, {
      headers: { 'x-api-key': API_KEY },
    });

    // expect: Returns 404 with the same JSON body/content-type
    expect(totallyUnknownPath.status()).toBe(404);
    expect(totallyUnknownPath.headers()['content-type']).toContain('application/json');
    expect(await totallyUnknownPath.json()).toEqual({ error: 'NotFound', message: 'no such gateway route' });
  });
});
