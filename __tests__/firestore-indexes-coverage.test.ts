/**
 * D-007 / RT-30: static "query coverage" check for firestore.indexes.json.
 *
 * This is a STATIC check, not a behavioural one. The Firestore emulator does not enforce composite
 * indexes (a query that would fail in production runs fine locally), so we cannot prove an index is
 * needed by running the query. Instead QUERIES below is a hand-maintained table of every composite-shaped
 * Firestore query in src/ and functions/src (found by scanning for where()/orderBy()), and the test
 * asserts that firestore.indexes.json covers each one. When you add a query with two or more filters, or
 * an equality filter plus a range/orderBy on another field, add a row here; the test then fails until the
 * index exists.
 *
 * Two kinds of requirement:
 *  - "required":    equality/`in` filters plus a range or orderBy on a different field. Production rejects
 *                   the query without a composite index (equality fields first in any order, then the
 *                   range/orderBy fields in query order, with matching direction).
 *  - "recommended": two or more equality/`in` filters and no ordering. Firestore can merge single-field
 *                   indexes, but a composite avoids index-merge limits (D-007 asks for them). The index
 *                   must contain exactly those fields; equality order is irrelevant.
 * Queries with a single filter or a lone orderBy use automatic single-field indexes and are not listed.
 */
import * as fs from "fs";
import * as path from "path";

type Dir = "ASCENDING" | "DESCENDING";
interface Q {
  collection: string;
  /** equality and `in` filters */
  eq: string[];
  /** range filter and/or orderBy fields, in query order */
  order?: { field: string; dir: Dir }[];
  kind: "required" | "recommended";
  where: string;
}

const A: Dir = "ASCENDING";
const D: Dir = "DESCENDING";

const QUERIES: Q[] = [
  // --- required (equality + order/range) ---
  { collection: "resources", eq: ["teacherId"], order: [{ field: "createdAt", dir: D }], kind: "required", where: "src/app/student/resources/page.tsx, src/app/teacher/uploads/page.tsx" },
  { collection: "assignments", eq: ["teacherId"], order: [{ field: "createdAt", dir: D }], kind: "required", where: "src/app/teacher/page-client.tsx" },
  { collection: "courses", eq: ["teacherId"], order: [{ field: "createdAt", dir: D }], kind: "required", where: "index predates audit (courses sorted by createdAt)" },
  { collection: "tutor_sessions", eq: ["studentId"], order: [{ field: "updatedAt", dir: D }], kind: "required", where: "src/app/api/student/tutor/route.ts, src/app/api/teacher/network/portfolio/route.ts" },
  { collection: "usage_analytics", eq: ["organizationId"], order: [{ field: "timestamp", dir: D }], kind: "required", where: "src/components/admin/usage-analytics.tsx" },
  { collection: "submissions", eq: ["status"], order: [{ field: "submittedAt", dir: A }], kind: "required", where: "functions/src/grading-runner.ts (RT-05)" },
  { collection: "ai_reservations", eq: ["status"], order: [{ field: "createdAt", dir: A }], kind: "required", where: "functions/src/metering.ts (RT-04)" },
  // --- recommended (multiple equality / in filters) ---
  { collection: "assignments", eq: ["visibility", "organizationId"], kind: "recommended", where: "src/app/teacher/waypoints/page.tsx" },
  { collection: "assignments", eq: ["visibility", "topic"], kind: "recommended", where: "src/app/teacher/waypoints/page.tsx" },
  { collection: "assignments", eq: ["visibility", "organizationId", "topic"], kind: "recommended", where: "src/app/teacher/waypoints/page.tsx" },
  { collection: "users", eq: ["courseId", "role"], kind: "recommended", where: "teacher/page-client.tsx, teacher/students/page.tsx (in), teacher/grades/page.tsx (==)" },
  { collection: "users", eq: ["teacherId", "role"], kind: "recommended", where: "components/teacher/network-students.tsx, teacher/network/page.tsx, api/chat/limits, api/grade, api/student/tutor, functions/src/grading.ts, functions/src/index.ts" },
  { collection: "users", eq: ["organizationId", "role"], kind: "recommended", where: "teacher/network/page.tsx, teacher/students/page.tsx, api/auth/register, api/teacher/network/membership, api/chat/limits" },
  { collection: "submissions", eq: ["studentId", "assignmentId"], kind: "recommended", where: "teacher/grades/student/page.tsx (in), student/assignment-view/page.tsx (==)" },
  { collection: "assignments", eq: ["answerKeySeparated", "courseId"], kind: "recommended", where: "student/assignments/page.tsx, student/page-client.tsx" },
  { collection: "assignments", eq: ["answerKeySeparated", "teacherId", "courseId"], kind: "recommended", where: "student/assignments/page.tsx, student/page-client.tsx" },
  { collection: "courses", eq: ["teacherId", "code"], kind: "recommended", where: "src/app/teacher/students/page.tsx" },
  { collection: "accessRequests", eq: ["email", "status"], kind: "recommended", where: "src/app/api/auth/request-access/route.ts" },
];

interface IndexField { fieldPath: string; order: Dir }
interface IndexDef { collectionGroup: string; queryScope: string; fields: IndexField[] }

const indexes: IndexDef[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "firestore.indexes.json"), "utf8")
).indexes;

function covers(index: IndexDef, q: Q): boolean {
  if (index.collectionGroup !== q.collection || index.queryScope !== "COLLECTION") return false;
  const fields = index.fields;
  const order = q.order ?? [];
  if (fields.length !== q.eq.length + order.length) return false;
  const head = fields.slice(0, q.eq.length).map((f) => f.fieldPath).sort();
  if (JSON.stringify(head) !== JSON.stringify([...q.eq].sort())) return false;
  return order.every((o, i) => {
    const f = fields[q.eq.length + i];
    return f.fieldPath === o.field && f.order === o.dir;
  });
}

describe("firestore.indexes.json query coverage (static; the emulator does not enforce indexes)", () => {
  test.each(QUERIES.map((q) => [`${q.collection} [${q.eq.join(",")}${q.order ? " | " + q.order.map((o) => o.field + " " + o.dir).join(",") : ""}] (${q.kind})`, q] as const))(
    "has a composite index for %s",
    (_name, q) => {
      expect(indexes.some((i) => covers(i, q))).toBe(true);
    }
  );

  test("every index is collection-scoped, has at least two fields and is unique", () => {
    const seen = new Set<string>();
    for (const i of indexes) {
      expect(i.queryScope).toBe("COLLECTION");
      expect(i.fields.length).toBeGreaterThanOrEqual(2);
      const key = `${i.collectionGroup}:${i.fields.map((f) => f.fieldPath + f.order).join(",")}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test("RT-04 and RT-05 indexes are kept", () => {
    expect(indexes.some((i) => covers(i, QUERIES.find((q) => q.collection === "ai_reservations")!))).toBe(true);
    expect(indexes.some((i) => covers(i, QUERIES.find((q) => q.collection === "submissions" && q.kind === "required")!))).toBe(true);
  });
});
