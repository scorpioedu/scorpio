/**
 * Pure aggregation for the admin console. The API routes read Firestore with the Admin SDK and hand
 * the raw rows here, so the numbers do not depend on client security rules (an admin is rarely a
 * member of the organization they are looking at) and can be unit tested.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Firestore Timestamp, Date, ISO string or epoch millis → millis, else null. */
export function toMillis(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === "object") {
    const v = value as { toMillis?: () => number; _seconds?: number; seconds?: number };
    if (typeof v.toMillis === "function") return v.toMillis();
    const secs = v._seconds ?? v.seconds;
    if (typeof secs === "number") return secs * 1000;
  }
  return null;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  role?: unknown;
  organizationId?: unknown;
  teacherId?: unknown;
  createdAt?: unknown;
  lastLoginAt?: unknown;
}

export interface OrgRow {
  id: string;
  name?: unknown;
  planId?: unknown;
}

export interface OrgUserCount {
  id: string;
  name: string;
  planId: string;
  teachers: number;
  students: number;
}

export interface UserSummary {
  total: number;
  teachers: number;
  students: number;
  other: number;
  newLast7d: number;
  newLast30d: number;
  activeLast7d: number;
  /** Teachers and students with no organization, own or inherited from their teacher. */
  unaffiliated: { teachers: number; students: number };
  organizations: OrgUserCount[];
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function summariseUsers(users: UserRow[], orgs: OrgRow[], now = Date.now()): UserSummary {
  const orgMap = new Map<string, OrgUserCount>();
  for (const o of orgs) {
    orgMap.set(o.id, {
      id: o.id,
      name: str(o.name) ?? o.id,
      planId: str(o.planId) ?? "free",
      teachers: 0,
      students: 0,
    });
  }

  // Students often carry only teacherId; their organization is inherited from the teacher.
  const teacherOrg = new Map<string, string | null>();
  for (const u of users) if (u.role === "teacher") teacherOrg.set(u.id, str(u.organizationId));

  const summary: UserSummary = {
    total: users.length,
    teachers: 0,
    students: 0,
    other: 0,
    newLast7d: 0,
    newLast30d: 0,
    activeLast7d: 0,
    unaffiliated: { teachers: 0, students: 0 },
    organizations: [],
  };

  for (const u of users) {
    const created = toMillis(u.createdAt);
    if (created != null && now - created <= 7 * DAY_MS) summary.newLast7d += 1;
    if (created != null && now - created <= 30 * DAY_MS) summary.newLast30d += 1;
    const login = toMillis(u.lastLoginAt);
    if (login != null && now - login <= 7 * DAY_MS) summary.activeLast7d += 1;

    const isTeacher = u.role === "teacher";
    const isStudent = u.role === "student";
    if (isTeacher) summary.teachers += 1;
    else if (isStudent) summary.students += 1;
    else summary.other += 1;
    if (!isTeacher && !isStudent) continue;

    const teacherId = str(u.teacherId);
    const orgId =
      str(u.organizationId) ??
      (isStudent && teacherId ? (teacherOrg.get(teacherId) ?? null) : null);
    if (!orgId) {
      if (isTeacher) summary.unaffiliated.teachers += 1;
      else summary.unaffiliated.students += 1;
      continue;
    }
    let row = orgMap.get(orgId);
    if (!row) {
      // A user points at an organization document that no longer exists; still count them.
      row = { id: orgId, name: orgId, planId: "unknown", teachers: 0, students: 0 };
      orgMap.set(orgId, row);
    }
    if (isTeacher) row.teachers += 1;
    else row.students += 1;
  }

  summary.organizations = [...orgMap.values()].sort(
    (a, b) => b.teachers + b.students - (a.teachers + a.students) || a.name.localeCompare(b.name),
  );
  return summary;
}

// ─── AI usage ────────────────────────────────────────────────────────────────

export interface UsageRow {
  organizationId?: unknown;
  userId?: unknown;
  type?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
  costCents?: unknown;
  timestamp?: unknown;
}

export interface UsageDay {
  /** YYYY-MM-DD (UTC). */
  date: string;
  events: number;
  costCents: number;
}

export interface UsageSummary {
  days: number;
  events: number;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  activeUsers: number;
  /** One entry per day in the window, oldest first, zero-filled. */
  daily: UsageDay[];
  byType: Array<{ type: string; events: number; costCents: number }>;
  byOrganization: Array<{ id: string; name: string; events: number; costCents: number }>;
  /** True when the row cap was hit, so totals may undercount the window. */
  truncated: boolean;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function summariseUsage(
  rows: UsageRow[],
  options: { days: number; orgNames?: Map<string, string>; truncated?: boolean; now?: number },
): UsageSummary {
  const now = options.now ?? Date.now();
  const since = now - options.days * DAY_MS;
  const daily = new Map<string, UsageDay>();
  for (let i = options.days - 1; i >= 0; i--) {
    const key = dayKey(now - i * DAY_MS);
    daily.set(key, { date: key, events: 0, costCents: 0 });
  }
  const byType = new Map<string, { type: string; events: number; costCents: number }>();
  const byOrg = new Map<string, { id: string; name: string; events: number; costCents: number }>();
  const users = new Set<string>();
  const out: UsageSummary = {
    days: options.days,
    events: 0,
    costCents: 0,
    inputTokens: 0,
    outputTokens: 0,
    activeUsers: 0,
    daily: [],
    byType: [],
    byOrganization: [],
    truncated: options.truncated ?? false,
  };

  for (const r of rows) {
    const t = toMillis(r.timestamp);
    if (t == null || t < since || t > now) continue;
    const cost = num(r.costCents);
    out.events += 1;
    out.costCents += cost;
    out.inputTokens += num(r.inputTokens);
    out.outputTokens += num(r.outputTokens);
    const uid = str(r.userId);
    if (uid) users.add(uid);

    const d = daily.get(dayKey(t));
    if (d) {
      d.events += 1;
      d.costCents += cost;
    }
    const type = str(r.type) ?? "other";
    const ty = byType.get(type) ?? { type, events: 0, costCents: 0 };
    ty.events += 1;
    ty.costCents += cost;
    byType.set(type, ty);

    const orgId = str(r.organizationId) ?? "none";
    const og = byOrg.get(orgId) ?? {
      id: orgId,
      name: orgId === "none" ? "No organization" : (options.orgNames?.get(orgId) ?? orgId),
      events: 0,
      costCents: 0,
    };
    og.events += 1;
    og.costCents += cost;
    byOrg.set(orgId, og);
  }

  out.activeUsers = users.size;
  out.daily = [...daily.values()];
  out.byType = [...byType.values()].sort((a, b) => b.events - a.events);
  out.byOrganization = [...byOrg.values()].sort(
    (a, b) => b.costCents - a.costCents || b.events - a.events,
  );
  return out;
}
