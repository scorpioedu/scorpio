import { isWaypointLocked } from "../src/lib/plan-limits";

// E-003: tests the predicate the waypoints page uses (src/lib/plan-limits.ts); no local copy (RT-19).
describe("Waypoints Plan Restrictions", () => {
  const mockWaypoints = [
    { id: "wp-1", title: "1D Kinematics", visibility: "global" },
    { id: "wp-2", title: "Newton's Laws", visibility: "global" },
    { id: "wp-3", title: "Energy & Work", visibility: "global" },
    { id: "wp-4", title: "Rotational Dynamics", visibility: "global" },
    { id: "wp-5", title: "Thermodynamics", visibility: "global" },
  ];

  test("free plan unlocks the first 3 starter waypoints and locks index 3+", () => {
    const starterIds = mockWaypoints.slice(0, 3).map(w => w.id);
    const isFreePlan = true;
    const activeTab = "global";

    expect(isWaypointLocked("wp-1", 0, starterIds, isFreePlan, activeTab)).toBe(false);
    expect(isWaypointLocked("wp-2", 1, starterIds, isFreePlan, activeTab)).toBe(false);
    expect(isWaypointLocked("wp-3", 2, starterIds, isFreePlan, activeTab)).toBe(false);

    expect(isWaypointLocked("wp-4", 3, starterIds, isFreePlan, activeTab)).toBe(true);
    expect(isWaypointLocked("wp-5", 4, starterIds, isFreePlan, activeTab)).toBe(true);
  });

  test("department plan unlocks all waypoints without limitation", () => {
    const starterIds = mockWaypoints.slice(0, 3).map(w => w.id);
    const isFreePlan = false;
    const activeTab = "global";

    mockWaypoints.forEach((wp, idx) => {
      expect(isWaypointLocked(wp.id, idx, starterIds, isFreePlan, activeTab)).toBe(false);
    });
  });

  test("free plan locks all waypoints on the department network tab", () => {
    const starterIds = mockWaypoints.slice(0, 3).map(w => w.id);
    const isFreePlan = true;
    const activeTab = "network";

    expect(isWaypointLocked("wp-1", 0, starterIds, isFreePlan, activeTab)).toBe(true);
    expect(isWaypointLocked("wp-4", 3, starterIds, isFreePlan, activeTab)).toBe(true);
  });

  test("free plan with no starter list unlocks only the first three by position", () => {
    expect([0, 1, 2, 3, 4].map(i => isWaypointLocked("any", i, [], true, "global"))).toEqual([false, false, false, true, true]);
  });

  test("free plan with a starter list ignores position", () => {
    expect(isWaypointLocked("wp-9", 0, ["wp-9"], true, "global")).toBe(false);
    expect(isWaypointLocked("wp-1", 0, ["wp-9"], true, "global")).toBe(true);
  });

  test("paid plan is never locked, even on the network tab with no starters", () => {
    expect(isWaypointLocked("wp-1", 99, [], false, "network")).toBe(false);
  });

  test("network tab wins over the starter list on the free plan", () => {
    expect(isWaypointLocked("wp-1", 0, ["wp-1"], true, "network")).toBe(true);
  });
});
