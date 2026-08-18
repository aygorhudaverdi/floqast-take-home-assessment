// spec: specs/ui-test-plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '../fixtures';
import { GATEWAY_URL } from '../support/env';
import { uniqueEmail } from '../support/factories';

test.describe('Cross-Cutting: Authorization, Routing, and Error Handling', () => {
  test('Unauthorized direct access to a protected gateway API route', async ({ request }) => {
    // 1. Navigate the browser directly to a gateway API URL, e.g. http://localhost:4000/api/users/<some-id>, without going through the frontend app (no x-api-key header is sent on a plain navigation)
    const response = await request.get(`${GATEWAY_URL}/api/users/00000000-0000-0000-0000-000000000000`);

    // expect: Response is HTTP 401 Unauthorized
    expect(response.status()).toBe(401);

    // expect: Response body is JSON with error 'Unauthorized' and message 'missing or invalid x-api-key header'
    expect(await response.json()).toEqual({
      error: 'Unauthorized',
      message: 'missing or invalid x-api-key header',
    });
  });

  test('Unauthorized access repeated for the transactions and notifications gateway routes', async ({ request }) => {
    // 1. Directly navigate to http://localhost:4000/api/transactions/<id> and separately to http://localhost:4000/api/notifications
    const transactionsResponse = await request.get(
      `${GATEWAY_URL}/api/transactions/00000000-0000-0000-0000-000000000000`
    );
    const notificationsResponse = await request.get(`${GATEWAY_URL}/api/notifications`);

    // expect: Both return HTTP 401 Unauthorized with the same missing-key error body
    expect(transactionsResponse.status()).toBe(401);
    expect(await transactionsResponse.json()).toEqual({
      error: 'Unauthorized',
      message: 'missing or invalid x-api-key header',
    });

    expect(notificationsResponse.status()).toBe(401);
    expect(await notificationsResponse.json()).toEqual({
      error: 'Unauthorized',
      message: 'missing or invalid x-api-key header',
    });
  });

  test('Invalid/tampered API key is rejected the same as a missing key', async ({ page, registerPage }) => {
    // 1. Intercept/override the frontend's outgoing request (e.g. via route interception or by overriding the API_KEY constant in-page) to send an incorrect x-api-key value, then trigger a registration or transaction submission from the UI
    await page.route(`${GATEWAY_URL}/api/users`, async (route) => {
      const headers = { ...route.request().headers(), 'x-api-key': 'tampered-invalid-key' };
      await route.continue({ headers });
    });

    await registerPage.goto();
    await registerPage.fillName('Security Test User');
    await registerPage.fillEmail(uniqueEmail('tampered.key'));
    await registerPage.submit();

    // expect: Request is rejected with 401
    // expect: UI surfaces a generic failure message in the relevant error banner rather than crashing or hanging
    await expect(registerPage.messageBanner).toHaveText('missing or invalid x-api-key header');
    expect(await registerPage.getMessageKind()).toBe('error');
  });

  test('Unknown gateway route returns 404', async ({ request }) => {
    // 1. Navigate directly to an undefined gateway path, e.g. http://localhost:4000/api/does-not-exist or http://localhost:4000/totally-unknown
    const response = await request.get(`${GATEWAY_URL}/api/does-not-exist`);

    // expect: Response is HTTP 404 with JSON body {error: 'NotFound', message: 'no such gateway route'}
    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({
      error: 'NotFound',
      message: 'no such gateway route',
    });
  });

  test('Unknown frontend route returns 404', async ({ request }) => {
    // 1. Navigate to a nonexistent frontend path, e.g. http://localhost:3000/does-not-exist.html
    const response = await request.get('http://localhost:3000/does-not-exist.html');

    // expect: Frontend server responds with HTTP 404
    expect(response.status()).toBe(404);
  });
});
