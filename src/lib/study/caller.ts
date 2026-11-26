// The optional caller of a Study route: Study's practice works signed out, and records progress
// only for a signed-in student.
import type { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";

export interface StudyCaller {
  uid: string;
  role: string | null;
  name: string;
}

export async function studyCaller(req: NextRequest): Promise<StudyCaller | null> {
  const caller = await authenticateRequest(req);
  if (!caller) return null;
  const profile = (await adminDb.collection("users").doc(caller.uid).get()).data() ?? {};
  return {
    uid: caller.uid,
    role: typeof profile.role === "string" ? profile.role : null,
    name:
      typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : "A student",
  };
}
