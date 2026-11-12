import { createHash } from "crypto";
import { billingContext } from "./billing-context";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "./firebase-admin";

/** Authenticate before trusting any identifiers supplied by a client. */
export async function authenticateRequest(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  try {
    if (bearer?.startsWith("Bearer ")) {
      return await adminAuth.verifyIdToken(bearer.slice(7), true);
    }
    const session = req.cookies.get("__session")?.value;
    if (!session) return null;
    const token = session.startsWith("{") ? JSON.parse(session).token : session;
    if (typeof token !== "string" || !token) return null;
    return await adminAuth.verifySessionCookie(token, true);
  } catch {
    return null;
  }
}

export async function verifyCallerIdentity(req: NextRequest, expectedUid: string) {
  const caller = await authenticateRequest(req);
  return caller && caller.uid === expectedUid
    ? { authorized: true }
    : { authorized: false, error: "Valid authentication for this account is required" };
}

/** One-way digest so audit records show repeat callers without storing the address. */
function hashIp(req: NextRequest): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown-ip";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/** Records an admin call (RT-06). Throws if the record cannot be written so callers fail closed. */
async function writeAdminAudit(req: NextRequest, uid: string, outcome: "allowed" | "denied") {
  let body: { action?: unknown; collectionName?: unknown } = {};
  try { body = JSON.parse(await req.clone().text()) ?? {}; } catch { /* audit still records route and caller */ }
  await adminDb.collection("admin_audit").add({
    uid,
    route: req.nextUrl.pathname,
    method: req.method,
    action: typeof body.action === "string" ? body.action : null,
    collection: typeof body.collectionName === "string" ? body.collectionName : null,
    outcome,
    ipHash: hashIp(req),
    timestamp: new Date(),
  });
}

type Handler = (req: NextRequest) => Promise<Response>;
export function withAuthorizedRequest(handler: Handler, options: {
  identityField?: string;
  teacher?: boolean;
  /** Requires the verified token to carry the custom claim `admin: true` (see tools/set-admin-claim.cjs). */
  admin?: boolean;
  resource?: "submission" | "portfolio";
} = {}): Handler {
  return async (req) => {
    const caller = await authenticateRequest(req);
    if (!caller) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (options.admin) {
      const isAdmin = caller.admin === true;
      try {
        await writeAdminAudit(req, caller.uid, isAdmin ? "allowed" : "denied");
      } catch {
        return NextResponse.json({ error: "Unable to record audit entry" }, { status: 500 });
      }
      if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    try {
      const raw = await req.clone().text();
      if (Buffer.byteLength(raw) > 500000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
      const body = JSON.parse(raw);
      if (options.identityField && body[options.identityField] !== caller.uid) {
        return NextResponse.json({ error: "Account mismatch" }, { status: 403 });
      }
      const storedProfile = (await adminDb.collection("users").doc(caller.uid).get()).data();
      // An admin-claim operator does not need a classroom profile.
      const profile: FirebaseFirestore.DocumentData | undefined = storedProfile ?? (options.admin ? {} : undefined);
      if (!profile || (options.teacher && profile.role !== "teacher")) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      if (options.resource === "submission") {
        if (typeof body.submissionId !== "string" || body.submissionId.includes("/")) {
          return NextResponse.json({ error: "Invalid submission" }, { status: 400 });
        }
        const submission = (await adminDb.collection("submissions").doc(body.submissionId).get()).data();
        const assignment = submission?.assignmentId
          ? (await adminDb.collection("assignments").doc(submission.assignmentId).get()).data() : null;
        if (!assignment || assignment.teacherId !== caller.uid) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }
      }
      if (options.resource === "portfolio") {
        if (typeof body.studentId !== "string" || body.studentId.includes("/")) {
          return NextResponse.json({ error: "Invalid student" }, { status: 400 });
        }
        const student = (await adminDb.collection("users").doc(body.studentId).get()).data();
        const teacher = student?.teacherId
          ? (await adminDb.collection("users").doc(student.teacherId).get()).data() : null;
        if (!profile.organizationId || body.organizationId !== profile.organizationId ||
            !student || (student.teacherId !== caller.uid && teacher?.organizationId !== profile.organizationId)) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }
      }
      const feature = req.nextUrl.pathname.includes('/student/tutor') ? 'tutor' : req.nextUrl.pathname.includes('/notebook/') ? 'notebook' : options.resource === 'submission' ? 'grading' : options.resource === 'portfolio' ? 'portfolio' : 'navigation';
      let effectiveOrgId = profile.organizationId;
      if (!effectiveOrgId && profile.teacherId) {
        const teacher = (await adminDb.collection("users").doc(profile.teacherId).get()).data();
        if (teacher?.organizationId) {
          effectiveOrgId = teacher.organizationId;
        }
      }
      const execute = () => billingContext.run({ organizationId: effectiveOrgId || '', userId: caller.uid, type: feature }, () => handler(req));
      if (options.resource === "submission") {
        const ref = adminDb.collection("submissions").doc(body.submissionId);
        const lockRef = adminDb.collection("grading_locks").doc(body.submissionId);
        const acquired = await adminDb.runTransaction(async tx => {
          const lock = (await tx.get(lockRef)).data();
          if ((lock?.expiresAt?.toMillis() || 0) > Date.now()) return false;
          tx.set(lockRef, { expiresAt: new Date(Date.now() + 15 * 60 * 1000) });
          return true;
        });
        if (!acquired) return NextResponse.json({ error: "Grading is already in progress" }, { status: 409 });
        try {
          const current = (await ref.get()).data();
          if (current?.graded) return NextResponse.json({ success: true, score: current.score });
          return await execute();
        } finally { await lockRef.delete(); }
      }
      return await execute();
    } catch {
      return NextResponse.json({ error: "Unable to authorize request" }, { status: 400 });
    }
  };
}
