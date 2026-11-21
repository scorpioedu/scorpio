import { newOrganizationDefaults, pilotOrganizationFields } from "../src/lib/organization-defaults";

// Pins today's behaviour (audit G-003). The membership preset differing from register is an
// UNDECIDED owner question, see docs/quality-audit/remediation/HUMAN-TODO.md.
describe("newOrganizationDefaults", () => {
  test("'register' preset: active free network with a 50 cent starter budget", () => {
    expect(newOrganizationDefaults("register")).toEqual({
      planId: "free",
      subscriptionStatus: "active",
      aiUsageCurrent: 0,
      aiBudgetLimit: 50,
      baseMonthlyFee: 0,
    });
  });

  test("'membership' preset: free network with status 'none' and zero budget", () => {
    expect(newOrganizationDefaults("membership")).toEqual({
      planId: "free",
      subscriptionStatus: "none",
      aiUsageCurrent: 0,
      aiBudgetLimit: 0,
    });
  });

  test("returns a fresh object each call", () => {
    expect(newOrganizationDefaults("register")).not.toBe(newOrganizationDefaults("register"));
  });
});

describe("pilotOrganizationFields", () => {
  const NOW = new Date("2026-11-21T12:00:00Z");
  test("defaults: $10 budget, fall-2026 cohort, no end date", () => {
    expect(pilotOrganizationFields({}, "admin", NOW)).toEqual({
      planId: "pilot",
      subscriptionStatus: "active",
      aiBudgetLimit: 1000,
      pilot: {
        cohort: "fall-2026",
        status: "active",
        startedAt: NOW.toISOString(),
        endsAt: null,
        budgetCents: 1000,
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
    expect(f.aiBudgetLimit).toBe(2500);
    expect(f.pilot).toMatchObject({
      cohort: "spring-2027",
      endsAt: "2027-06-15T00:00:00.000Z",
      budgetCents: 2500,
      source: "invite",
    });
  });
});
