import { createHash } from "crypto";
import { adminDb } from "@/lib/firebase-admin";

/** A teacher's referral code: 8 characters derived from their uid. Not secret; it only attributes a signup. */
export function referralCodeFor(uid: string): string {
  return createHash("sha256")
    .update(`scorpio-referral:${uid}`)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
}

export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{6,16}$/.test(code) ? code : null;
}

/** The teacher who owns this code, or null for unknown codes. */
export async function resolveReferrer(
  raw: unknown,
): Promise<{ uid: string; email: string | null } | null> {
  const code = normalizeReferralCode(raw);
  if (!code) return null;
  const snap = await adminDb
    .collection("users")
    .where("referralCode", "==", code)
    .where("role", "==", "teacher")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const email = snap.docs[0].data().email;
  return { uid: snap.docs[0].id, email: typeof email === "string" ? email.toLowerCase() : null };
}
