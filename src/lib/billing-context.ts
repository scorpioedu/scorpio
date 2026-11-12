import { AsyncLocalStorage } from 'node:async_hooks';

export interface BillingStore {
  organizationId: string;
  userId?: string;
  type: string;
  /** Roster / user names the central scrubber in callGeminiDirect must mask. Optional: omit for none. */
  scrubNames?: string[];
}

export const billingContext = new AsyncLocalStorage<BillingStore>();

/**
 * Runs `fn` with extra names for the provider-bound scrubber, keeping the caller's billing store.
 * With no active store there is nothing to extend and `fn` runs unchanged (AI calls fail closed
 * without a store anyway).
 */
export function withScrubNames<T>(names: readonly string[], fn: () => T): T {
  const store = billingContext.getStore();
  if (!store) return fn();
  const scrubNames = [...(store.scrubNames ?? []), ...names.filter(Boolean)];
  return billingContext.run({ ...store, scrubNames }, fn);
}
