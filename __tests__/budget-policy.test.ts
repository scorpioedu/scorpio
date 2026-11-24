import {
  evaluateBudget,
  summarizeBalance,
  splitSpend,
  depositCreditCents,
  estimateHints,
  raiseHintCents,
  FREE_MONTHLY_CENTS,
} from "../functions/src/budget-policy";

const MONTH = "2026-11";
const NOW = new Date("2026-11-23T12:00:00Z");
const reason = (d: ReturnType<typeof evaluateBudget>) => (d.allowed ? "allowed" : d.reason);
const decide = (org: Record<string, unknown> | null, cost = 1, type = "grading", user = null) =>
  reason(evaluateBudget(org, user, type, cost, MONTH, NOW));

describe("summarizeBalance", () => {
  test("a brand-new network has this month's free $1 and nothing else", () => {
    expect(summarizeBalance({}, MONTH, NOW)).toMatchObject({
      freeLeftCents: FREE_MONTHLY_CENTS,
      bonusCents: 0,
      paidCents: 0,
      availableCents: 100,
      monthSpendCents: 0,
      monthlyCapCents: 0,
    });
  });

  test("free usage only counts for its own month", () => {
    expect(summarizeBalance({ aiFreeMonth: MONTH, aiFreeUsedCents: 40 }, MONTH, NOW).freeLeftCents).toBe(60);
    expect(summarizeBalance({ aiFreeMonth: "2026-10", aiFreeUsedCents: 100 }, MONTH, NOW).freeLeftCents).toBe(100);
  });

  test("expired bonus counts as zero; unexpired bonus counts", () => {
    expect(
      summarizeBalance({ aiBonusCents: 500, aiBonusExpiresAt: "2026-11-01T00:00:00Z" }, MONTH, NOW).bonusCents,
    ).toBe(0);
    expect(
      summarizeBalance({ aiBonusCents: 500, aiBonusExpiresAt: "2027-11-01T00:00:00Z" }, MONTH, NOW).bonusCents,
    ).toBe(500);
    expect(summarizeBalance({ aiBonusCents: 500 }, MONTH, NOW).bonusCents).toBe(500);
  });

  test("accepts Firestore-like timestamps for bonus expiry", () => {
    const past = { toMillis: () => Date.parse("2026-01-01T00:00:00Z") };
    expect(summarizeBalance({ aiBonusCents: 500, aiBonusExpiresAt: past }, MONTH, NOW).bonusCents).toBe(0);
  });

  test("negative paid (after a refund) and reservations reduce what is available, floored at 0", () => {
    expect(summarizeBalance({ aiPaidCents: -300 }, MONTH, NOW).availableCents).toBe(0);
    expect(summarizeBalance({ aiPaidCents: 200, aiUsageReserved: 50 }, MONTH, NOW).availableCents).toBe(250);
  });

  test("month spend uses aiUsageCurrent only for the current month", () => {
    expect(summarizeBalance({ aiUsageMonth: MONTH, aiUsageCurrent: 12 }, MONTH, NOW).monthSpendCents).toBe(12);
    expect(summarizeBalance({ aiUsageMonth: "2026-10", aiUsageCurrent: 12 }, MONTH, NOW).monthSpendCents).toBe(0);
    expect(summarizeBalance({ aiUsageCurrent: 12 }, MONTH, NOW).monthSpendCents).toBe(0);
  });
});

describe("evaluateBudget balance", () => {
  test.each<[string, Record<string, unknown> | null, number, string]>([
    ["no org", null, 0, "budget_exhausted"],
    ["new network, free allowance", {}, 1, "allowed"],
    ["legacy subscription status is ignored", { subscriptionStatus: "none", planId: "free" }, 1, "allowed"],
    ["free used up, nothing else", { aiFreeMonth: MONTH, aiFreeUsedCents: 100 }, 0, "budget_exhausted"],
    ["free used up last month resets", { aiFreeMonth: "2026-10", aiFreeUsedCents: 100 }, 1, "allowed"],
    ["free used up, bonus left", { aiFreeMonth: MONTH, aiFreeUsedCents: 100, aiBonusCents: 5 }, 1, "allowed"],
    [
      "free used up, bonus expired",
      { aiFreeMonth: MONTH, aiFreeUsedCents: 100, aiBonusCents: 500, aiBonusExpiresAt: "2026-11-01T00:00:00Z" },
      0,
      "budget_exhausted",
    ],
    ["free used up, paid left", { aiFreeMonth: MONTH, aiFreeUsedCents: 100, aiPaidCents: 2 }, 1, "allowed"],
    ["cost larger than balance", { aiFreeMonth: MONTH, aiFreeUsedCents: 99.5 }, 1, "budget_exhausted"],
    ["cost exactly the balance", { aiFreeMonth: MONTH, aiFreeUsedCents: 99 }, 1, "allowed"],
    ["reservations count", { aiUsageReserved: 100 }, 0, "budget_exhausted"],
    ["refund drove paid negative", { aiFreeMonth: MONTH, aiFreeUsedCents: 100, aiPaidCents: -50, aiBonusCents: 40 }, 0, "budget_exhausted"],
  ])("%s", (_label, org, cost, expected) => {
    expect(decide(org, cost)).toBe(expected);
  });
});

