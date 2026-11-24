import { migrationPlanFor, migrationGroupFor, migrationLedgerDoc, MIGRATION_LEDGER_ID } from "../functions/src/credit-migration";
import { buildAnnouncement, roundHints } from "../functions/src/credit-announcement";
import { crossedLowBalance, lowBalanceParagraph } from "../functions/src/credit-email-rules";
import { estimateHints, FREE_MONTHLY_CENTS } from "../functions/src/budget-policy";

const now = new Date("2026-11-23T12:00:00Z");
const in12 = new Date(now.getTime() + 365 * 864e5).toISOString();

describe("migrationPlanFor", () => {
  it("free network gets $5 and planId stays free", () => {
    const p = migrationPlanFor({ planId: "free", subscriptionStatus: "none", aiBudgetLimit: 50 }, now);
    expect(p.group).toBe("free");
    expect(p.grantCents).toBe(500);
    expect(p.orgUpdate).toMatchObject({ aiBudgetLimit: 0, subscriptionStatus: "active", planId: "free", aiBonusCents: 500, aiPaidCents: 0, aiBonusExpiresAt: in12 });
  });
  it("pilot keeps planId, gets unspent budget, expiry is the later date", () => {
    const p = migrationPlanFor({ planId: "pilot", subscriptionStatus: "active", aiBudgetLimit: 1000, aiUsageCurrent: 12.5, pilot: { endsAt: "2028-01-01T00:00:00Z" } }, now);
    expect(p.group).toBe("pilot");
    expect(p.grantCents).toBe(987.5);
    expect(p.newPlanId).toBe("pilot");
    expect(p.orgUpdate["pilot.grantedCents"]).toBe(1000);
    expect(p.newBonusExpiresAt).toBe("2028-01-01T00:00:00.000Z");
    expect(migrationPlanFor({ planId: "pilot", aiBudgetLimit: 1000, pilot: { endsAt: "2027-01-21" } }, now).newBonusExpiresAt).toBe(in12);
  });
  it("pilot that spent everything grants 0 and sets no expiry", () => {
    const p = migrationPlanFor({ planId: "pilot", aiBudgetLimit: 1000, aiUsageCurrent: 1500 }, now);
    expect(p.grantCents).toBe(0);
    expect(p.orgUpdate.aiBonusExpiresAt).toBeUndefined();
  });
  it("yearly gets unspent plus $10 and planId becomes free; warns on a Polar subscription", () => {
    const p = migrationPlanFor({ planId: "standard_yearly", subscriptionStatus: "active", aiBudgetLimit: 1000, aiUsageCurrent: 1.1, polarSubscriptionId: "sub_1" }, now);
    expect(p.group).toBe("yearly");
    expect(p.grantCents).toBe(1998.9);
    expect(p.newPlanId).toBe("free");
    expect(p.warnings.join()).toMatch(/Polar/);
  });
  it("unknown plan gets $5 with a warning", () => {
    const p = migrationPlanFor({ planId: "pro_monthly" }, now);
    expect(migrationGroupFor({ planId: "pro_monthly" })).toBe("other");
    expect(p.grantCents).toBe(500);
    expect(p.orgUpdate.planId).toBe("free");
    expect(p.warnings.length).toBe(1);
  });
  it("adds to an unexpired bonus, drops an expired one, and keeps an existing aiPaidCents", () => {
    const keep = migrationPlanFor({ planId: "free", aiBonusCents: 200, aiBonusExpiresAt: "2027-06-01T00:00:00Z", aiPaidCents: 700 }, now);
    expect(keep.newBonusCents).toBe(700);
    expect(keep.orgUpdate.aiPaidCents).toBeUndefined();
    const gone = migrationPlanFor({ planId: "free", aiBonusCents: 200, aiBonusExpiresAt: "2026-01-01T00:00:00Z" }, now);
    expect(gone.newBonusCents).toBe(500);
  });
  it("ledger doc carries the tag and group", () => {
    const p = migrationPlanFor({ planId: "free" }, now);
    expect(MIGRATION_LEDGER_ID).toBe("migration-migration-2026-11");
    expect(migrationLedgerDoc(p, now)).toMatchObject({ kind: "migration", bucket: "bonus", cents: 500, externalId: "migration-2026-11", meta: { group: "free" } });
  });
});

describe("buildAnnouncement", () => {
  const hints = roundHints(estimateHints(FREE_MONTHLY_CENTS));
  it("rounds the hint count to 850", () => expect(hints).toBe(850));
  it("free network mentions $5; yearly $10; pilot omits the clause", () => {
    expect(buildAnnouncement({ name: "Dana Rivera", group: "free", grantCents: 500, hints }).text).toContain("we've added $5 to your balance as a thank-you for being early");
    expect(buildAnnouncement({ name: "Dana", group: "yearly", grantCents: 1998, hints }).text).toContain("added $10");
    const pilot = buildAnnouncement({ name: "Dana", group: "pilot", grantCents: 987.5, expiresAt: "2027-11-23T00:00:00Z", hints }).text;
    expect(pilot).not.toContain("thank-you");
    expect(pilot).toContain("remaining AI ($9.88) is now credit on your balance and lasts until November 23, 2027.");
    expect(pilot).toContain("about 850 Raise hints");
  });
  it("no network", () => {
    const t = buildAnnouncement({ name: "", group: null, grantCents: 0, hints }).text;
    expect(t.startsWith("Hi,\n\n")).toBe(true);
    expect(t).toContain("Create or join a network on Teacher Home");
    expect(t).not.toMatch(/donate|sponsor|charity|nonprofit organization|tax-deductible/i);
  });
});

describe("crossedLowBalance", () => {
  const month = "2026-11";
  const base = { aiFreeMonth: month, aiUsageMonth: month };
  it("fires when crossing below 25c after spending", () => {
    const r = crossedLowBalance({ ...base, aiFreeUsedCents: 70, aiUsageCurrent: 70 }, { ...base, aiFreeUsedCents: 80, aiUsageCurrent: 80 }, now);
    expect(r).toEqual({ month, availableCents: 20 });
    expect(lowBalanceParagraph(20)).toContain("$0.20");
  });
  it("does not fire when already low, still healthy, or nothing spent", () => {
    expect(crossedLowBalance({ ...base, aiFreeUsedCents: 80, aiUsageCurrent: 80 }, { ...base, aiFreeUsedCents: 90, aiUsageCurrent: 90 }, now)).toBeNull();
    expect(crossedLowBalance({ ...base, aiFreeUsedCents: 10, aiUsageCurrent: 10 }, { ...base, aiFreeUsedCents: 20, aiUsageCurrent: 20 }, now)).toBeNull();
    expect(crossedLowBalance({ aiBonusCents: 30 }, { aiBonusCents: 10 }, now)).toBeNull();
  });
});
