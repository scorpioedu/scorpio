import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { errorResponse } from "@/lib/api-errors";
import { createShareToken, revokeShareToken } from "@/lib/study/store";

/**
 * POST /api/study/share -> { token }: a new read-only link to the student's Study progress (any
 * earlier link stops working). DELETE /api/study/share: turns sharing off.
 */
export const POST = withAuthorizedRequest(
  async (_req, { caller, profile, requestId }) => {
    if (profile.role !== "student")
      return NextResponse.json({ error: "Student account required" }, { status: 403 });
    try {
      const name =
        typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : "A student";
      return NextResponse.json({ token: await createShareToken(caller.uid, name) });
    } catch (error) {
      return errorResponse(error, "study/share", requestId);
    }
  },
  { rateLimit: "write" },
);

export const DELETE = withAuthorizedRequest(
  async (_req, { caller, profile, requestId }) => {
    if (profile.role !== "student")
      return NextResponse.json({ error: "Student account required" }, { status: 403 });
    try {
      await revokeShareToken(caller.uid);
      return NextResponse.json({ success: true });
    } catch (error) {
      return errorResponse(error, "study/share", requestId);
    }
  },
  { rateLimit: "write" },
);
