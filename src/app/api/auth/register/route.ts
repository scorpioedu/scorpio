import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth-verify";
import { enforceRateLimit } from "@/lib/rate-limit";
import { findClassByCode } from "@/lib/class-enrollment";
import { adminDb } from "@/lib/firebase-admin";
import {
  newOrganizationDefaults,
  pilotOrganizationFields,
  DEFAULT_PILOT_BUDGET_CENTS,
  type PilotGrant,
} from "@/lib/organization-defaults";
import { errorResponse } from "@/lib/api-errors";
import { ClientError } from "@/lib/client-error";
import { parseJsonBody } from "@/lib/api-schema";
import { registerBody } from "@/lib/schemas/api-bodies";

export async function POST(req: NextRequest) {
  const caller = await authenticateRequest(req);
  if (!caller) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const limited = await enforceRateLimit(req, "register", caller.uid);
  if (limited) return limited;
  try {
    const parsed = await parseJsonBody(req, registerBody, { message: "Invalid profile" });
    if (!parsed.ok) return parsed.response;
    const { role, name, code } = parsed.data;
    const userRef = adminDb.collection("users").doc(caller.uid);
    const normalizedCode = code?.trim() ?? "";
    if (normalizedCode.includes("/") || normalizedCode.length > 128)
      throw new ClientError("Invalid code");
    const newOrg = adminDb.collection("organizations").doc();
    await adminDb.runTransaction(async (tx) => {
      const existing = await tx.get(userRef);
      if (existing.exists) throw new ClientError("Profile already exists; sign in instead");
      const course =
        role === "student" && normalizedCode ? await findClassByCode(normalizedCode, tx) : null;
      if (role === "student" && normalizedCode && !course)
        throw new ClientError(
          "That class code doesn't match a class. Check it with your teacher, or clear the field and join from Home later.",
        );
      let orgId: string | null = course?.organizationId ?? null;
      let inviteRef;
      let attribution: Record<string, unknown> | null = null;
      let pilotGrant: PilotGrant | null = null;
      if (role === "teacher") {
        if (!normalizedCode) throw new ClientError("A teacher invite code is required");
        inviteRef = adminDb.collection("teacherInviteCodes").doc(normalizedCode.toUpperCase());
        const invite = (await tx.get(inviteRef)).data();
        if (
          !invite ||
          invite.isUsed ||
          !invite.expiresAt ||
          invite.expiresAt.toDate() <= new Date()
        )
          throw new ClientError("Invalid or expired invite code");
        orgId = invite.organizationId || newOrg.id;
        // A pilot invite makes the teacher's new network a pilot from the start (admin "Create pilot invite").
        if (!invite.organizationId && invite.isPilot === true && invite.pilot)
          pilotGrant = invite.pilot as PilotGrant;
        // Server-managed: which outreach email/campaign this teacher came from. Clients cannot write it (firestore.rules).
        attribution = {
          code: inviteRef.id,
          contactEmail: invite.contactEmail ?? null,
          label: invite.label ?? null,
          redeemedAt: new Date(),
          // Who referred this teacher: an approved access request's referrer, else the owner who made a
          // network colleague code. Admin pilot codes also carry createdBy, so it counts only with a network.
          referredBy: invite.referredBy ?? (invite.organizationId ? invite.createdBy : null) ?? null,
        };
        if (
          invite.organizationId &&
          !(await tx.get(adminDb.collection("organizations").doc(invite.organizationId))).exists
        )
          throw new ClientError("Network no longer exists");
        if (
          invite.organizationId &&
          (
            await tx.get(
              adminDb
                .collection("users")
                .where("organizationId", "==", invite.organizationId)
                .where("role", "==", "teacher")
                .limit(50),
            )
          ).size >= 50
        )
          throw new ClientError("Network teacher capacity reached");
      }
      const data = {
        uid: caller.uid,
        email: caller.email || "",
        displayName: name.trim(),
        role,
        organizationId: orgId,
        teacherId: course?.teacherId ?? null,
        courseId: course?.courseId ?? null,
        ...(course ? { joinedClassAt: new Date() } : {}),
        createdAt: new Date(),
        lastLoginAt: new Date(),
        ...(attribution ? { invite: attribution } : {}),
      };
      if (role === "teacher" && orgId === newOrg.id)
        tx.set(newOrg, {
          id: orgId,
          name: `${name.trim()}'s Network`,
          ownerId: caller.uid,
          ownerEmail: caller.email || "",
          ...newOrganizationDefaults("register"),
          ...(pilotGrant ? pilotOrganizationFields(pilotGrant, "invite") : {}),
          createdAt: new Date(),
        });
      if (role === "teacher" && orgId === newOrg.id && pilotGrant) {
        // Pilot AI arrives as bonus credit (set on the new network above); record it in the ledger.
        const cents = pilotGrant.budgetCents ?? DEFAULT_PILOT_BUDGET_CENTS;
        tx.create(newOrg.collection("credit_ledger").doc(), {
          kind: "admin",
          bucket: "bonus",
          cents,
          reason: "Pilot AI credit",
          externalId: null,
          actorUid: null,
          meta: { source: "pilot-invite" },
          createdAt: new Date(),
        });
      }
      if (inviteRef)
        tx.update(inviteRef, {
          isUsed: true,
          usedAt: new Date(),
          usedBy: caller.uid,
          usedByEmail: caller.email || "",
        });
      tx.set(userRef, data);
      tx.set(adminDb.collection(role === "teacher" ? "teachers" : "students").doc(caller.uid), {
        ...data,
        name: data.displayName,
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, "register");
  }
}
