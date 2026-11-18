import { NextResponse } from "next/server";
import { withAuthorizedRequest } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { newClassCode } from "@/lib/class-codes";

/**
 * POST /api/courses/{id}/code -> { code }
 * The owner gives a class a new join code (for example after the old one was shared too widely).
 * The new code is reserved and the old reservation freed in one transaction; students already in the
 * class stay in it.
 */
export const POST = withAuthorizedRequest(
  async (req, { caller, requestId }) => {
    // /api/courses/{id}/code
    const id = decodeURIComponent(req.nextUrl.pathname.split("/").filter(Boolean).at(-2) ?? "");
    if (!id || id.includes("/"))
      return NextResponse.json({ error: "Invalid class" }, { status: 400 });
    try {
      const ref = adminDb.collection("courses").doc(id);
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newClassCode();
        const result = await adminDb.runTransaction(async (tx) => {
          const course = (await tx.get(ref)).data();
          if (!course || course.teacherId !== caller.uid) return "denied" as const;
          const codeRef = adminDb.collection("course_codes").doc(code);
          const taken = (await tx.get(codeRef)).exists;
          const used = !(
            await tx.get(adminDb.collection("courses").where("code", "==", code).limit(1))
          ).empty;
          if (taken || used) return "taken" as const;
          const oldRef =
            typeof course.code === "string" && course.code
              ? adminDb.collection("course_codes").doc(course.code)
              : null;
          const old = oldRef ? (await tx.get(oldRef)).data() : undefined;
          tx.create(codeRef, { courseId: id });
          if (oldRef && old?.courseId === id) tx.delete(oldRef);
          tx.update(ref, { code });
          return "ok" as const;
        });
        if (result === "denied")
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        if (result === "ok") return NextResponse.json({ code });
      }
      return NextResponse.json({ error: "Could not make a new code. Try again." }, { status: 503 });
    } catch (error) {
      return errorResponse(error, "courses/code", requestId);
    }
  },
  { teacher: true, rateLimit: "write" },
);
