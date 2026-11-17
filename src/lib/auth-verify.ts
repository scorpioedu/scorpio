import { createHash, randomUUID } from "crypto";
import { billingContext } from "./billing-context";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "./firebase-admin";
import { getClientIp } from "./client-ip";
import { enforceRateLimit } from "./rate-limit";
import type { RateLimitKind } from "./rate-limit-config";

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
  const ip = getClientIp(req.headers) ?? "unknown-ip";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/** Records an admin call (RT-06). Throws if the record cannot be written so callers fail closed. */
async function writeAdminAudit(req: NextRequest, uid: string, outcome: "allowed" | "denied") {
  let body: { action?: unknown; collectionName?: unknown } = {};
  try {
    body = JSON.parse(await req.clone().text()) ?? {};
  } catch {
    /* audit still records route and caller */
  }
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

type Caller = NonNullable<Awaited<ReturnType<typeof authenticateRequest>>>;

/** What the wrapper already loaded, so handlers need not re-verify the token or re-read users/{uid}. */
export interface AuthorizedContext {
  caller: Caller;
  /** users/{uid}; `{}` for an admin-claim operator without a classroom profile. */
  profile: FirebaseFirestore.DocumentData;
  /** The caller's organization, inherited from their teacher when they have none; "" when none. */
  organizationId: string;
  /** Parsed JSON body (`{}` when the request body was empty). */
  body: Record<string, unknown>;
  requestId: string;
}

type Handler = (req: NextRequest) => Promise<Response>;
type AuthorizedHandler = (req: NextRequest, context: AuthorizedContext) => Promise<Response>;

function internalError(requestId: string, error: unknown, what: string): NextResponse {
  console.error(
    `[auth-verify] ${what} (requestId=${requestId}):`,
    error instanceof Error ? error.message : error,
  );
  return NextResponse.json({ error: "Internal server error", requestId }, { status: 500 });
}

/** Handlers that call req.json() themselves must see `{}` rather than throw on an empty body. */
function withBody(req: NextRequest, raw: string): NextRequest {
  // GET/HEAD requests cannot carry a body; their handlers read the query string instead.
  if (raw.trim() || req.method === "GET" || req.method === "HEAD") return req;
  const headers = new Headers(req.headers);
  headers.delete("content-length");
  return new NextRequest(req.url, { method: req.method, headers, body: "{}" });
}

export function withAuthorizedRequest(
  handler: AuthorizedHandler,
  options: {
    identityField?: string;
    teacher?: boolean;
    /** Requires the verified token to carry the custom claim `admin: true` (see tools/set-admin-claim.cjs). */
    admin?: boolean;
    resource?: "submission" | "portfolio";
    /** Billing/usage feature recorded for AI calls. Defaults to the resource kind, else "navigation". */
    feature?: string;
    /** Per-uid budget from rate-limit-config.ts, charged after authentication and before any other work. */
    rateLimit?: RateLimitKind;
  } = {},
): Handler {
  return async (req) => {
    const requestId = randomUUID();
    const caller = await authenticateRequest(req);
    if (!caller) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (options.rateLimit) {
      const limited = await enforceRateLimit(req, options.rateLimit, caller.uid);
      if (limited) return limited;
    }
    if (options.admin) {
      const isAdmin = caller.admin === true;
      try {
        await writeAdminAudit(req, caller.uid, isAdmin ? "allowed" : "denied");
      } catch {
        return NextResponse.json({ error: "Unable to record audit entry" }, { status: 500 });
      }
      if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    // Authorisation phase: unexpected failures here are server errors, not client mistakes.
    let context: AuthorizedContext;
    let handlerReq: NextRequest;
    try {
      const raw = await req.clone().text();
      if (Buffer.byteLength(raw) > 500000)
        return NextResponse.json({ error: "Request too large" }, { status: 413 });
      let parsed: unknown = {};
      if (raw.trim()) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
        }
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
      }
      const body = parsed as Record<string, unknown>;
      handlerReq = withBody(req, raw);
      if (options.identityField && body[options.identityField] !== caller.uid) {
        return NextResponse.json({ error: "Account mismatch" }, { status: 403 });
      }
      const storedProfile = (await adminDb.collection("users").doc(caller.uid).get()).data();
      // An admin-claim operator does not need a classroom profile.
      const profile: FirebaseFirestore.DocumentData | undefined =
        storedProfile ?? (options.admin ? {} : undefined);
      if (!profile || (options.teacher && profile.role !== "teacher")) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      if (options.resource === "submission") {
        if (typeof body.submissionId !== "string" || body.submissionId.includes("/")) {
          return NextResponse.json({ error: "Invalid submission" }, { status: 400 });
        }
        const submission = (
          await adminDb.collection("submissions").doc(body.submissionId).get()
        ).data();
        const assignment = submission?.assignmentId
          ? (await adminDb.collection("assignments").doc(submission.assignmentId).get()).data()
          : null;
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
          ? (await adminDb.collection("users").doc(student.teacherId).get()).data()
          : null;
        if (
          !profile.organizationId ||
          body.organizationId !== profile.organizationId ||
          !student ||
          (student.teacherId !== caller.uid && teacher?.organizationId !== profile.organizationId)
        ) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }
      }
      let effectiveOrgId = profile.organizationId;
      if (!effectiveOrgId && profile.teacherId) {
        const teacher = (await adminDb.collection("users").doc(profile.teacherId).get()).data();
        if (teacher?.organizationId) {
          effectiveOrgId = teacher.organizationId;
        }
      }
      context = { caller, profile, organizationId: effectiveOrgId || "", body, requestId };
    } catch (error) {
      return internalError(requestId, error, "authorization failed");
    }

    const feature =
      options.feature ??
      (options.resource === "submission"
        ? "grading"
        : options.resource === "portfolio"
          ? "portfolio"
          : "navigation");
    // Exceptions thrown by the handler are the route's fault (500), never an authorisation failure (400).
    const execute = async () => {
      try {
        return await billingContext.run(
          { organizationId: context.organizationId, userId: caller.uid, type: feature },
          () => handler(handlerReq, context),
        );
      } catch (error) {
        return internalError(requestId, error, "handler threw");
      }
    };
    if (options.resource !== "submission") return execute();

    const submissionId = context.body.submissionId as string;
    try {
      const ref = adminDb.collection("submissions").doc(submissionId);
      const lockRef = adminDb.collection("grading_locks").doc(submissionId);
      const acquired = await adminDb.runTransaction(async (tx) => {
        const lock = (await tx.get(lockRef)).data();
        if ((lock?.expiresAt?.toMillis() || 0) > Date.now()) return false;
        tx.set(lockRef, { expiresAt: new Date(Date.now() + 15 * 60 * 1000) });
        return true;
      });
      if (!acquired)
        return NextResponse.json({ error: "Grading is already in progress" }, { status: 409 });
      try {
        const current = (await ref.get()).data();
        if (current?.graded) return NextResponse.json({ success: true, score: current.score });
        return await execute();
      } finally {
        await lockRef.delete();
      }
    } catch (error) {
      return internalError(requestId, error, "grading lock failed");
    }
  };
}
