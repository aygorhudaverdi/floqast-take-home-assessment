// spec: specs/api-test-plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '../../fixtures';
import type { APIRequestContext } from '@playwright/test';

const GATEWAY_URL = 'http://localhost:4000';
const VALID_API_KEY = 'dev-secret-key';
const UNAUTHORIZED_BODY = { error: 'Unauthorized', message: 'missing or invalid x-api-key header' };

type RouteCall = { method: 'GET' | 'POST'; path: string; data?: Record<string, unknown> };

// Registers a fresh user via POST /api/users with valid auth, so tests that need a real
// (not made-up) user id for a GET-by-id call have one to work with.
async function registerUser(request: APIRequestContext) {
  const response = await request.post(`${GATEWAY_URL}/api/users`, {
    headers: { 'x-api-key': VALID_API_KEY },
    data: {
      name: 'Auth Test User',
      email: `auth.test.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`,
      accountType: 'basic',
    },
  });
  return response.json();
}

// One representative GET-by-id/list and one representative POST call per resource group
// (users, transactions, notifications), so the same six route+method combinations can be
// swept both without a key (4.1) and with a valid key (4.5) instead of repeating six
// near-identical blocks in each test.
function crudRouteCalls(userId: string): RouteCall[] {
  return [
    { method: 'GET', path: `/api/users/${userId}` },
    {
      method: 'POST',
      path: '/api/users',
      data: {
        name: `Route Sweep User ${Date.now()}`,
        email: `route.sweep.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`,
        accountType: 'basic',
      },
    },
    { method: 'GET', path: `/api/transactions/${userId}` },
    { method: 'POST', path: '/api/transactions', data: { userId, amount: 50, type: 'deposit' } },
    { method: 'GET', path: `/api/notifications/${userId}` },
    { method: 'POST', path: '/api/notifications', data: { userId, message: 'route sweep notification' } },
  ];
}

async function callRoute(request: APIRequestContext, call: RouteCall, headers?: Record<string, string>) {
  const url = `${GATEWAY_URL}${call.path}`;
  if (call.method === 'GET') {
    return request.get(url, { headers });
  }
  return request.post(url, { headers, data: call.data });
}

