import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/api-schema";
import { sessionBody } from "@/lib/schemas/api-bodies";

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin)
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const parsed = await parseJsonBody(req, sessionBody, {
      message: "Invalid session credentials",
    });
    if (!parsed.ok)
      return NextResponse.json({ error: "Invalid session credentials" }, { status: 401 });
    const { idToken } = parsed.data;
    const token = await adminAuth.verifyIdToken(idToken, true);
    const limited = await enforceRateLimit(req, "session", token.uid);
    if (limited) return limited;
    const profile = (await adminDb.collection("users").doc(token.uid).get()).data();
    if (!profile || !["teacher", "student"].includes(profile.role))
      return NextResponse.json({ error: "Complete registration first" }, { status: 403 });
    // Roles and enrollment come exclusively from the server-managed profile.
    const expiresIn = 5 * 24 * 60 * 60 * 1000;
    const session = await adminAuth.createSessionCookie(idToken, { expiresIn });
    (await cookies()).set("__session", session, {
      maxAge: expiresIn / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    // Readable hint (not auth) so the landing page can send signed-in students to their portal.
    (await cookies()).set("scorpio_role", profile.role, {
      maxAge: expiresIn / 1000,
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    // The app posts here every time it opens (auth-context), so this is "last opened the app".
    // Hourly at most: the client re-posts whenever the profile document changes, and an
    // unconditional write here would make that a loop. Best effort; never blocks sign-in.
    const last = profile.lastLoginAt?.toMillis?.() ?? 0;
    if (Date.now() - last > 60 * 60 * 1000)
      await adminDb
        .collection("users")
        .doc(token.uid)
        .update({ lastLoginAt: new Date() })
        .catch(() => {});
    return NextResponse.json({ status: "success", role: profile.role });
  } catch {
    return NextResponse.json({ error: "Invalid session credentials" }, { status: 401 });
  }
}
export async function DELETE() {
  (await cookies()).delete("__session");
  (await cookies()).delete("scorpio_role");
  return NextResponse.json({ status: "success" });
}
