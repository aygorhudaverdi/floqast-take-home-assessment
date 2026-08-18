// spec: specs/api-test-plan.md
// Shared helpers for the pure HTTP/API test suites under tests/api/**.
// These suites hit the gateway directly (no browser, no page) via Playwright's
// built-in `request` fixture (APIRequestContext).

import { APIRequestContext, APIResponse } from '@playwright/test';
import { randomUUID } from 'crypto';

export const GATEWAY_URL = 'http://localhost:4000';

export const AUTH_HEADERS = {
  'x-api-key': 'dev-secret-key',
  'Content-Type': 'application/json',
};

export type AccountType = 'basic' | 'premium';

/**
 * Generates a unique email address so repeated test runs (and parallel workers)
 * never collide with the in-memory user-service store's uniqueness constraint.
 */
export function uniqueEmail(prefix: string, domain: string = 'example.com'): string {
  return `${prefix}.${randomUUID()}@${domain}`;
}

export interface CreateUserOverrides {
  name?: string;
  email?: string;
  accountType?: AccountType;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  accountType: AccountType;
}

export interface CreateUserResult {
  response: APIResponse;
  body: any;
  payload: CreateUserPayload;
}

/**
 * Registers a fresh user directly against the gateway (POST /api/users) with a
 * guaranteed-unique email (unless overridden), returning the raw response, the
 * parsed created-user body, and the payload that was sent (useful for asserting
 * the response echoes back what was submitted). Used as setup by every suite
 * under tests/api/** that needs a real, existing user to act against.
 */
export async function createUser(
  request: APIRequestContext,
  overrides: CreateUserOverrides = {}
): Promise<CreateUserResult> {
  const payload: CreateUserPayload = {
    name: overrides.name ?? `Test User ${randomUUID()}`,
    email: overrides.email ?? uniqueEmail('user'),
    accountType: overrides.accountType ?? 'basic',
  };
  const response = await request.post(`${GATEWAY_URL}/api/users`, {
    headers: AUTH_HEADERS,
    data: payload,
  });
  const body = await response.json();
  return { response, body, payload };
}
