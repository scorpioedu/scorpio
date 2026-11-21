import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { errorResponse } from "@/lib/api-errors";
import { NextRequest, NextResponse } from "next/server";
import { assistTeacher } from "@/lib/ai/tutor";
import { adminDb } from "@/lib/firebase-admin";
import { checkBudget, recordUsage } from "@/lib/usage-limit";
import { parseJsonBody } from "@/lib/api-schema";
import { teacherRaiseBody } from "@/lib/schemas/api-bodies";

// Raise for teachers. The wrapper checks the caller is this teacher; usage draws on the department
// budget under its own type, so the per-student Raise allowance never applies.
async function handlePost(req: NextRequest, { caller, organizationId, requestId }: AuthorizedContext) {
  try {
    const parsed = await parseJsonBody(req, teacherRaiseBody, { message: "Invalid request body" });
    if (!parsed.ok) return parsed.response;
    const { message, chatHistory } = parsed.data;
    if (!message.trim()) return NextResponse.json({ error: "Message is empty" }, { status: 400 });

    if (!adminDb) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    if (!organizationId) {
      return NextResponse.json({ error: "Raise needs an active Scorpio department." }, { status: 403 });
    }

    // Teachers may name students while planning; scrub them before anything reaches the model.
    let studentNames: string[] = [];
    try {
      const students = await adminDb
        .collection("users")
        .where("teacherId", "==", caller.uid)
        .where("role", "==", "student")
        .get();
      studentNames = students.docs.map((d) => d.data().displayName || d.data().name).filter(Boolean);
    } catch (e) {
      console.error("Error resolving student names for scrubbing:", e);
    }

    const budget = await checkBudget(organizationId, "teacher_raise", caller.uid);
    if (!budget.allowed) return NextResponse.json({ error: budget.error }, { status: 403 });

    const result = await assistTeacher(message, chatHistory ?? [], studentNames);
    if (result.usage) {
      await recordUsage(organizationId, "teacher_raise", result.usage.inputTokens, result.usage.outputTokens, caller.uid);
    }
    return NextResponse.json({ response: result.text });
  } catch (error) {
    return errorResponse(error, "teacher raise", requestId);
  }
}

export const POST = withAuthorizedRequest(handlePost, {
  identityField: "userId",
  teacher: true,
  feature: "teacher_raise",
  rateLimit: "tutor",
});
