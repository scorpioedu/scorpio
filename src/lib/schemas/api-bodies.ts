import { z } from "zod";

/** Firestore document ids must not contain "/" (it would address a sub-path). */
const docId = z.string().min(1).max(256).refine(v => !v.includes("/"), "must not contain '/'");

// ─── POST /api/assignments ─────────────────────────────────────────────────
// Explicit allow-list: the client also sends teacherId, organizationId and createdAt, but the
// route always overrides them, so they are dropped rather than rejected.
// Question objects stay loose: the editor and importers add per-type fields (options, ...).
export const assignmentQuestionSchema = z.looseObject({
  id: z.string().max(256),
  text: z.string().max(50000),
  type: z.string().max(64).optional(),
  points: z.number().optional(),
  correctAnswer: z.string().optional(),
});
export const createAssignmentBody = z.object({
  title: z.string().min(1).max(1000),
  description: z.string().max(50000).nullish(),
  topic: z.string().max(1000).nullish(),
  visibility: z.enum(["private", "network", "global"]).optional(),
  courseId: z.string().max(256).refine(v => !v.includes("/"), "must not contain '/'").nullish(),
  dueDate: z.union([z.string(), z.number()]).nullish()
    .refine(v => v == null || v === "" || !Number.isNaN(new Date(v).getTime()), "must be a valid date"),
  timeLimit: z.number().nullish(),
  gradingType: z.string().max(64).optional(),
  requireWorkSubmission: z.boolean().optional(),
  enableTabDetection: z.boolean().optional(),
  lockdownMode: z.boolean().optional(),
  allowAIHelp: z.boolean().optional(),
  allowCalculator: z.boolean().optional(),
  totalPoints: z.number().optional(),
  type: z.string().max(64).optional(),
  googleFormLink: z.string().max(2048).nullish(),
  rubric: z.string().max(100000).nullish(),
  questions: z.array(assignmentQuestionSchema).max(100),
});

// ─── POST /api/notebook/chat ───────────────────────────────────────────────
export const notebookChatBody = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(50000),
  })).min(1).max(500),
  notebookContent: z.string().max(500000).nullish(),
  studentId: z.string().min(1).max(256),
});

// ─── POST /api/auth/request-access ─────────────────────────────────────────
export const requestAccessAction = z.enum(["list", "approve", "reject"]);
/** Public submission from /request-access: it sends no `action`. */
export const requestAccessSubmitBody = z.object({
  name: z.string().max(500),
  email: z.string().max(500),
  institution: z.string().max(500),
  role: z.string().max(500),
  message: z.string().max(10000).nullish(),
});
export const requestAccessReviewBody = z.object({ id: docId });

// ─── POST /api/grade ───────────────────────────────────────────────────────
export const gradeBody = z.object({ submissionId: docId });

// ─── POST /api/submissions ─────────────────────────────────────────────────
export const submissionBody = z.object({
  submissionId: docId.optional(),
  assignmentId: docId,
  status: z.enum(["draft", "submitted"]),
  answers: z.array(z.object({ questionId: z.string().max(256), answer: z.unknown().optional() })).max(100).optional(),
  workFiles: z.array(z.object({
    name: z.string().max(1024).optional(),
    type: z.string().max(256).optional(),
    size: z.number().optional(),
    url: z.string().min(1).max(4096),
    uploadedAt: z.union([z.string(), z.number()]).optional(),
  })).max(20).optional(),
  unfocusCount: z.unknown().optional(),
});

// ─── POST /api/checkout ────────────────────────────────────────────────────
export const checkoutBody = z.object({
  userId: z.string().min(1).max(256),
  organizationId: docId,
  planId: z.string().min(1).max(128),
});
