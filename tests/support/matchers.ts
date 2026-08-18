import { expect as baseExpect, type APIResponse } from "@playwright/test";

declare global {
  namespace PlaywrightTest {
    interface Matchers<R, T> {
      /** Asserts an API response's status, body.error, and (optionally) body.message all match. */
      toBeApiError(status: number, error: string, message?: string | RegExp): Promise<R>;
      /** Shorthand for the app's standard 400 ValidationError shape. */
      toBeValidationError(message?: string | RegExp): Promise<R>;
      /** Shorthand for the app's standard 401 Unauthorized shape (missing/invalid x-api-key). */
      toBeUnauthorized(): Promise<R>;
      /** Shorthand for the app's standard 404 NotFound shape. */
      toBeNotFoundError(message?: string | RegExp): Promise<R>;
      /** Shorthand for the app's standard 409 Conflict shape. */
      toBeConflictError(message?: string | RegExp): Promise<R>;
    }
  }
}

async function readJsonBody(response: APIResponse): Promise<any> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function messageMatches(actual: unknown, expected: string | RegExp): boolean {
  if (typeof expected === "string") return actual === expected;
  return typeof actual === "string" && expected.test(actual);
}

async function checkApiError(
  response: APIResponse,
  status: number,
  error: string,
  message: string | RegExp | undefined
) {
  const actualStatus = response.status();
  const body = await readJsonBody(response);
  const pass =
    actualStatus === status &&
    body?.error === error &&
    (message === undefined || messageMatches(body?.message, message));

  const expectedDescription = [
    `status ${status}`,
    `body.error === ${JSON.stringify(error)}`,
    message !== undefined ? `body.message ${typeof message === "string" ? "===" : "matching"} ${message}` : undefined,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    pass,
    message: () =>
      `expected response ${pass ? "not " : ""}to be an API error (${expectedDescription})\n` +
      `Received: status ${actualStatus}, body ${JSON.stringify(body)}`,
  };
}

export const expect = baseExpect.extend({
  async toBeApiError(response: APIResponse, status: number, error: string, message?: string | RegExp) {
    return checkApiError(response, status, error, message);
  },
  async toBeValidationError(response: APIResponse, message?: string | RegExp) {
    return checkApiError(response, 400, "ValidationError", message);
  },
  async toBeUnauthorized(response: APIResponse) {
    return checkApiError(response, 401, "Unauthorized", "missing or invalid x-api-key header");
  },
  async toBeNotFoundError(response: APIResponse, message?: string | RegExp) {
    return checkApiError(response, 404, "NotFound", message);
  },
  async toBeConflictError(response: APIResponse, message?: string | RegExp) {
    return checkApiError(response, 409, "Conflict", message);
  },
});
