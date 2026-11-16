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
  activeTab: string
): boolean {
  if (!isFreePlan) return false;
  if (activeTab === "network") return true;
  if (starterIds.length > 0) {
    return !starterIds.includes(waypointId);
  }
  return index >= 3;
}
