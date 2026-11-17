/**
 * Free-plan rules shared by the client (UI locks) and the server (src/lib/plan-gates.ts), so the two
 * cannot drift. Pure functions only: this file is imported from client components.
 *
 * Free plan: every global waypoint can be copied, with auto-grading and the misconception report.
 * Paid (Department License): department/network waypoints, network sharing, higher AI limits.
 */

/** Mirrors isOnDepartmentPlan in src/hooks/use-department-plan.ts: a paid plan with an active subscription. */
export function isDepartmentPlanOrg(
  org: { planId?: unknown; subscriptionStatus?: unknown } | null | undefined,
): boolean {
  if (!org) return false;
  if (!org.planId || org.planId === "free") return false;
  return org.subscriptionStatus === "active";
}

/**
 * Free-plan gating for the teacher waypoint library. Paid plans: nothing is locked. Free plan: only
 * the department (network) tab is locked; global waypoints are never capped.
 */
export function isWaypointLocked(isFreePlan: boolean, activeTab: string): boolean {
  return isFreePlan && activeTab === "network";
}
