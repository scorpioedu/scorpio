import { NextRequest, NextResponse } from "next/server";
import { pilotInviteFields } from "@/lib/organization-defaults";
import { adminDb, adminFieldWithValue as FieldValue } from "@/lib/firebase-admin";
import { randomBytes } from "crypto";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { enforceRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { normalizeReferralCode, resolveReferrer } from "@/lib/referral";
import { parseJsonBody, parseValue } from "@/lib/api-schema";
import {
  requestAccessAction,
  requestAccessReviewBody,
  requestAccessSubmitBody,
} from "@/lib/schemas/api-bodies";

function generateCode(): string {
  const segment = () => randomBytes(2).toString("hex").toUpperCase();
  return `SCORP-${segment()}-${segment()}`;
}

async function handleRequestAccess(req: NextRequest) {
  try {
    const envelope = await parseJsonBody(req, z.record(z.string(), z.unknown()));
    if (!envelope.ok) return envelope.response;
    const raw = envelope.data;
    const action = raw.action;
    if (action !== undefined && !requestAccessAction.safeParse(action).success) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    // Note: adminDb is a Proxy — getApp() is called lazily on first property access.
    // Any Firebase Admin init errors will be caught by the outer try/catch below.

    // ─── LIST (admin only) ────────────────────────────────────────────────────
    if (action === "list") {
      // Every pending request, then the newest 200 of any status, so a busy week can never push
      // an unreviewed request off the page. Pending is filtered without orderBy (no index needed).
      const [pendingSnap, recentSnap] = await Promise.all([
        adminDb.collection("accessRequests").where("status", "==", "pending").limit(1000).get(),
        adminDb.collection("accessRequests").orderBy("createdAt", "desc").limit(200).get(),
      ]);
      const seen = new Set<string>();
      const docs = [...pendingSnap.docs, ...recentSnap.docs]
        .filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)))
        .sort(
          (a, b) =>
            (b.data().createdAt?.toMillis?.() ?? 0) - (a.data().createdAt?.toMillis?.() ?? 0),
        );

      const referrerIds = [
        ...new Set(
          docs
            .map((d) => d.data().referredBy)
            .filter((v): v is string => typeof v === "string" && !!v),
        ),
      ];
      const referrerNames = new Map<string, string>();
      if (referrerIds.length) {
        const refs = referrerIds.map((uid) => adminDb.collection("users").doc(uid));
        for (const u of await adminDb.getAll(...refs)) {
          const n = u.data()?.displayName;
          referrerNames.set(u.id, typeof n === "string" && n ? n : "a teacher");
        }
      }

      const requests = docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name,
          email: data.email,
          institution: data.institution,
          role: data.role,
          message: data.message ?? null,
          courses: Array.isArray(data.courses) ? data.courses : [],
          pilotInterest: data.pilotInterest === true,
          status: data.status,
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
          reviewedAt: data.reviewedAt?.toDate?.()?.toISOString() ?? null,
          generatedCode: data.generatedCode ?? null,
          // Set by the onAccessRequestApproved function once the code has been emailed.
          approvalEmailSentAt: data.approvalEmailSentAt?.toDate?.()?.toISOString() ?? null,
          referredByName: data.referredBy ? (referrerNames.get(data.referredBy) ?? null) : null,
        };
      });

      return NextResponse.json({ requests });
    }

    // ─── APPROVE (admin only) — generates invite code + marks request approved ─
    if (action === "approve") {
      const review = parseValue(raw, requestAccessReviewBody, "Missing request id");
      if (!review.ok) return review.response;
      const { id, pilot } = review.data;

      const requestRef = adminDb.collection("accessRequests").doc(id);
      const codeRef = adminDb.collection("teacherInviteCodes").doc(generateCode());
      // One transaction so two concurrent approvals cannot both issue an invite code (G-009).
      const outcome = await adminDb.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
        const reqDoc = await tx.get(requestRef);
        if (!reqDoc.exists) return { status: 404, error: "Request not found" } as const;
        const data = reqDoc.data()!;
        if (data.status !== "pending")
          return { status: 409, error: "Request is not pending" } as const;

        // Generate a teacher invite code labelled with the requester's info
        const code = codeRef.id;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 60); // 60-day expiry for requested codes

        tx.set(codeRef, {
          code,
          label: `${data.name} — ${data.institution}`,
          organizationId: null,
          createdAt: FieldValue.serverTimestamp(),
          expiresAt,
          isUsed: false,
          usedAt: null,
          usedBy: null,
          usedByEmail: null,
          requestId: id,
          ...(data.referredBy ? { referredBy: data.referredBy } : {}),
          ...(pilot ? pilotInviteFields() : {}),
        });
        tx.update(requestRef, {
          status: "approved",
          reviewedAt: FieldValue.serverTimestamp(),
          generatedCode: code,
        });
        return { status: 200, code } as const;
      });
      if ("error" in outcome)
        return NextResponse.json({ error: outcome.error }, { status: outcome.status });
      return NextResponse.json({ success: true, code: outcome.code });
    }

    // ─── REJECT (admin only) ──────────────────────────────────────────────────
    if (action === "reject") {
      const review = parseValue(raw, requestAccessReviewBody, "Missing request id");
      if (!review.ok) return review.response;
      const { id } = review.data;

      const reqDoc = await adminDb.collection("accessRequests").doc(id).get();
      if (!reqDoc.exists) return NextResponse.json({ error: "Request not found" }, { status: 404 });

      await adminDb.collection("accessRequests").doc(id).update({
        status: "rejected",
        reviewedAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true });
    }

    // ─── SUBMIT (public — called from /request-access page) ──────────────────
    const submission = parseValue(raw, requestAccessSubmitBody, "Missing required fields.");
    if (!submission.ok) return submission.response;
    const { name, email, institution, role, message, ref, courses, pilotInterest } =
      submission.data;
    const cleanCourses = [...new Set((courses ?? []).map((c) => c.trim()).filter(Boolean))];

    if (!name?.trim() || !email?.trim() || !institution?.trim() || !role?.trim()) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    // Unknown codes and a teacher referring their own address are ignored rather than rejected.
    const referrer = ref ? await resolveReferrer(ref) : null;
    const referredBy =
      referrer && referrer.email !== email.trim().toLowerCase() ? referrer.uid : null;

    // Duplicate check and insert share one transaction so double-clicks cannot create two pending rows (G-009).
    const created = await adminDb.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
      const existingSnapshot = await tx.get(
        adminDb
          .collection("accessRequests")
          .where("email", "==", email.trim().toLowerCase())
          .where("status", "==", "pending")
          .limit(1),
      );
      if (!existingSnapshot.empty) return false;
      tx.set(adminDb.collection("accessRequests").doc(), {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        institution: institution.trim(),
        role: role.trim(),
        message: message?.trim() || null,
        ...(cleanCourses.length ? { courses: cleanCourses } : {}),
        ...(pilotInterest ? { pilotInterest: true } : {}),
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        reviewedAt: null,
        generatedCode: null,
        ...(referredBy ? { referralCode: normalizeReferralCode(ref), referredBy } : {}),
      });
      return true;
    });
    if (!created) {
      return NextResponse.json(
        { error: "A pending request already exists for this email. We'll be in touch soon." },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[request-access] Error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 },
    );
  }
}

// list, approve and reject require the admin claim; submitting a request stays public.
const ADMIN_ACTIONS = new Set(["list", "approve", "reject"]);
const adminRequestAccess = withAuthorizedRequest(handleRequestAccess, {
  admin: true,
  rateLimit: "write",
});

export async function POST(req: NextRequest) {
  let action: unknown;
  try {
    action = (await req.clone().json())?.action;
  } catch {
    action = undefined;
  }
  if (typeof action === "string" && ADMIN_ACTIONS.has(action)) return adminRequestAccess(req);
  // The public actions are unauthenticated, so they are keyed by the trusted client IP (RT-11).
  const limited = await enforceRateLimit(req, "requestAccess");
  if (limited) return limited;
  return handleRequestAccess(req);
}
