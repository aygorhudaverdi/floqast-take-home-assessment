// spec: specs/api-test-plan.md
// seed: tests/seed.spec.ts
// Pure HTTP/API tests against the gateway (http://localhost:4000) using Playwright's
// built-in `request` fixture. No page.goto, no UI interaction of any kind.

import { test, expect } from '@playwright/test';
import { GATEWAY_URL, AUTH_HEADERS, uniqueEmail } from '../helpers';

test.describe('Data Validation Tests', () => {
  test('3.1 User creation — required field checks (name, email, accountType) each fail independently', async ({
    request,
  }) => {
    // 1. POST /api/users omitting name entirely (valid email/accountType present)
    const missingNameResponse = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: AUTH_HEADERS,
      data: { email: uniqueEmail('missing-name'), accountType: 'basic' },
    });
    expect(missingNameResponse.status()).toBe(400);
    expect(await missingNameResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'name is required',
    });

    // 2. POST /api/users with name present but email omitted
    const missingEmailResponse = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: AUTH_HEADERS,
      data: { name: 'Missing Email User', accountType: 'basic' },
    });
    expect(missingEmailResponse.status()).toBe(400);
    expect(await missingEmailResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'a valid email is required',
    });

    // 3. POST /api/users with name/email present but accountType omitted
    const missingAccountTypeResponse = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: AUTH_HEADERS,
      data: { name: 'Missing AccountType User', email: uniqueEmail('missing-accounttype') },
    });
    expect(missingAccountTypeResponse.status()).toBe(400);
    expect(await missingAccountTypeResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'accountType must be one of: basic, premium',
    });
  });

  test('3.2 Whitespace-only name is rejected server-side (reuses UI-verified rule, confirmed independently at the API)', async ({
    request,
  }) => {
    // 1. POST /api/users with name='   ' (spaces only) and a valid unique email/accountType
    const response = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: AUTH_HEADERS,
      data: { name: '   ', email: uniqueEmail('whitespace-name'), accountType: 'basic' },
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({
      error: 'ValidationError',
      message: 'name is required',
    });
  });

  test('3.3 Email regex edge cases reachable only at the API layer', async ({ request }) => {
    // 1. POST /api/users with email values: 'test@test' (no TLD), 'plainstring' (no @), '@nodomain.com' (empty
    // local part), 'user@' (empty domain), 'user@@double.com' (double @)
    const invalidEmails = ['test@test', 'plainstring', '@nodomain.com', 'user@', 'user@@double.com'];
    for (const email of invalidEmails) {
      const response = await request.post(`${GATEWAY_URL}/api/users`, {
        headers: AUTH_HEADERS,
        data: { name: 'Email Regex User', email, accountType: 'basic' },
      });
      expect(response.status(), `email "${email}" should be rejected`).toBe(400);
      expect(await response.json()).toEqual({
        error: 'ValidationError',
        message: 'a valid email is required',
      });
    }

    // 2. POST /api/users with a syntactically valid but unusual email: 'user+tag@sub.example.co.uk'
    const validUnusualResponse = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: AUTH_HEADERS,
      data: {
        name: 'Plus Addressing User',
        email: uniqueEmail('user+tag', 'sub.example.co.uk'),
        accountType: 'basic',
      },
    });
    expect(validUnusualResponse.status()).toBe(201);
  });

  test('3.4 accountType allow-list is enforced independently of the UI dropdown', async ({ request }) => {
    // 1. POST /api/users with accountType='gold' (valid name/email)
    const goldResponse = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: AUTH_HEADERS,
      data: { name: 'Gold Account User', email: uniqueEmail('gold-account'), accountType: 'gold' },
    });
    expect(goldResponse.status()).toBe(400);
    expect(await goldResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'accountType must be one of: basic, premium',
    });

    // 2. POST /api/users with accountType='' (empty string) and accountType=null
    const emptyStringResponse = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: AUTH_HEADERS,
      data: { name: 'Empty AccountType User', email: uniqueEmail('empty-accounttype'), accountType: '' },
    });
    expect(emptyStringResponse.status()).toBe(400);
    expect(await emptyStringResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'accountType must be one of: basic, premium',
    });

    const nullResponse = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: AUTH_HEADERS,
      data: { name: 'Null AccountType User', email: uniqueEmail('null-accounttype'), accountType: null } as any,
    });
    expect(nullResponse.status()).toBe(400);
    expect(await nullResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'accountType must be one of: basic, premium',
    });
  });

  test('3.5 Duplicate email is rejected with 409, case-insensitively', async ({ request }) => {
    // 1. POST /api/users with a unique email, then POST again with the exact same email
    const email = uniqueEmail('dup-email');
    const firstResponse = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: AUTH_HEADERS,
      data: { name: 'Duplicate Email User', email, accountType: 'basic' },
    });
    expect(firstResponse.status()).toBe(201);

    const secondResponse = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: AUTH_HEADERS,
      data: { name: 'Duplicate Email User Again', email, accountType: 'basic' },
    });
    expect(secondResponse.status()).toBe(409);
    expect(await secondResponse.json()).toEqual({
      error: 'Conflict',
      message: 'email already registered',
    });

    // 2. POST /api/users with the same email as an existing user but different casing (e.g. 'DUP@EXAMPLE.COM' vs
    // 'dup@example.com')
    const casedEmail = email.toUpperCase();
    const casedResponse = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: AUTH_HEADERS,
      data: { name: 'Cased Duplicate Email User', email: casedEmail, accountType: 'basic' },
    });
    expect(casedResponse.status()).toBe(409);
    expect(await casedResponse.json()).toEqual({
      error: 'Conflict',
      message: 'email already registered',
    });
  });

  test('3.6 Wrong JS type for string fields is rejected, not coerced', async ({ request }) => {
    // 1. POST /api/users with name=12345 (number) and a valid email/accountType
    const numericNameResponse = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: AUTH_HEADERS,
      data: { name: 12345, email: uniqueEmail('numeric-name'), accountType: 'basic' } as any,
    });
    expect(numericNameResponse.status()).toBe(400);
    expect(await numericNameResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'name is required',
    });

    // 2. POST /api/users with email=true (boolean) and a valid name/accountType
    const booleanEmailResponse = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: AUTH_HEADERS,
      data: { name: 'Boolean Email User', email: true, accountType: 'basic' } as any,
    });
    expect(booleanEmailResponse.status()).toBe(400);
    expect(await booleanEmailResponse.json()).toEqual({
      error: 'ValidationError',
      message: 'a valid email is required',
    });
  });

  test('3.7 Extra/unexpected fields in the payload are silently ignored, not rejected', async ({ request }) => {
    // 1. POST /api/users with a valid payload plus an extra field, e.g. isAdmin:true
    const response = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: AUTH_HEADERS,
      data: {
        name: 'Extra Field User',
        email: uniqueEmail('extra-field'),
        accountType: 'basic',
        isAdmin: true,
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(['accountType', 'createdAt', 'email', 'id', 'name']);
    expect(body).not.toHaveProperty('isAdmin');
  });
});
