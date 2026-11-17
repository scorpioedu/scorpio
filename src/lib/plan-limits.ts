/**
 * Free-plan rules shared by the client (UI locks) and the server (src/lib/plan-gates.ts), so the two
 * cannot drift. Pure functions only: this file is imported from client components.
 */

/** Free plans may copy this many "starter" global waypoints: the first N global waypoints by document id. */
export const STARTER_WAYPOINT_COUNT = 3;

/** Mirrors isOnDepartmentPlan in src/hooks/use-department-plan.ts: a paid plan with an active subscription. */
export function isDepartmentPlanOrg(
  org: { planId?: unknown; subscriptionStatus?: unknown } | null | undefined,
): boolean {
  if (!org) return false;
  if (!org.planId || org.planId === "free") return false;
  return org.subscriptionStatus === "active";
}

/**
 * Free-plan gating for the teacher waypoint library. Extracted verbatim from
 * src/app/teacher/waypoints/page.tsx (E-003).
 * - Paid plans: nothing is locked.
 * - Free plan: the network tab is locked; otherwise only the starter waypoints are unlocked, or
 *   the first three by position when no starter list has loaded.
 */
export function isWaypointLocked(
  waypointId: string,
  index: number,
  starterIds: string[],
  isFreePlan: boolean,
  activeTab: string,
): boolean {
  if (!isFreePlan) return false;
  if (activeTab === "network") return true;
  if (starterIds.length > 0) {
    return !starterIds.includes(waypointId);
  }
  return index >= STARTER_WAYPOINT_COUNT;
}
