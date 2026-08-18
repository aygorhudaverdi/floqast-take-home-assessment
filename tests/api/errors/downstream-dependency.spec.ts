// spec: specs/api-test-plan.md
// seed: tests/seed.spec.ts
//
// SCOPE NOTE: items 2.10 (downstream user-service outage -> 502) and 2.11 (notification-service
// outage doesn't fail the originating transaction) are deliberately descoped from this suite.
// Both require killing/restarting actual service processes (or repointing service URLs at an
// unreachable port) mid-test, which is out of scope for a pure HTTP/API test file — see
// specs/api-test-plan.md items 2.10/2.11 for the documented reasoning.

import { randomUUID } from 'node:crypto';
import { test, expect, GATEWAY_URL, AUTH_HEADERS } from '../helpers';

test.describe('2. Error Scenario Handling', () => {
  test('2.9 Transaction creation for a nonexistent userId returns a clean 404 before any limit/type checks matter', async ({
    request,
  }) => {
    const neverRegisteredUserId = randomUUID();

    // 2. POST /api/transactions with a syntactically valid but never-registered userId, a valid amount, and type='deposit'
    const response = await request.post(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
      data: {
        userId: neverRegisteredUserId,
        amount: 100,
        type: 'deposit',
      },
    });

    // expect: Response status 404 with body {error:'NotFound', message:'user not found'} (verified live) —
    // no transaction is recorded (the response body carries no transaction id/fields at all)
    await expect(response).toBeNotFoundError('user not found');
    expect(await response.json()).not.toHaveProperty('id');
  });
});
