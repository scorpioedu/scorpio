import { NextResponse } from "next/server";
import { adminDb } from "./firebase-admin";
import { ClientError } from "./client-error";
import { isDepartmentPlanOrg } from "./plan-limits";

/**
 * Server-side enforcement of free-plan limits. The UI locks in src/lib/plan-limits.ts are only a
 * convenience; these checks are what an API route trusts.
 */

export interface CallerPlan {
  organizationId: string | null;
  planId: string;
  subscriptionStatus: string | null;
  /** Paid plan with an active subscription (same rule as useDepartmentPlan). */
  isDepartmentPlan: boolean;
  hasNoOrg: boolean;
}

/** Feature names understood by DepartmentUpgradeDialog (src/components/teacher/department-upgrade-dialog.tsx). */
export type GatedFeature = "network-share";

/** A 403 the client can turn into the upgrade dialog: `{ error, code: 'plan_upgrade_required', feature, hasNoOrg }`. */
export class PlanGateError extends ClientError {
  constructor(
    message: string,
    readonly feature: GatedFeature,
    readonly hasNoOrg: boolean,
  ) {
    super(message, 403);
    this.name = "PlanGateError";
  }
}

export function planGateResponse(error: PlanGateError): NextResponse {
  return NextResponse.json(
    {
      error: error.message,
      code: "plan_upgrade_required",
      feature: error.feature,
      hasNoOrg: error.hasNoOrg,
    },
    { status: 403 },
  );
}

/** Resolves the plan of the caller's organization. No organization, or a missing one, is the free plan. */
export async function resolveCallerPlan(
  organizationId: string | null | undefined,
): Promise<CallerPlan> {
  const orgId =
    typeof organizationId === "string" && organizationId && !organizationId.includes("/")
      ? organizationId
      : null;
  const org = orgId
    ? (await adminDb.collection("organizations").doc(orgId).get()).data()
    : undefined;
  return {
    organizationId: orgId,
    planId: typeof org?.planId === "string" && org.planId ? org.planId : "free",
    subscriptionStatus: typeof org?.subscriptionStatus === "string" ? org.subscriptionStatus : null,
    isDepartmentPlan: isDepartmentPlanOrg(org),
    hasNoOrg: !orgId,
  };
}

/**
 * Free plan: may copy its own assignments and every global waypoint (no cap); department (network)
 * waypoints are locked. Paid plans may copy anything they can read. Throws PlanGateError.
 */
export function assertCanCloneAssignment(args: {
  plan: CallerPlan;
  source: { teacherId?: unknown; visibility?: unknown };
  callerUid: string;
}): void {
  const { plan, source, callerUid } = args;
  if (plan.isDepartmentPlan || source.teacherId === callerUid) return;
  if (source.visibility === "network") {
    throw new PlanGateError(
      "Department waypoints require a Department License.",
      "network-share",
      plan.hasNoOrg,
    );
  }
}

/**
 * Creating assignments. The free plan has no assignment-count limit (none is advertised on the
 * pricing page or enforced in the UI), so the only rule is that sharing with a network requires
 * belonging to one. Throws ClientError.
 */
export function assertCanCreateAssignment(args: {
  plan: CallerPlan;
  visibility?: string | null;
}): void {
  if (args.visibility === "network" && args.plan.hasNoOrg) {
    throw new ClientError("Join a school network before sharing with it.", 403);
  }
}