test.describe('Authentication / Authorization Tests', () => {
  test('Missing x-api-key header is rejected on every CRUD route, individually, across all three resources', async ({
    request,
  }) => {
    // 1. Register a fresh user so the GET-by-id/list routes below have a real id to target
    const user = await registerUser(request);

    // 2. Without any x-api-key header, call: GET /api/users/:id, POST /api/users, GET /api/transactions/:userId,
    //    POST /api/transactions, GET /api/notifications/:userId, POST /api/notifications
    for (const call of crudRouteCalls(user.id)) {
      const response = await callRoute(request, call);

      // expect: Every single call returns 401 with body {error:'Unauthorized', message:'missing or invalid x-api-key header'}
      expect(response.status(), `${call.method} ${call.path}`).toBe(401);
      expect(await response.json(), `${call.method} ${call.path}`).toEqual(UNAUTHORIZED_BODY);
    }
  });

  test('Invalid (wrong-value) x-api-key is rejected identically to a missing key', async ({ request }) => {
    const user = await registerUser(request);

    // 1. Call GET /api/users/:id with x-api-key: 'wrong-key'
    const wrongKeyResponse = await request.get(`${GATEWAY_URL}/api/users/${user.id}`, {
      headers: { 'x-api-key': 'wrong-key' },
    });

    // expect: 401, identical error body to the missing-key case
    expect(wrongKeyResponse.status()).toBe(401);
    expect(await wrongKeyResponse.json()).toEqual(UNAUTHORIZED_BODY);

    // 2. Call the same route with x-api-key: '' (present but empty string)
    const emptyKeyResponse = await request.get(`${GATEWAY_URL}/api/users/${user.id}`, {
      headers: { 'x-api-key': '' },
    });

    // expect: 401, same error body
    expect(emptyKeyResponse.status()).toBe(401);
    expect(await emptyKeyResponse.json()).toEqual(UNAUTHORIZED_BODY);
  });

  test('Case sensitivity of the API key VALUE is enforced (uppercase variant rejected)', async ({ request }) => {
    const user = await registerUser(request);

    // 1. Call GET /api/users/:id with x-api-key: 'DEV-SECRET-KEY' (uppercase variant of the real key)
    const response = await request.get(`${GATEWAY_URL}/api/users/${user.id}`, {
      headers: { 'x-api-key': 'DEV-SECRET-KEY' },
    });

    // expect: 401 Unauthorized - confirms no case-insensitive comparison is happening on the key value
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual(UNAUTHORIZED_BODY);
  });

  test('Case-insensitivity of the HEADER NAME itself (HTTP spec compliance, not a security hole)', async ({
    request,
  }) => {
    // 1. Call GET /api/users/:id with header name 'X-API-KEY' (all caps) and the correct value 'dev-secret-key'
    const madeUpId = '00000000-0000-0000-0000-000000000000';
    const response = await request.get(`${GATEWAY_URL}/api/users/${madeUpId}`, {
      headers: { 'X-API-KEY': VALID_API_KEY },
    });

    // expect: Request passes auth (not a 401) - proceeds to normal 404 'user not found' for a made-up id,
    // confirming the auth check itself succeeded
    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: 'NotFound', message: 'user not found' });
  });

  test('Valid API key succeeds identically across all three resource route groups (positive control)', async ({
    request,
  }) => {
    const user = await registerUser(request);

    // 1. With a correct x-api-key header, call one representative GET and one representative POST route
    //    on each of /api/users, /api/transactions, /api/notifications
    for (const call of crudRouteCalls(user.id)) {
      const response = await callRoute(request, call, { 'x-api-key': VALID_API_KEY });

      // expect: All six calls pass the auth layer (none return 401); each proceeds to its normal
      // success or validation-driven response
      expect(response.status(), `${call.method} ${call.path}`).not.toBe(401);
    }
  });

  test('Auth is checked before body/route validation (order-of-operations check)', async ({ request }) => {
    // 1. POST /api/users with no x-api-key header and a completely empty/invalid body
    const invalidBodyResponse = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: { 'Content-Type': 'application/json' },
      data: '',
    });

    // expect: 401 Unauthorized (auth error), NOT a 400 validation error
    expect(invalidBodyResponse.status()).toBe(401);
    expect(await invalidBodyResponse.json()).toEqual(UNAUTHORIZED_BODY);

    // 2. POST /api/users with no x-api-key header and a fully valid, well-formed user payload
    const validPayloadResponse = await request.post(`${GATEWAY_URL}/api/users`, {
      data: {
        name: 'Bypass Attempt User',
        email: `bypass.attempt.${Date.now()}@example.com`,
        accountType: 'basic',
      },
    });

    // expect: Still 401 Unauthorized, and no user is actually created - confirms a valid payload
    // alone can never bypass auth
    expect(validPayloadResponse.status()).toBe(401);
    expect(await validPayloadResponse.json()).toEqual(UNAUTHORIZED_BODY);
  });

  test('Unauthenticated requests never reach downstream services or leak downstream data', async ({ request }) => {
    const user = await registerUser(request);

    // 1. GET /api/users/:id for a real, previously-created user's id, but without a valid x-api-key header
    const response = await request.get(`${GATEWAY_URL}/api/users/${user.id}`);
    const rawBody = await response.text();

    // expect: 401 with the generic {error:'Unauthorized', message:'missing or invalid x-api-key header'} body -
    // the real user's data (name/email/etc.) is never present anywhere in the response
    expect(response.status()).toBe(401);
    expect(JSON.parse(rawBody)).toEqual(UNAUTHORIZED_BODY);
    expect(rawBody).not.toContain(user.name);
    expect(rawBody).not.toContain(user.email);
  });
});
