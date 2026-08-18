// Shared helpers for the pure HTTP/API test suites under tests/api/**.
// These suites hit the gateway directly (no browser, no page) via Playwright's
// built-in `request` fixture (APIRequestContext). Every API spec file should
// import `test`/`expect` from here (rather than '@playwright/test' directly)
// so the custom matchers in tests/support/matchers.ts are always registered.

import { test } from "@playwright/test";
import type { APIRequestContext, APIResponse } from "@playwright/test";
import { GATEWAY_URL, API_KEY } from "../support/env";
import {
  uniqueEmail,
  buildUserPayload,
  buildTransactionPayload,
  buildNotificationPayload,
  type AccountType,
  type UserPayload,
  type UserPayloadOverrides,
  type TransactionPayload,
  type TransactionPayloadOverrides,
  type NotificationPayload,
  type NotificationPayloadOverrides,
} from "../support/factories";

export { expect } from "../support/matchers";
export { test };
export { GATEWAY_URL, uniqueEmail };
export type { AccountType };

export const AUTH_HEADERS = {
  "x-api-key": API_KEY,
  "Content-Type": "application/json",
};

export interface ApiResult<TPayload> {
  response: APIResponse;
  body: any;
  payload: TPayload;
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
  overrides: UserPayloadOverrides = {}
): Promise<ApiResult<UserPayload>> {
  const payload = buildUserPayload(overrides);
  const response = await request.post(`${GATEWAY_URL}/api/users`, {
    headers: AUTH_HEADERS,
    data: payload,
  });
  const body = await response.json().catch(() => undefined);
  return { response, body, payload };
}

/** Creates a transaction for an existing user via POST /api/transactions. */
export async function createTransaction(
  request: APIRequestContext,
  userId: string,
  overrides: TransactionPayloadOverrides = {}
): Promise<ApiResult<TransactionPayload>> {
  const payload = buildTransactionPayload(userId, overrides);
  const response = await request.post(`${GATEWAY_URL}/api/transactions`, {
    headers: AUTH_HEADERS,
    data: payload,
  });
  const body = await response.json().catch(() => undefined);
  return { response, body, payload };
}

/** Creates a notification for an existing user via POST /api/notifications. */
export async function createNotification(
  request: APIRequestContext,
  userId: string,
  overrides: NotificationPayloadOverrides = {}
): Promise<ApiResult<NotificationPayload>> {
  const payload = buildNotificationPayload(userId, overrides);
  const response = await request.post(`${GATEWAY_URL}/api/notifications`, {
    headers: AUTH_HEADERS,
    data: payload,
  });
  const body = await response.json().catch(() => undefined);
  return { response, body, payload };
}
