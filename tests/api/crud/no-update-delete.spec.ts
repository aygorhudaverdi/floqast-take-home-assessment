// spec: specs/api-test-plan.md
// seed: tests/seed.spec.ts
// Pure HTTP/API tests against the gateway (http://localhost:4000) using Playwright's
// built-in `request` fixture. No page.goto, no UI interaction of any kind.

import { test, expect, APIResponse } from '@playwright/test';
import { GATEWAY_URL, AUTH_HEADERS, createUser } from '../helpers';

test.describe('1. CRUD Operations Testing', () => {
  test('1.13 No Update route exists for any resource — PUT/PATCH return 404, not a silent update', async ({ request }) => {
    // 2. Create a user, then PUT /api/users/:id with a modified name and valid auth header
    const { body: user } = await createUser(request);
    const putResponse = await request.put(`${GATEWAY_URL}/api/users/${user.id}`, {
      headers: AUTH_HEADERS,
      data: { name: 'Modified Name' },
    });
    expect(putResponse.status()).toBe(404);
    expect(putResponse.headers()['content-type']).toContain('text/html');
    const putBody = await putResponse.text();
    expect(putBody).toContain(`Cannot PUT /users/${user.id}`);

    // 3. Repeat with PATCH /api/users (collection-level, no id) with an arbitrary body
    const patchResponse = await request.patch(`${GATEWAY_URL}/api/users`, {
      headers: AUTH_HEADERS,
      data: { anything: true },
    });
    expect(patchResponse.status()).toBe(404);
    const patchBody = await patchResponse.text();
    expect(patchBody).toContain('Cannot PATCH /users');

    // 4. GET /api/users/:id for the same user afterward
    const getResponse = await request.get(`${GATEWAY_URL}/api/users/${user.id}`, {
      headers: AUTH_HEADERS,
    });
    expect(getResponse.status()).toBe(200);
    expect(await getResponse.json()).toEqual(user);
  });

  test('1.14 No Delete route exists for any resource — DELETE returns 404, record is still readable afterward', async ({ request }) => {
    // 2. Create a user, then DELETE /api/users/:id with valid auth
    const { body: user } = await createUser(request);
    const deleteResponse = await request.delete(`${GATEWAY_URL}/api/users/${user.id}`, {
      headers: AUTH_HEADERS,
    });
    expect(deleteResponse.status()).toBe(404);
    const deleteBody = await deleteResponse.text();
    expect(deleteBody).toContain(`Cannot DELETE /users/${user.id}`);

    // 3. GET /api/users/:id for the same user afterward
    const getResponse = await request.get(`${GATEWAY_URL}/api/users/${user.id}`, {
      headers: AUTH_HEADERS,
    });
    expect(getResponse.status()).toBe(200);
    expect(await getResponse.json()).toEqual(user);
  });

  test('1.15 PUT/PATCH/DELETE against /api/transactions and /api/notifications routes also 404 cleanly', async ({ request }) => {
    // 2. Issue PUT, PATCH, and DELETE requests against /api/transactions, /api/transactions/:userId,
    // /api/notifications, and /api/notifications/:userId, each with valid auth
    const { body: user } = await createUser(request);

    const routes = [
      { path: '/api/transactions', downstreamPath: '/transactions' },
      { path: `/api/transactions/${user.id}`, downstreamPath: `/transactions/${user.id}` },
      { path: '/api/notifications', downstreamPath: '/notifications' },
      { path: `/api/notifications/${user.id}`, downstreamPath: `/notifications/${user.id}` },
    ];

    const methods: Array<{ verb: string; call: (url: string) => Promise<APIResponse> }> = [
      { verb: 'PUT', call: (url) => request.put(url, { headers: AUTH_HEADERS, data: {} }) },
      { verb: 'PATCH', call: (url) => request.patch(url, { headers: AUTH_HEADERS, data: {} }) },
      { verb: 'DELETE', call: (url) => request.delete(url, { headers: AUTH_HEADERS }) },
    ];

    for (const route of routes) {
      for (const method of methods) {
        const response = await method.call(`${GATEWAY_URL}${route.path}`);
        expect(response.status(), `${method.verb} ${route.path}`).toBe(404);
        expect(response.headers()['content-type']).toContain('text/html');
        const body = await response.text();
        expect(body).toContain(`Cannot ${method.verb} ${route.downstreamPath}`);
      }
    }
  });
});
