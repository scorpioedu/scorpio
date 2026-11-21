import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";

/** POST /api/teacher/pilot/welcomed : the teacher dismissed the pilot welcome popup; don't show it again. */
export const POST = withAuthorizedRequest(
  async (_req, { caller, requestId }) => {
    try {
      await adminDb.collection("users").doc(caller.uid).update({ pilotWelcomedAt: new Date() });
      return NextResponse.json({ ok: true });
    } catch (error) {
      return errorResponse(error, "teacher/pilot/welcomed", requestId);
    }
  },
  { teacher: true, rateLimit: "write" },
);
