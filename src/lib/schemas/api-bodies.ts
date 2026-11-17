import { z } from "zod";

/** Firestore document ids must not contain "/" (it would address a sub-path). */
const docId = z
  .string()
  .min(1)
  .max(256)
  .refine((v) => !v.includes("/"), "must not contain '/'");

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
  courseId: z
    .string()
    .max(256)
    .refine((v) => !v.includes("/"), "must not contain '/'")
    .nullish(),
  dueDate: z
    .union([z.string(), z.number()])
    .nullish()
    .refine(
      (v) => v == null || v === "" || !Number.isNaN(new Date(v).getTime()),
      "must be a valid date",
    ),
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
  // AP tags, checked against src/data/ap by the route (normaliseApTags).
  apCourse: z.enum(["physics-1"]).nullish(),
  apUnit: z.number().int().min(1).max(8).nullish(),
  apTopics: z.array(z.string().max(16)).max(40).nullish(),
  questions: z.array(assignmentQuestionSchema).max(100),
});

// ─── PATCH /api/assignments/{id} ───────────────────────────────────────────
// The owner edits an assignment after it is created. Every field is optional; only what is sent changes.
// `questions` replaces the whole list (answer keys are split server-side, as on create).
// `archived` hides it from students and default lists (restorable); it is not a delete.
export const updateAssignmentBody = z
  .object({
    title: z.string().trim().min(1).max(1000),
    description: z.string().max(50000).nullable(),
    topic: z.string().max(1000).nullable(),
    dueDate: z
      .union([z.string(), z.number()])
      .nullable()
      .refine((v) => v == null || !Number.isNaN(new Date(v).getTime()), "must be a valid date"),
    timeLimit: z.number().min(0).max(100000).nullable(),
    gradingType: z.string().max(64),
    requireWorkSubmission: z.boolean(),
    enableTabDetection: z.boolean(),
    lockdownMode: z.boolean(),
    allowAIHelp: z.boolean(),
    allowCalculator: z.boolean(),
    rubric: z.string().max(100000).nullable(),
    questions: z.array(assignmentQuestionSchema).min(1).max(100),
    archived: z.boolean(),
    // AP tags, checked against the assignment's own AP course by the route (normaliseApTags).
    apUnit: z.number().int().min(1).max(20).nullable(),
    apTopics: z.array(z.string().max(16)).max(40),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to change");

// ─── POST /api/assignments/clone ───────────────────────────────────────────
// Copies a readable assignment (own, global, or same-network) into a new private one owned by the
// caller; the answer key is copied server-side and never returned.
export const cloneAssignmentBody = z.object({
  sourceId: docId,
  courseId: docId.nullish(),
  title: z.string().trim().min(1).max(1000).optional(),
  // Optional due date for the copy (ISO string or epoch ms), used by the first-run unit assignment.
  dueDate: z
    .union([z.string(), z.number()])
    .nullish()
    .refine(
      (v) => v == null || v === "" || !Number.isNaN(new Date(v).getTime()),
      "must be a valid date",
    ),
});

// ─── POST /api/notebook/chat ───────────────────────────────────────────────
export const notebookChatBody = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(50000),
      }),
    )
    .min(1)
    .max(2000),
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
  answers: z
    .array(z.object({ questionId: z.string().max(256), answer: z.unknown().optional() }))
    .max(100)
    .optional(),
  workFiles: z
    .array(
      z.object({
        name: z.string().max(1024).optional(),
        type: z.string().max(256).optional(),
        size: z.number().optional(),
        url: z.string().min(1).max(4096),
        uploadedAt: z.union([z.string(), z.number()]).optional(),
      }),
    )
    .max(20)
    .optional(),
  unfocusCount: z.unknown().optional(),
});

// ─── POST /api/checkout ────────────────────────────────────────────────────
export const checkoutBody = z.object({
  userId: z.string().min(1).max(256),
  organizationId: docId,
  planId: z.string().min(1).max(128),
});

// ─── POST /api/courses ─────────────────────────────────────────────────────
// Error texts are the route's original client-facing messages (see `courseBodyMessage`).
export const courseBody = z.object({
  name: z
    .string()
    .refine((v) => v.trim().length > 0)
    .pipe(z.string().max(10000)),
  code: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  /** Optional: the class follows this course roadmap (a known id from src/data/curricula). */
  curriculumId: z.string().trim().min(1).max(64).optional(),
});
export const courseCurriculumBody = z.object({
  curriculumId: z.string().trim().min(1).max(64).nullable(),
});
// ─── PATCH /api/courses/{id}/plan ──────────────────────────────────────────
// Shapes only; curriculum-plan.ts and school-calendar.ts do the real checks and give the reasons.
export const coursePlanBody = z.object({
  plan: z
    .object({
      order: z.array(z.string().max(8)).max(200),
      skipped: z.array(z.string().max(8)).max(200),
    })
    .nullable()
    .optional(),
  daysOff: z.array(z.unknown()).max(200).nullable().optional(),
});