describe("evaluateBudget monthly spend cap", () => {
  const org = { aiPaidCents: 10_000, aiUsageMonth: MONTH, aiUsageCurrent: 450 };
  test.each<[string, Record<string, unknown>, number, string]>([
    ["no cap (0)", { aiBudgetLimit: 0 }, 100, "allowed"],
    ["under the cap", { aiBudgetLimit: 500 }, 10, "allowed"],
    ["cost would pass the cap", { aiBudgetLimit: 500 }, 60, "monthly_cap_reached"],
    ["reserved counts toward the cap", { aiBudgetLimit: 500, aiUsageReserved: 50 }, 1, "monthly_cap_reached"],
    ["last month's spend does not count", { aiBudgetLimit: 500, aiUsageMonth: "2026-10" }, 60, "allowed"],
    ["an empty balance wins over the cap", { aiBudgetLimit: 500, aiPaidCents: 0, aiFreeMonth: MONTH, aiFreeUsedCents: 100 }, 1, "budget_exhausted"],
  ])("%s", (_label, overrides, cost, expected) => {
    expect(decide({ ...org, ...overrides }, cost)).toBe(expected);
  });
});

describe("evaluateBudget per-user limits", () => {
  const org = { aiPaidCents: 10_000, aiTutorLimitPerStudent: 5, aiNotebookLimitPerStudent: 3 };
  test.each<[string, string, Record<string, unknown> | null, string]>([
    ["tutor under", "tutor", { usageMonth: MONTH, tutorUsageCurrent: 4 }, "allowed"],
    ["tutor at limit", "tutor", { usageMonth: MONTH, tutorUsageCurrent: 5 }, "user_allowance_reached"],
    ["tutor stale month resets", "tutor", { usageMonth: "2026-10", tutorUsageCurrent: 5 }, "allowed"],
    ["notebook at limit", "notebook", { usageMonth: MONTH, aiNotebookUsageCurrent: 3 }, "user_allowance_reached"],
    ["notebook ignores tutor counter", "notebook", { usageMonth: MONTH, tutorUsageCurrent: 99 }, "allowed"],
    ["other types have no per-user limit", "grading", { usageMonth: MONTH, tutorUsageCurrent: 99 }, "allowed"],
    ["no user doc", "tutor", null, "allowed"],
  ])("%s", (_label, type, user, expected) => {
    expect(reason(evaluateBudget(org, user, type, 1, MONTH, NOW))).toBe(expected);
  });

  test("allowance 0 is unlimited per student", () => {
    expect(
      reason(
        evaluateBudget(
          { ...org, aiTutorLimitPerStudent: 0 },
          { usageMonth: MONTH, tutorUsageCurrent: 999 },
          "tutor",
          1,
          MONTH,
          NOW,
        ),
      ),
    ).toBe("allowed");
  });
});

describe("splitSpend", () => {
  test("spends free, then bonus, then paid", () => {
    const org = { aiFreeMonth: MONTH, aiFreeUsedCents: 90, aiBonusCents: 5, aiPaidCents: 100 };
    expect(splitSpend(org, 20, MONTH, NOW)).toEqual({ free: 10, bonus: 5, paid: 5 });
  });
  test("a new month's free allowance is used first", () => {
    expect(splitSpend({ aiFreeMonth: "2026-10", aiFreeUsedCents: 100, aiPaidCents: 50 }, 3, MONTH, NOW)).toEqual({
      free: 3,
      bonus: 0,
      paid: 0,
    });
  });
  test("expired bonus is skipped", () => {
    const org = { aiFreeMonth: MONTH, aiFreeUsedCents: 100, aiBonusCents: 50, aiBonusExpiresAt: "2026-01-01T00:00:00Z" };
    expect(splitSpend(org, 4, MONTH, NOW)).toEqual({ free: 0, bonus: 0, paid: 4 });
  });
  test("an overshoot lands on paid, below zero", () => {
    expect(splitSpend({ aiFreeMonth: MONTH, aiFreeUsedCents: 99 }, 3, MONTH, NOW)).toEqual({
      free: 1,
      bonus: 0,
      paid: 2,
    });
  });
});

describe("display helpers", () => {
  test("deposit credit takes Polar's 5% + 50c off", () => {
    expect(depositCreditCents(500)).toBe(425);
    expect(depositCreditCents(1000)).toBe(900);
    expect(depositCreditCents(0)).toBe(0);
  });
  test("a Raise hint doubles in price on 1 Jan 2027", () => {
    const before = raiseHintCents(Date.parse("2026-12-31T23:00:00Z"));
    const after = raiseHintCents(Date.parse("2027-01-01T00:00:00Z"));
    expect(after).toBeCloseTo(before * 2, 10);
  });
  test("estimateHints rounds large counts and handles zero", () => {
    const now = Date.parse("2026-11-23T00:00:00Z");
    expect(estimateHints(0, now)).toBe(0);
    expect(estimateHints(-5, now)).toBe(0);
    expect(estimateHints(1000, now) % 100).toBe(0);
  });
});
