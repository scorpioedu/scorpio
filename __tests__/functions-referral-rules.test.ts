import {
  ANNUAL_CAP_CENTS,
  referralCentsThisYear,
  referralDecision,
  referralExternalIds,
  type ReferralInput,
} from "../functions/src/referral-rules";

const base: ReferralInput = {
  referredUid: "colleague",
  referrerUid: "referrer",
  referrerOrgId: "orgA",
  referredOrgId: "orgB",
  alreadyPaid: false,
  hasResults: true,
  enrolledStudents: 5,
  referrerCentsThisYear: 0,
};

describe("referralDecision", () => {
  it("pays $5 and $2 at results plus five students", () => {
    expect(referralDecision(base)).toEqual({ pay: true, referrerCents: 500, welcomeCents: 200 });
  });
  it("waits for results and for the fifth student", () => {
    expect(referralDecision({ ...base, hasResults: false })).toEqual({
      pay: false,
      reason: "no_results",
    });
    expect(referralDecision({ ...base, enrolledStudents: 4 })).toEqual({
      pay: false,
      reason: "too_few_students",
    });
  });
  it("pays once", () => {
    expect(referralDecision({ ...base, alreadyPaid: true })).toEqual({
      pay: false,
      reason: "already_paid",
    });
  });
  it("never pays inside one network or to oneself", () => {
    expect(referralDecision({ ...base, referredOrgId: "orgA" })).toEqual({
      pay: false,
      reason: "same_network",
    });
    expect(referralDecision({ ...base, referrerUid: "colleague" })).toEqual({
      pay: false,
      reason: "self",
    });
  });
  it("skips when either side has no network or there is no referrer", () => {
    expect(referralDecision({ ...base, referrerOrgId: null })).toEqual({
      pay: false,
      reason: "no_network",
    });
    expect(referralDecision({ ...base, referredOrgId: undefined })).toEqual({
      pay: false,
      reason: "no_network",
    });
    expect(referralDecision({ ...base, referrerUid: null })).toEqual({
      pay: false,
      reason: "no_referrer",
    });
  });
  it("stops the referrer's $5 at the $50 yearly cap but still welcomes the colleague", () => {
    expect(
      referralDecision({ ...base, referrerCentsThisYear: ANNUAL_CAP_CENTS - 500 }),
    ).toMatchObject({ referrerCents: 500 });
    expect(referralDecision({ ...base, referrerCentsThisYear: ANNUAL_CAP_CENTS })).toEqual({
      pay: true,
      referrerCents: 0,
      welcomeCents: 200,
    });
  });
});

describe("referralCentsThisYear", () => {
  const now = new Date("2026-11-23T12:00:00Z");
  const e = (over: object) => ({
    kind: "referral",
    cents: 500,
    createdAt: new Date("2026-03-01T00:00:00Z"),
    meta: { referrerUid: "referrer" },
    ...over,
  });
  it("counts this year's referral credit for this referrer only", () => {
    const entries = [
      e({}),
      e({ createdAt: { toMillis: () => Date.parse("2026-06-01") } }),
      e({ createdAt: new Date("2025-12-31T23:59:59Z") }),
      e({ meta: { referrerUid: "someone-else" } }),
      e({ kind: "welcome" }),
      e({ cents: -500 }),
    ];
    expect(referralCentsThisYear(entries, "referrer", now)).toBe(1000);
  });
});

describe("referralExternalIds", () => {
  it("is stable per referred teacher", () => {
    expect(referralExternalIds("u1")).toEqual({ referrer: "referral-u1", welcome: "welcome-u1" });
  });
});