// ─── POST /api/courses/{id}/due-dates ──────────────────────────────────────
export const courseDueDatesBody = z.object({
  updates: z
    .array(
      z.object({
        assignmentId: docId,
        dueDate: z
          .union([z.string().min(1), z.number()])
          .nullable()
          .refine((v) => v == null || !Number.isNaN(new Date(v).getTime()), "must be a valid date"),
      }),
    )
    .min(1)
    .max(100),
});
export const courseBodyMessage = (issues: { path: string }[]) =>
  issues[0]?.path === "name"
    ? "Enter a class name"
    : issues[0]?.path === "curriculumId"
      ? "Unknown course"
      : "Use a class code of 6–64 letters, numbers, dashes, or underscores";

// ─── POST /api/student/enrollment ──────────────────────────────────────────
// `code` is validated further by findClassByCode; it is absent for action "leave".
export const enrollmentBody = z.object({
  action: z.enum(["join", "leave"]).optional(),
  code: z.string().max(128).optional(),
});

// ─── POST /api/auth/register ───────────────────────────────────────────────
export const registerBody = z.object({
  role: z.enum(["teacher", "student"]),
  name: z
    .string()
    .refine((v) => v.trim().length > 0)
    .pipe(z.string().max(120)),
  code: z.string().nullish(), // length/"/" checks stay in the route ("Invalid code")
});

// ─── POST /api/auth/session ────────────────────────────────────────────────
// The client also sends role/organizationId; they are ignored (roles come from the server profile).
export const sessionBody = z.object({ idToken: z.string().min(1).max(10000) });

// ─── POST /api/research/respond ────────────────────────────────────────────
export const researchRespondBody = z.object({
  message: z.string().max(10000),
  level: z.string().max(64),
  mode: z.string().max(64).optional(),
});

// ─── POST /api/teacher/network/membership ──────────────────────────────────
// Per-action requirements (which fields each action needs) stay in the route, with its messages.
export const membershipBody = z.object({
  action: z.string().max(32).optional(),
  name: z.string().max(10000).optional(),
  code: z.string().max(10000).optional(),
  memberId: z.string().max(256).optional(),
});

// ─── POST /api/teacher/students/cleanup ────────────────────────────────────
export const cleanupBody = z.object({
  studentId: docId,
  courseId: z.string().max(256).nullish(),
  unlink: z.boolean().nullish(),
});

// ─── POST /api/support/report ──────────────────────────────────────────────
// The navigation chatbot sends screenshots as data URLs; the 500 KB body cap bounds their size.
export const supportReportBody = z.object({
  title: z.string().max(1000).nullish(),
  description: z.string().trim().min(1).max(20000),
  category: z.enum(["bug", "feature", "question"]).optional(),
  priority: z.string().max(64).optional(),
  pageUrl: z.string().max(2048).optional(),
  userRole: z.string().max(64).optional(),
  userId: z.string().max(256).nullish(),
  userEmail: z.string().max(512).nullish(),
  userName: z.string().max(512).nullish(),
  userAgent: z.string().max(1024).optional(),
  screenshots: z.array(z.string()).max(10).optional(),
  // Where the report came from. The in-app feedback widget also sends what the user was trying to do
  // and the app area (teacher / student / admin) so triage does not need to guess.
  source: z.enum(["navigation-chatbot", "feedback-widget"]).optional(),
  context: z.string().trim().max(2000).nullish(),
  appContext: z.enum(["teacher", "student", "admin"]).optional(),
});

// ─── PATCH /api/admin/support ──────────────────────────────────────────────
export const SUPPORT_TICKET_STATUSES = ["open", "triaged", "done"] as const;
export const supportTicketUpdateBody = z
  .object({
    id: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9_-]+$/),
    status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
    note: z.string().trim().max(5000).optional(),
  })
  .refine((b) => b.status !== undefined || b.note !== undefined, {
    message: "Provide a status or a note",
  });

// ─── AI and chat routes ────────────────────────────────────────────────────
// These feed text to the model, so every string has a ceiling. The 500 KB body cap still applies.
// Missing/blank required fields keep each route's "Missing required fields" text.
const chatHistory = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().max(50000),
    }),
  )
  .max(200);

