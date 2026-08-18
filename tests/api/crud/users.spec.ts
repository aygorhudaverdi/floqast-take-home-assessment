// spec: specs/api-test-plan.md
// seed: tests/seed.spec.ts
// Pure HTTP/API tests against the gateway (http://localhost:4000) using Playwright's
// built-in `request` fixture. No page.goto, no UI interaction of any kind.

import { test, expect } from '@playwright/test';
import { GATEWAY_URL, AUTH_HEADERS, createUser } from '../helpers';

test.describe('1. CRUD Operations Testing', () => {
  test('1.1 Create and read a user (happy path)', async ({ request }) => {
    // 2. POST /api/users with a valid unique name, email, and accountType='basic', with a valid x-api-key header
    const { response: createResponse, body: createdUser, payload } = await createUser(request, {
      accountType: 'basic',
    });
    expect(createResponse.status()).toBe(201);
    expect(createdUser).toMatchObject({
      name: payload.name,
      email: payload.email,
      accountType: 'basic',
    });
    expect(createdUser.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(createdUser.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // 3. GET /api/users/:id using the id returned above
    const getResponse = await request.get(`${GATEWAY_URL}/api/users/${createdUser.id}`, {
      headers: AUTH_HEADERS,
    });
    expect(getResponse.status()).toBe(200);
    const fetchedUser = await getResponse.json();
    expect(fetchedUser).toEqual(createdUser);
  });

  test('1.2 Create a premium user and confirm accountType persists', async ({ request }) => {
    // 2. POST /api/users with accountType='premium' and a unique name/email
    const { response: createResponse, body: createdUser } = await createUser(request, {
      accountType: 'premium',
    });
    expect(createResponse.status()).toBe(201);
    expect(createdUser.accountType).toBe('premium');

    // 3. GET /api/users/:id for that user
    const getResponse = await request.get(`${GATEWAY_URL}/api/users/${createdUser.id}`, {
      headers: AUTH_HEADERS,
    });
    expect(getResponse.status()).toBe(200);
    const fetchedUser = await getResponse.json();
    expect(fetchedUser.accountType).toBe('premium');
  });

  test('1.3 Read a nonexistent user returns a clean 404', async ({ request }) => {
    // 2. GET /api/users/00000000-0000-0000-0000-000000000000 (syntactically valid UUID, never created)
    const response = await request.get(
      `${GATEWAY_URL}/api/users/00000000-0000-0000-0000-000000000000`,
      { headers: AUTH_HEADERS }
    );
    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: 'NotFound', message: 'user not found' });
  });

  test('1.4 Read a user with a non-UUID-shaped id string', async ({ request }) => {
    // 2. GET /api/users/not-a-real-id-123
    const response = await request.get(`${GATEWAY_URL}/api/users/not-a-real-id-123`, {
      headers: AUTH_HEADERS,
    });
    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: 'NotFound', message: 'user not found' });
  });
});
