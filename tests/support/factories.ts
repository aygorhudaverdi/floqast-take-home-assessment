import { randomUUID } from "crypto";
import type { AccountType } from "../../pages/RegisterPage";
import type { TransactionType } from "../../pages/TransactionPage";

export type { AccountType, TransactionType };

/**
 * Generates a unique id fragment so repeated test runs (and parallel workers)
 * never collide with the app's in-memory uniqueness constraints (e.g. email).
 */
export function uniqueId(): string {
  return randomUUID();
}

export function uniqueEmail(prefix: string, domain: string = "example.com"): string {
  return `${prefix}.${uniqueId()}@${domain}`;
}

export interface UserPayload {
  name: string;
  email: string;
  accountType: AccountType;
}

export interface UserPayloadOverrides {
  name?: string;
  email?: string;
  accountType?: AccountType;
}

/** Builds a valid user-creation payload — pure data, no network call. */
export function buildUserPayload(overrides: UserPayloadOverrides = {}): UserPayload {
  return {
    name: overrides.name ?? `Test User ${uniqueId()}`,
    email: overrides.email ?? uniqueEmail("user"),
    accountType: overrides.accountType ?? "basic",
  };
}

export interface TransactionPayload {
  userId: string;
  amount: number;
  type: TransactionType;
  recipientId?: string;
}

export interface TransactionPayloadOverrides {
  amount?: number;
  type?: TransactionType;
  recipientId?: string;
}

/** Builds a valid transaction-creation payload for a given user — pure data, no network call. */
export function buildTransactionPayload(
  userId: string,
  overrides: TransactionPayloadOverrides = {}
): TransactionPayload {
  return {
    userId,
    amount: overrides.amount ?? 100,
    type: overrides.type ?? "deposit",
    ...(overrides.recipientId ? { recipientId: overrides.recipientId } : {}),
  };
}

export interface NotificationPayload {
  userId: string;
  message: string;
  transactionId?: string;
}

export interface NotificationPayloadOverrides {
  message?: string;
  transactionId?: string;
}

/** Builds a valid notification-creation payload for a given user — pure data, no network call. */
export function buildNotificationPayload(
  userId: string,
  overrides: NotificationPayloadOverrides = {}
): NotificationPayload {
  return {
    userId,
    message: overrides.message ?? `Test notification ${uniqueId()}`,
    ...(overrides.transactionId ? { transactionId: overrides.transactionId } : {}),
  };
}
