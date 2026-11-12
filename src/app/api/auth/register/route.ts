import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth-verify";
import { enforceRateLimit } from "@/lib/rate-limit";
import { findClassByCode } from "@/lib/class-enrollment";
import { adminDb } from "@/lib/firebase-admin";
import { newOrganizationDefaults } from "@/lib/organization-defaults";
import { errorResponse } from "@/lib/api-errors";
import { ClientError } from "@/lib/client-error";

export async function POST(req: NextRequest) {
  const caller = await authenticateRequest(req);
  if (!caller) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const limited = await enforceRateLimit(req, "register", caller.uid);
  if (limited) return limited;
  try {
    const { role, name, code } = await req.json();
    if (!["teacher", "student"].includes(role) || typeof name !== "string" || !name.trim() || name.length > 120) {
      return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
    }
    const userRef = adminDb.collection("users").doc(caller.uid);
    const normalizedCode = typeof code === "string" ? code.trim() : "";
    if (normalizedCode.includes("/") || normalizedCode.length > 128) throw new ClientError("Invalid code");
    const newOrg = adminDb.collection("organizations").doc();
    await adminDb.runTransaction(async tx => {
      const existing = await tx.get(userRef);
      if (existing.exists) throw new ClientError("Profile already exists; sign in instead");
      const course = role === "student" && normalizedCode ? await findClassByCode(normalizedCode, tx) : null;
      if (role === "student" && normalizedCode && !course) throw new ClientError("A valid class code is required");
      let orgId: string | null = course?.organizationId ?? null;
      let inviteRef;
      if (role === "teacher") {
        if (!normalizedCode) throw new ClientError("A teacher invite code is required");
        inviteRef = adminDb.collection("teacherInviteCodes").doc(normalizedCode.toUpperCase());
        const invite = (await tx.get(inviteRef)).data();
        if (!invite || invite.isUsed || !invite.expiresAt || invite.expiresAt.toDate() <= new Date()) throw new ClientError("Invalid or expired invite code");
        orgId = invite.organizationId || newOrg.id;
        if (invite.organizationId && !(await tx.get(adminDb.collection("organizations").doc(invite.organizationId))).exists) throw new ClientError("Network no longer exists");
        if (invite.organizationId && (await tx.get(adminDb.collection("users").where("organizationId", "==", invite.organizationId).where("role", "==", "teacher").limit(50))).size >= 50) throw new ClientError("Network teacher capacity reached");
      }
      const data = { uid: caller.uid, email: caller.email || "", displayName: name.trim(), role,
        organizationId: orgId, teacherId: course?.teacherId ?? null, courseId: course?.courseId ?? null,
        createdAt: new Date(), lastLoginAt: new Date() };
      if (role === "teacher" && orgId === newOrg.id) tx.set(newOrg, {
        id: orgId, name: `${name.trim()}'s Network`, ownerId: caller.uid, ownerEmail: caller.email || "",
        ...newOrganizationDefaults("register"), createdAt: new Date(),
      });
      if (inviteRef) tx.update(inviteRef, { isUsed: true, usedAt: new Date(), usedBy: caller.uid, usedByEmail: caller.email || "" });
      tx.set(userRef, data);
      tx.set(adminDb.collection(role === "teacher" ? "teachers" : "students").doc(caller.uid), { ...data, name: data.displayName });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, "register");
  }
}
