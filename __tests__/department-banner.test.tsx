import { renderToStaticMarkup } from "react-dom/server";

let mockAuth: { user: { uid: string } | null; profile: Record<string, unknown> | null; loading: boolean } = {
  user: { uid: "t1" },
  profile: { role: "teacher", organizationId: "org1" },
  loading: false,
};
let mockPath = "/teacher";
jest.mock("@/lib/firebase", () => ({ db: {}, auth: {} }));
jest.mock("firebase/firestore", () => ({ doc: jest.fn(), onSnapshot: jest.fn() }));
jest.mock("@/contexts/auth-context", () => ({ useAuth: () => mockAuth }));
jest.mock("next/navigation", () => ({ usePathname: () => mockPath }));

import { DepartmentBanner } from "@/components/department-banner";
import { summarizeBalance, LOW_BALANCE_CENTS, FREE_MONTHLY_CENTS } from "../functions/src/budget-policy";

const month = new Date().toISOString().slice(0, 7);
// The banner shows when summarizeBalance(org).availableCents < LOW_BALANCE_CENTS.
const isLow = (org: Record<string, unknown>) => summarizeBalance(org).availableCents < LOW_BALANCE_CENTS;

describe("DepartmentBanner (low-balance banner)", () => {
  beforeEach(() => {
    mockAuth = { user: { uid: "t1" }, profile: { role: "teacher", organizationId: "org1" }, loading: false };
    mockPath = "/teacher";
  });

  test("renders nothing while auth is loading, when signed out, or for students", () => {
    mockAuth = { ...mockAuth, loading: true };
    expect(renderToStaticMarkup(<DepartmentBanner />)).toBe("");
    mockAuth = { user: null, profile: null, loading: false };
    expect(renderToStaticMarkup(<DepartmentBanner />)).toBe("");
    mockAuth = { user: { uid: "s1" }, profile: { role: "student", organizationId: "org1" }, loading: false };
    expect(renderToStaticMarkup(<DepartmentBanner />)).toBe("");
  });

  test("renders nothing on the billing page, and before the network has loaded", () => {
    mockPath = "/teacher/network/billing";
    expect(renderToStaticMarkup(<DepartmentBanner />)).toBe("");
    mockPath = "/teacher";
    expect(renderToStaticMarkup(<DepartmentBanner />)).toBe("");
  });
});

describe("low-balance condition", () => {
  test("a fresh network (free $1 unused) is not low", () => {
    expect(isLow({})).toBe(false);
    expect(isLow({ aiFreeMonth: month, aiFreeUsedCents: 0 })).toBe(false);
  });

  test("the threshold is below $1 so a used cent of free allowance does not trigger it", () => {
    expect(LOW_BALANCE_CENTS).toBeLessThan(FREE_MONTHLY_CENTS);
    expect(isLow({ aiFreeMonth: month, aiFreeUsedCents: 1 })).toBe(false);
  });

  test("low once available credit falls under the threshold", () => {
    expect(isLow({ aiFreeMonth: month, aiFreeUsedCents: FREE_MONTHLY_CENTS - LOW_BALANCE_CENTS })).toBe(false);
    expect(isLow({ aiFreeMonth: month, aiFreeUsedCents: FREE_MONTHLY_CENTS - LOW_BALANCE_CENTS + 1 })).toBe(true);
    expect(isLow({ aiFreeMonth: month, aiFreeUsedCents: FREE_MONTHLY_CENTS })).toBe(true);
  });

  test("paid and unexpired bonus credit keep it from being low", () => {
    const spent = { aiFreeMonth: month, aiFreeUsedCents: FREE_MONTHLY_CENTS };
    expect(isLow({ ...spent, aiPaidCents: 500 })).toBe(false);
    expect(isLow({ ...spent, aiBonusCents: 500, aiBonusExpiresAt: new Date(Date.now() + 864e5).toISOString() })).toBe(false);
  });

  test("expired bonus, a negative paid balance and reservations count against it", () => {
    const spent = { aiFreeMonth: month, aiFreeUsedCents: FREE_MONTHLY_CENTS };
    expect(isLow({ ...spent, aiBonusCents: 500, aiBonusExpiresAt: new Date(Date.now() - 864e5).toISOString() })).toBe(true);
    expect(isLow({ aiPaidCents: -80 })).toBe(true);
    expect(isLow({ ...spent, aiPaidCents: 100, aiUsageReserved: 90 })).toBe(true);
  });

  test("a new month restores the free allowance", () => {
    expect(isLow({ aiFreeMonth: "2000-01", aiFreeUsedCents: FREE_MONTHLY_CENTS })).toBe(false);
  });
});