// POST /api/ai/generate (teacher/create sends numbers for count; the others are free text)
export const aiGenerateBody = z.object({
  topic: z.string().min(1).max(2000),
  userId: z.string().min(1).max(256),
  count: z.number().int().min(1).max(50).default(3),
  difficulty: z.string().max(64).default("Medium"),
  questionType: z.string().max(64).optional(),
  context: z.string().max(20000).nullish(),
});

// POST /api/ai/parse
export const aiParseBody = z.object({
  text: z.string().min(1).max(200000),
  userId: z.string().min(1).max(256),
});

// POST /api/ai/synthesize-rubric
export const synthesizeRubricBody = z.object({
  questionText: z.string().min(1).max(50000),
  topic: z.string().max(2000).nullish(),
  userId: z.string().min(1).max(256),
});

// POST /api/chat (navigation assistant)
export const navigationChatBody = z.object({
  message: z.string().min(1).max(10000),
  userRole: z.enum(["teacher", "student"]),
  userId: z.string().min(1).max(256),
});

// POST /api/chat/limits
export const limitsChatBody = z.object({
  message: z.string().min(1).max(10000),
  userId: z.string().min(1).max(256),
  chatHistory: chatHistory.nullish(),
});

// POST /api/chat/landing (public; the visitor id comes from the signed cookie, never the body)
export const landingChatBody = z.object({ message: z.string().max(4000) });

// POST /api/student/tutor. Authorisation (role === "student", userId, message present) stays in the route as 401.
export const tutorBody = z.object({
  message: z.string().max(20000).optional(),
  userId: z.string().max(256).optional(),
  role: z.string().max(64).optional(),
  mode: z.string().max(32).optional(),
  chatHistory: chatHistory.optional(),
  assignmentContext: z.string().max(100000).nullish(),
});

// ─── POST /api/auth/teacher-code ───────────────────────────────────────────
// One route, several actions (generate/list/revoke are admin-only, validate is public); each action's
// own required fields stay in the route with its messages ("Missing code"). usedBy/usedByEmail were
// accepted from the client but never read; they are dropped.
export const teacherCodeBody = z.object({
  action: z.string().max(32).optional(),
  code: z.string().max(256).nullish(),
  label: z.string().max(500).nullish(),
  organizationId: z.string().max(256).nullish(),
});

// ─── POST /api/admin/firestore ─────────────────────────────────────────────
// Read-only explorer. collectionName is checked against an allow-list in the route.
export const adminFirestoreBody = z.object({
  action: z.string().max(32).optional(),
  collectionName: z.string().max(256).nullish(),
  limit: z.number().int().min(1).max(1000).default(50),
  lastDocId: z
    .string()
    .max(256)
    .refine((v) => !v.includes("/"), "must not contain '/'")
    .nullish(),
  filterField: z.string().max(256).nullish(),
  filterValue: z.union([z.string().max(1000), z.number(), z.boolean()]).nullish(),
});

// ─── POST /api/teacher/network/portfolio ───────────────────────────────────
export const portfolioBody = z.object({
  teacherId: docId,
  studentId: docId,
  organizationId: docId,
});

// ─── /api/admin/content (AI-drafted AP problems, reviewed by a person) ─────
const apTopicId = z.string().regex(/^[1-8]\.\d{1,2}$/, "must be an AP topic id like 4.2");
export const contentGenerateBody = z.object({
  apTopic: apTopicId,
  count: z.number().int().min(1).max(5),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});
export const contentReviewBody = z.object({
  id: docId,
  action: z.enum(["save", "approve", "reject", "reopen"]),
  /** The reviewer's edited problem; checked again by validateDraftProblem. */
  problem: z.looseObject({}).optional(),
  note: z.string().max(2000).optional(),
  /** Who checked the answer. "ai" approvals still need a person before they can be published. */
  reviewer: z.enum(["human", "ai"]).optional(),
});
export const contentPublishBody = z
  .object({
    draftIds: z.array(docId).min(1).max(30).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    /** Publish one set of a course roadmap (src/data/curricula); draftIds, title and description then come from it. */
    curriculumId: z.string().trim().min(1).max(64).optional(),
    setKey: z.string().trim().min(1).max(8).optional(),
  })
  .refine(
    (b) =>
      b.curriculumId !== undefined || b.setKey !== undefined
        ? b.curriculumId !== undefined &&
          b.setKey !== undefined &&
          b.draftIds === undefined &&
          b.title === undefined &&
          b.description === undefined
        : b.draftIds !== undefined && b.title !== undefined,
    { message: "Send either draftIds and title, or curriculumId and setKey" },
  );
