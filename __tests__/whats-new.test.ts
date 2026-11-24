import { unseenWhatsNew, WHATS_NEW, type WhatsNewEntry } from "../src/lib/whats-new";

const entries: WhatsNewEntry[] = [
  { id: "c", date: "2026-12-10", title: "C", items: [] },
  { id: "b", date: "2026-11-23", title: "B", items: [] },
  { id: "a", date: "2026-10-01", title: "A", items: [] },
];
const ids = (list: WhatsNewEntry[]) => list.map((e) => e.id);

describe("unseenWhatsNew", () => {
  test("an existing teacher who dismissed nothing sees every entry, newest first", () => {
    expect(ids(unseenWhatsNew(undefined, new Date("2026-01-01T00:00:00Z"), entries))).toEqual(["c", "b", "a"]);
  });

  test("only entries newer than the dismissed one show", () => {
    expect(ids(unseenWhatsNew("b", new Date("2026-01-01T00:00:00Z"), entries))).toEqual(["c"]);
    expect(ids(unseenWhatsNew("c", new Date("2026-01-01T00:00:00Z"), entries))).toEqual([]);
  });

  test("an unknown dismissed id counts as nothing seen", () => {
    expect(ids(unseenWhatsNew("gone", new Date("2026-01-01T00:00:00Z"), entries))).toEqual(["c", "b", "a"]);
  });

  test("entries that shipped before the account existed are skipped", () => {
    expect(ids(unseenWhatsNew(undefined, new Date("2026-11-24T08:00:00Z"), entries))).toEqual(["c"]);
  });

  test("an account created on the day an entry shipped still sees it", () => {
    expect(ids(unseenWhatsNew(undefined, new Date("2026-11-23T20:00:00Z"), entries))).toEqual(["c", "b"]);
  });

  test("accepts Firestore-like timestamps and a missing creation date", () => {
    const ts = { toMillis: () => Date.parse("2026-11-24T08:00:00Z") };
    expect(ids(unseenWhatsNew(undefined, ts, entries))).toEqual(["c"]);
    expect(ids(unseenWhatsNew(undefined, null, entries))).toEqual(["c", "b", "a"]);
  });
});

describe("WHATS_NEW", () => {
  test("ids are unique and entries are newest first", () => {
    expect(new Set(WHATS_NEW.map((e) => e.id)).size).toBe(WHATS_NEW.length);
    const dates = WHATS_NEW.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const e of WHATS_NEW) expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
