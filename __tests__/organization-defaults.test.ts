import {
  newOrganizationDefaults,
  pilotOrganizationFields,
  pilotBonusExpiry,
} from "../src/lib/organization-defaults";

// Credit model (SCO-14): both creation paths make an active free network with no spend cap.
describe("newOrganizationDefaults", () => {
  test.each(["register", "membership"] as const)("'%s' preset: active, no cap, empty buckets", (path) => {
    expect(newOrganizationDefaults(path)).toEqual({
      planId: "free",
      subscriptionStatus: "active",
      aiUsageCurrent: 0,
      aiBudgetLimit: 0,
      aiBonusCents: 0,
      aiPaidCents: 0,
    });
  });

  test("returns a fresh object each call", () => {
    expect(newOrganizationDefaults("register")).not.toBe(newOrganizationDefaults("register"));
  });
});

describe("pilotOrganizationFields", () => {
  const NOW = new Date("2026-11-21T12:00:00Z");
  test("defaults: $10 of bonus credit for 12 months, fall-2026 cohort, no end date", () => {
    expect(pilotOrganizationFields({}, "admin", NOW)).toEqual({
      planId: "pilot",
      subscriptionStatus: "active",
      aiBonusCents: 1000,
      aiBonusExpiresAt: new Date(NOW.getTime() + 365 * 864e5).toISOString(),
      pilot: {
        cohort: "fall-2026",
        status: "active",
        startedAt: NOW.toISOString(),
        endsAt: null,
        budgetCents: 1000,
        grantedCents: 1000,
        note: null,
        source: "admin",
      },
    });
  });

  test("uses the granted budget, cohort and end date", () => {
    const f = pilotOrganizationFields(
      { budgetCents: 2500, cohort: "spring-2027", endsAt: "2027-06-15T00:00:00.000Z" },
      "invite",
      NOW,
    );
    expect(f.aiBonusCents).toBe(2500);
    expect(f.pilot).toMatchObject({
      cohort: "spring-2027",
      endsAt: "2027-06-15T00:00:00.000Z",
      budgetCents: 2500,
      grantedCents: 2500,
      source: "invite",
    });
  });
});

describe("pilotBonusExpiry", () => {
  const NOW = new Date("2026-11-21T12:00:00Z");
  const year = new Date(NOW.getTime() + 365 * 864e5).toISOString();
  test("12 months when there is no end date or it is sooner", () => {
    expect(pilotBonusExpiry(null, NOW)).toBe(year);
    expect(pilotBonusExpiry("2027-01-21T23:59:59.000Z", NOW)).toBe(year);
  });
  test("the pilot end date when it is later than 12 months", () => {
    expect(pilotBonusExpiry("2028-03-01T00:00:00.000Z", NOW)).toBe("2028-03-01T00:00:00.000Z");
  });
});
