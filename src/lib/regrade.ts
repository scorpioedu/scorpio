// Re-grading after a teacher edits an assignment's problems (PATCH /api/assignments/{id}).
// Only answers to questions whose grading changed are touched; answers the teacher graded by hand
// (`teacherGraded`) keep their score. Answers that would need the AI are not re-graded (no AI spend):
// they keep their score and are listed in `reviewQuestions` for the teacher.
import {
  gradeSubmissionAnswers,
  pointsOf,
  type GradableQuestion,
  type SubmittedAnswer,
} from "../../functions/src/grading-core";

/** The fields that decide a question's grade. Wording changes (text, hints) do not re-grade. */
const GRADING_FIELDS = [
  "type",
  "points",
  "correctAnswer",
  "options",
  "tolerance",
  "sigFigs",
  "distractors",
];

const gradingShape = (q: GradableQuestion) =>
  JSON.stringify(GRADING_FIELDS.map((f) => (q[f] === undefined || q[f] === "" ? null : q[f])));

/** Ids of questions whose grading differs between the two versions (new or removed ids are not "changed"). */
export function changedQuestionIds(
  before: GradableQuestion[],
  after: GradableQuestion[],
): string[] {
  const old = new Map(before.map((q) => [q.id, q]));
  return after
    .filter((q) => old.has(q.id) && gradingShape(old.get(q.id)!) !== gradingShape(q))
    .map((q) => q.id);
}

export interface RegradeInput {
  answers?: SubmittedAnswer[];
  teacherGraded?: string[];
  reviewQuestions?: string[];
}

export interface RegradeResult {
  answers: SubmittedAnswer[];
  earnedPoints: number;
  totalPoints: number;
  score: number;
  /** Answers whose score was recomputed. */
  regraded: number;
  /** Question ids the teacher should look at (changed, but needs a person or the AI). */
  reviewQuestions: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Re-grade one submission against the edited questions. `changed` are the question ids whose grading
 * changed. Answers to removed questions are dropped; totals always follow the edited questions.
 */
export async function regradeSubmission(
  questions: GradableQuestion[],
  submission: RegradeInput,
  changed: Set<string>,
): Promise<RegradeResult> {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const manual = new Set(submission.teacherGraded ?? []);
  const review = new Set((submission.reviewQuestions ?? []).filter((id) => byId.has(id)));
  let regraded = 0;
  const answers: SubmittedAnswer[] = [];
  for (const ans of submission.answers ?? []) {
    const question = byId.get(ans.questionId);
    if (!question) continue;
    if (!changed.has(ans.questionId) || manual.has(ans.questionId)) {
      answers.push(changed.has(ans.questionId) ? { ...ans, maxPoints: pointsOf(question) } : ans);
      continue;
    }
    const [graded] = (await gradeSubmissionAnswers([question], [ans]))
      .answers as (SubmittedAnswer & {
      method?: string;
      reviewFlag?: string;
    })[];
    if (graded.reviewFlag) {
      // Needs the AI or a person: keep the old grade and ask the teacher.
      answers.push({ ...ans, maxPoints: pointsOf(question) });
      review.add(ans.questionId);
      continue;
    }
    answers.push(graded);
    review.delete(ans.questionId);
    regraded++;
  }
  const totalPoints = round2(questions.reduce((sum, q) => sum + pointsOf(q), 0));
  const earnedPoints = round2(
    answers.reduce((sum, a) => sum + (typeof a.score === "number" ? (a.score as number) : 0), 0),
  );
  return {
    answers,
    earnedPoints,
    totalPoints,
    score: totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0,
    regraded,
    reviewQuestions: [...review],
  };
}
