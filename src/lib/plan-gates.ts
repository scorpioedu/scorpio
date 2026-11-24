import { ClientError } from "./client-error";

/**
 * Scorpio is free for every teacher: nothing is locked by plan. AI use is limited only by the
 * network's AI balance, which the AI routes enforce server-side (src/lib/usage-limit.ts).
 */

export interface CallerPlan {
  organizationId: string | null;
  hasNoOrg: boolean;
}

/** The caller's network, if any. A malformed id counts as no network. */
export function resolveCallerPlan(organizationId: string | null | undefined): CallerPlan {
  const orgId =
    typeof organizationId === "string" && organizationId && !organizationId.includes("/")
      ? organizationId
      : null;
  return { organizationId: orgId, hasNoOrg: !orgId };
}

/**
 * Creating assignments. There is no assignment-count limit, so the only rule is that sharing with a
 * network requires belonging to one. Throws ClientError.
 */
export function assertCanCreateAssignment(args: {
  plan: CallerPlan;
  visibility?: string | null;
}): void {
  if (args.visibility === "network" && args.plan.hasNoOrg) {
    throw new ClientError("Join a school network before sharing with it.", 403);
  }
}
