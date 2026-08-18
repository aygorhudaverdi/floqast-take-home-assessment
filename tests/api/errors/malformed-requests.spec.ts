// spec: specs/api-test-plan.md
// seed: tests/seed.spec.ts

import { test, expect } from '../../fixtures';

const GATEWAY_URL = 'http://localhost:4000';
const API_KEY = 'dev-secret-key';

test.describe('2. Error Scenario Handling', () => {
  test('2.1 Malformed JSON body returns 400 with an HTML stack-trace body (documented info-disclosure smell)', async ({
    request,
  }) => {
    // 2. POST /api/users with Content-Type: application/json and a syntactically invalid JSON body (e.g. '{ name: "bad json", email: ')
    const response = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      data: '{ name: "bad json", email: ',
    });

    // expect: Response status is 400
    expect(response.status()).toBe(400);

    // expect: Response Content-Type is text/html (not application/json)
    expect(response.headers()['content-type']).toContain('text/html');

    // expect: Body contains a raw SyntaxError stack trace — assert its presence to pin down current behavior
    const body = await response.text();
    expect(body).toContain('SyntaxError');
  });

  test('2.2 Empty string body with JSON content-type hits the same malformed-JSON path as 2.1', async ({
    request,
  }) => {
    // 2. POST /api/users with Content-Type: application/json and body = '' (zero-length)
    const response = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      data: '',
    });

    // expect: Response status 400 with the same HTML SyntaxError body as 2.1 (verified live)
    expect(response.status()).toBe(400);
    expect(response.headers()['content-type']).toContain('text/html');
    const body = await response.text();
    expect(body).toContain('SyntaxError');
  });

  test('2.3 Wrong Content-Type header (e.g. text/plain) silently skips body parsing — clean validation error, not a parse error', async ({
    request,
  }) => {
    // 2. POST /api/users with Content-Type: text/plain and a valid JSON-stringified user payload as the raw body
    const validPayload = JSON.stringify({
      name: 'Text Plain User',
      email: `text-plain-${Date.now()}@example.com`,
      accountType: 'basic',
    });
    const response = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'text/plain',
      },
      data: validPayload,
    });

    // expect: Response status 400 with clean JSON body {error:'ValidationError', message:'name is required'}
    // (NOT a parser error, and NOT treated as if name/email were actually present)
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: 'ValidationError', message: 'name is required' });

    // 3. Repeat with no Content-Type header at all
    const responseNoContentType = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: {
        'x-api-key': API_KEY,
      },
      data: validPayload,
    });

    // expect: Same clean 'name is required' 400 JSON response (verified live)
    expect(responseNoContentType.status()).toBe(400);
    expect(await responseNoContentType.json()).toEqual({
      error: 'ValidationError',
      message: 'name is required',
    });
  });

  test('2.4 JSON array as the request body is valid JSON but destructures to nothing useful', async ({
    request,
  }) => {
    // 2. POST /api/users with Content-Type: application/json and body = JSON.stringify(['name','email'])
    const response = await request.post(`${GATEWAY_URL}/api/users`, {
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify(['name', 'email']),
    });

    // expect: Response status 400 with clean JSON {error:'ValidationError', message:'name is required'} (verified live, no 500)
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: 'ValidationError', message: 'name is required' });
  });
});
