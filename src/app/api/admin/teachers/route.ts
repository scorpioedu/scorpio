import { NextRequest, NextResponse } from "next/server";
import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";

type AuthMeta = {
  createdAt: string | null;
  lastSignInAt: string | null;
  lastActiveAt: string | null;
  disabled: boolean;
};

const isoOf = (v: string | undefined | null) => (v ? new Date(v).toISOString() : null);
const tsIso = (v: unknown): string | null => {
  const d =
    v && typeof (v as { toDate?: () => Date }).toDate === "function"
      ? (v as { toDate: () => Date }).toDate()
      : v instanceof Date
        ? v
        : null;
  return d ? d.toISOString() : null;
};

/** Every Firebase Auth account, keyed by uid. Small app: listUsers pages of 1000 are fine. */
async function allAuthUsers() {
  const out = new Map<string, AuthMeta & { email: string; name: string }>();
  let pageToken: string | undefined;
  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    for (const u of page.users) {
      out.set(u.uid, {
        email: u.email ?? "",
        name: u.displayName ?? "",
        createdAt: isoOf(u.metadata.creationTime),
        lastSignInAt: isoOf(u.metadata.lastSignInTime),
        // Refreshes happen while a session is open, so this is the best "last active" signal.
        lastActiveAt: isoOf(u.metadata.lastRefreshTime ?? u.metadata.lastSignInTime),
        disabled: u.disabled,
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return out;
}

/**
 * GET /api/admin/teachers : every teacher with their network, plan, student count and sign-in times,
 * plus Auth accounts that never finished signup (no users/{uid} profile).
 * GET /api/admin/teachers?email=x : where one person stands (no account / no profile / teacher / student).
 */
async function handleTeachers(req: NextRequest, { requestId }: AuthorizedContext) {
  try {
    const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();
    if (email) return NextResponse.json(await lookup(email));

    const [auth, usersSnap, orgsSnap] = await Promise.all([
      allAuthUsers(),
      adminDb
        .collection("users")
        .select(
          "role",
          "organizationId",
          "teacherId",
          "displayName",
          "email",
          "createdAt",
          "invite",
        )
        .get(),
      adminDb
        .collection("organizations")
        .select("name", "planId", "pilot", "ownerId", "aiBudgetLimit", "aiUsageCurrent")
        .get(),
    ]);

    const orgs = new Map(orgsSnap.docs.map((d) => [d.id, d.data()]));
    const studentsByTeacher = new Map<string, number>();
    const profiles = new Set<string>();
    for (const d of usersSnap.docs) {
      profiles.add(d.id);
      const u = d.data();
      if (u.role === "student" && u.teacherId)
        studentsByTeacher.set(u.teacherId, (studentsByTeacher.get(u.teacherId) ?? 0) + 1);
    }

    const teachers = usersSnap.docs
      .filter((d) => d.data().role === "teacher")
      .map((d) => {
        const u = d.data();
        const org = u.organizationId ? orgs.get(u.organizationId) : undefined;
        const a = auth.get(d.id);
        return {
          uid: d.id,
          name: u.displayName ?? a?.name ?? "",
          email: u.email || a?.email || "",
          organizationId: u.organizationId ?? null,
          networkName: org?.name ?? null,
          isOwner: !!org && org.ownerId === d.id,
          planId: org ? (org.planId ?? "free") : null,
          pilotStatus: org?.pilot?.status ?? null,
          aiBudgetLimit: org?.aiBudgetLimit ?? null,
          aiUsageCurrent: org?.aiUsageCurrent ?? null,
          students: studentsByTeacher.get(d.id) ?? 0,
          inviteCode: u.invite?.code ?? null,
          inviteLabel: u.invite?.label ?? null,
          signedUpAt: tsIso(u.createdAt) ?? a?.createdAt ?? null,
          lastSignInAt: a?.lastSignInAt ?? null,
          lastActiveAt: a?.lastActiveAt ?? null,
          hasAuthAccount: !!a,
          disabled: a?.disabled ?? false,
        };
      })
      .sort((x, y) => String(y.lastActiveAt).localeCompare(String(x.lastActiveAt)));

    const incomplete = [...auth.entries()]
      .filter(([uid]) => !profiles.has(uid))
      .map(([uid, a]) => ({ uid, ...a }))
      .sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));

    return NextResponse.json({ teachers, incomplete, generatedAt: new Date().toISOString() });
  } catch (error) {
    return errorResponse(error, "admin/teachers", requestId);
  }
}

async function lookup(email: string) {
  let user;
  try {
    user = await adminAuth.getUserByEmail(email);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") {
      const invites = await adminDb
        .collection("teacherInviteCodes")
        .where("contactEmail", "==", email)
        .get();
      return {
        email,
        status: "no_account" as const,
        invites: invites.docs.map((d) => ({
          code: d.id,
          isUsed: !!d.data().isUsed,
          isPilot: d.data().isPilot === true,
          expiresAt: tsIso(d.data().expiresAt),
        })),
      };
    }
    throw error;
  }
  const meta = {
    uid: user.uid,
    createdAt: isoOf(user.metadata.creationTime),
    lastSignInAt: isoOf(user.metadata.lastSignInTime),
    lastActiveAt: isoOf(user.metadata.lastRefreshTime ?? user.metadata.lastSignInTime),
  };
  const profile = (await adminDb.collection("users").doc(user.uid).get()).data();
  if (!profile) return { email, status: "no_profile" as const, ...meta };
  if (!profile.organizationId)
    return { email, status: "no_network" as const, role: profile.role, ...meta };
  const org = (await adminDb.collection("organizations").doc(profile.organizationId).get()).data();
  return {
    email,
    status: profile.role === "teacher" ? ("teacher" as const) : ("other_role" as const),
    role: profile.role,
    organizationId: profile.organizationId,
    networkName: org?.name ?? null,
    planId: org?.planId ?? "free",
    pilotStatus: org?.pilot?.status ?? null,
    ...meta,
  };
}

export const GET = withAuthorizedRequest(handleTeachers, { admin: true, rateLimit: "write" });
