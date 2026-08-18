// spec: specs/api-test-plan.md
// seed: tests/seed.spec.ts

import { test, expect, GATEWAY_URL, AUTH_HEADERS } from '../helpers';

test.describe('2. Error Scenario Handling', () => {
  test('2.5 Wrong HTTP method on a collection route returns a downstream 404, not a 405', async ({
    request,
  }) => {
    // 2. Issue GET /api/users (collection root, no id — no route registered for this) with valid auth
    const getUsersCollection = await request.get(`${GATEWAY_URL}/api/users`, {
      headers: AUTH_HEADERS,
    });

    // expect: Returns 404 with an HTML 'Cannot GET /users' body (verified live)
    expect(getUsersCollection.status()).toBe(404);
    expect(getUsersCollection.headers()['content-type']).toContain('text/html');
    expect(await getUsersCollection.text()).toContain('Cannot GET /users');

    // 2 (cont'd). DELETE /api/transactions (no route registered) with valid auth
    const deleteTransactionsCollection = await request.delete(`${GATEWAY_URL}/api/transactions`, {
      headers: AUTH_HEADERS,
    });

    // expect: Returns 404 with an HTML 'Cannot DELETE <path>' body
    expect(deleteTransactionsCollection.status()).toBe(404);
    expect(deleteTransactionsCollection.headers()['content-type']).toContain('text/html');
    expect(await deleteTransactionsCollection.text()).toContain('Cannot DELETE');
  });

  test('2.6 GET /api/users/ (trailing slash, empty id segment) 404s cleanly', async ({ request }) => {
    // 2. GET /api/users/ with valid auth
    const response = await request.get(`${GATEWAY_URL}/api/users/`, {
      headers: AUTH_HEADERS,
    });

    // expect: Response status 404 with HTML body 'Cannot GET /users/' (verified live)
    expect(response.status()).toBe(404);
    expect(response.headers()['content-type']).toContain('text/html');
    expect(await response.text()).toContain('Cannot GET /users/');
  });
});
