import { isWaypointLocked } from "../src/lib/plan-limits";

// Predicate the waypoints page uses (src/lib/plan-limits.ts). Freemium: no cap on global waypoints.
describe("Waypoints Plan Restrictions", () => {
  test("free plan: global waypoints are never locked, however many there are", () => {
    expect(isWaypointLocked(true, "global")).toBe(false);
  });

  test("free plan: the department (network) tab is locked", () => {
    expect(isWaypointLocked(true, "network")).toBe(true);
  });

  test("free plan: the user's own tab is not locked", () => {
    expect(isWaypointLocked(true, "mine")).toBe(false);
  });

  test("paid plan is never locked", () => {
    expect(isWaypointLocked(false, "global")).toBe(false);
    expect(isWaypointLocked(false, "network")).toBe(false);
  });
});
