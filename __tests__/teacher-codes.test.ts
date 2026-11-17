/* eslint-disable @typescript-eslint/no-require-imports */
const codes = require("../tools/teacher-codes.cjs");

const now = new Date("2026-12-04T12:00:00Z");

describe("parseCsv", () => {
  test("handles quotes, embedded commas/newlines, doubled quotes, CRLF and BOM", () => {
    const rows = codes.parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"two\nlines",z\r\n');
    expect(rows).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["two\nlines", "z"]]);
  });
  test("skips blank lines", () => {
    expect(codes.parseCsv("a,b\n\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parseContacts", () => {
  test("normalises emails, ignores extra columns, reports bad and duplicate rows", () => {
    const { contacts, errors } = codes.parseContacts(
      'School,Email,Name,notes\nLincoln, " Ann@Ex.com ","Ann ""A""",x\nSt Mary,bob@ex.com,Bob,\nX,ann@ex.com,Dup,\nY,nope,Bad,\nZ,,Empty,\n'.replace("School,Email,Name", "school,EMAIL,name"),
    );
    expect(contacts).toEqual([
      { email: "ann@ex.com", name: 'Ann "A"', school: "Lincoln" },
      { email: "bob@ex.com", name: "Bob", school: "St Mary" },
    ]);
    expect(errors).toHaveLength(3);
  });
  test("requires email, name and school columns", () => {
    const { contacts, errors } = codes.parseContacts("email,name\na@b.co,A\n");
    expect(contacts).toEqual([]);
    expect(errors[0]).toMatch(/school/);
  });
  test("empty input is an error", () => {
    expect(codes.parseContacts("").errors).toHaveLength(1);
  });
});

describe("records and codes", () => {
  test("generateCode has the SCORP-XXXX-XXXX shape", () => {
    expect(codes.generateCode()).toMatch(/^SCORP-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });
  test("buildInviteRecord carries contact, campaign and the existing fields", () => {
    const expiresAt = codes.expiryFrom(now, 120);
    expect(codes.buildInviteRecord({ code: "SCORP-AAAA-BBBB", contact: { email: " A@B.co ", name: "A", school: "S" }, label: "Dec", expiresAt })).toEqual({
      code: "SCORP-AAAA-BBBB", label: "Dec", organizationId: null, contactEmail: "a@b.co", contactName: "A", school: "S",
      expiresAt, isUsed: false, usedAt: null, usedBy: null, usedByEmail: null,
    });
    expect(expiresAt.getTime() - now.getTime()).toBe(120 * 86400000);
  });
  test("single-code records have null contact fields", () => {
    const r = codes.buildInviteRecord({ code: "C", label: "Reddit", expiresAt: now });
    expect(r).toMatchObject({ contactEmail: null, contactName: null, school: null, label: "Reddit" });
  });
  test("signupUrl prefills the teacher invite", () => {
    expect(codes.signupUrl("SCORP-AAAA-BBBB", "https://x.test/")).toBe("https://x.test/signup?teacherInvite=SCORP-AAAA-BBBB");
  });
});

describe("planBatch idempotency", () => {
  const contacts = [
    { email: "ann@ex.com", name: "Ann", school: "L" },
    { email: "bob@ex.com", name: "Bob", school: "M" },
    { email: "cy@ex.com", name: "Cy", school: "N" },
    { email: "di@ex.com", name: "Di", school: "O" },
  ];
  const future = new Date(now.getTime() + 86400000);
  const past = new Date(now.getTime() - 86400000);
  const existing = new Map([
    ["ann@ex.com", [{ code: "OLD-ANN", isUsed: false, expiresAt: future }]],
    ["bob@ex.com", [{ code: "USED-BOB", isUsed: true, expiresAt: future }]],
    ["cy@ex.com", [{ code: "EXP-CY", isUsed: false, expiresAt: past }]],
    ["di@ex.com", [{ code: "REV-DI", isUsed: false, revokedAt: past, expiresAt: future }]],
  ]);
  let n = 0;
  const makeCode = () => `NEW-${++n}`;

  test("reuses only unused, unexpired, unrevoked codes", () => {
    const plan = codes.planBatch(contacts, existing, { label: "Dec", expiresDays: 120, now, makeCode });
    expect(plan.map((p: { code: string; reused: boolean }) => [p.code, p.reused])).toEqual([
      ["OLD-ANN", true], ["NEW-1", false], ["NEW-2", false], ["NEW-3", false],
    ]);
    expect(plan[0].record).toBeNull();
    expect(plan[1].record).toMatchObject({ contactEmail: "bob@ex.com", label: "Dec", isUsed: false });
  });
  test("a second run over the first run's output creates nothing", () => {
    const first = codes.planBatch(contacts, new Map(), { now, makeCode });
    const stored = new Map(first.map((p: { contact: { email: string }; record: unknown }) => [p.contact.email, [p.record]]));
    const second = codes.planBatch(contacts, stored, { now, makeCode });
    expect(second.every((p: { reused: boolean }) => p.reused)).toBe(true);
    expect(second.map((p: { code: string }) => p.code)).toEqual(first.map((p: { code: string }) => p.code));
  });
  test("never hands out a code already in use", () => {
    const seq = ["TAKEN", "TAKEN", "FRESH"];
    const plan = codes.planBatch([contacts[1]], new Map([["x@y.co", [{ code: "TAKEN", isUsed: true }]]]), { now, makeCode: () => seq.shift() });
    expect(plan[0].code).toBe("FRESH");
  });
});

describe("output", () => {
  test("toOutputCsv quotes fields and includes the signup URL", () => {
    const out = codes.toOutputCsv([{ contact: { email: "a@b.co", name: 'A "Q"', school: "St, Mary" }, code: "SCORP-AAAA-BBBB" }], "https://x.test");
    expect(out).toBe('email,name,school,code,signupUrl\na@b.co,"A ""Q""","St, Mary",SCORP-AAAA-BBBB,https://x.test/signup?teacherInvite=SCORP-AAAA-BBBB\n');
  });
  test("defaultOutPath adds a -codes suffix next to the input", () => {
    expect(codes.defaultOutPath("/a/contacts.csv")).toBe("/a/contacts-codes.csv");
    expect(codes.defaultOutPath("list")).toBe("list-codes.csv");
  });
});
