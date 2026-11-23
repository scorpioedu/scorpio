/**
 * Emails to students about their work: a new assignment, a reminder the day before it is due, and
 * results once the teacher has finished grading work set aside for review. All three are on unless
 * the teacher (preferences.disableAssignmentEmails) or the student (preferences.disableStudentEmails)
 * turned them off. Replies go to the teacher.
 */

import * as React from "react";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { sendEmail } from "./lib/email";
import { maskEmail } from "./pii";
import { mapWithConcurrency, selectRecipients } from "./assignment-email";
import {
  REMINDER_LEAD_MS,
  assignmentLink,
  dueDayWord,
  dueLabel,
  firstName,
  handedIn,
  isVisibleToStudents,
  justAssigned,
  millis,
  needsReminder,
  problemCount,
  resultsLink,
  reviewedResult,
  studentWantsEmails,
  teacherSendsStudentEmails,
} from "./student-email-rules";
import { AssignmentCreatedEmail } from "./templates/AssignmentCreatedEmail";
import { ResultsReadyEmail } from "./templates/ResultsReadyEmail";

const resendApiKey = defineSecret("RESEND_API_KEY");
const EMAIL_CONCURRENCY = 5;

type Doc = admin.firestore.DocumentData;

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Whoever writes `field` first sends; duplicate trigger deliveries and overlapping runs skip. */
async function claim(ref: admin.firestore.DocumentReference, field: string): Promise<boolean> {
  return admin.firestore().runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (current.data()?.[field]) return false;
    tx.update(ref, { [field]: new Date() });
    return true;
  });
}

/** The class name, the teacher's name and where replies go. */
async function classContext(db: admin.firestore.Firestore, assignment: Doc, teacher: Doc | undefined) {
  const courseId = text(assignment.courseId);
  const course = courseId ? (await db.collection("courses").doc(courseId).get()).data() : undefined;
  return {
    className: text(course?.name),
    teacherName: text(teacher?.displayName),
    replyTo: text(teacher?.email) ?? undefined,
  };
}

async function classRecipients(db: admin.firestore.Firestore, teacherId: string, courseId: unknown) {
  const students = await db
    .collection("users")
    .where("teacherId", "==", teacherId)
    .where("role", "==", "student")
    .get();
  return selectRecipients(students.docs, courseId);
}

/**
 * Tell the class about an assignment they can now see. Shared by the create trigger (index.ts) and
 * the trigger below for hidden copies that get assigned later. `emailsSentAt` makes it once only.
 */
export async function announceAssignment(assignmentId: string, assignment: Doc, apiKey: string) {
  const db = admin.firestore();
  const teacherId = text(assignment.teacherId);
  if (!teacherId) {
    logger.info("No teacherId found on assignment, skipping emails.");
    return;
  }
  if (!isVisibleToStudents(assignment)) {
    logger.info(`Assignment ${assignmentId} is hidden from students, skipping emails for now.`);
    return;
  }
  const teacher = (await db.collection("users").doc(teacherId).get()).data();
  if (!teacherSendsStudentEmails(teacher)) {
    logger.info(`Teacher ${teacherId} has disabled assignment emails, skipping.`);
    return;
  }
  if (!(await claim(db.collection("assignments").doc(assignmentId), "emailsSentAt"))) {
    logger.info(`Assignment ${assignmentId} emails already sent, skipping.`);
    return;
  }

  const recipients = await classRecipients(db, teacherId, assignment.courseId);
  if (recipients.length === 0) {
    logger.info(`No students found for assignment ${assignmentId}, skipping emails.`);
    return;
  }
  const ctx = await classContext(db, assignment, teacher);
  const due = millis(assignment.dueDate);
  const title = text(assignment.title) ?? "Assignment";
  logger.info(`Sending assignment notification to ${recipients.length} students.`);

  await mapWithConcurrency(recipients, EMAIL_CONCURRENCY, async (student) => {
    const email = student.email as string;
    try {
      await sendEmail({
        apiKey,
        to: email,
        replyTo: ctx.replyTo,
        tag: "assignment_new",
        subject: `New assignment: ${title}`,
        react: React.createElement(AssignmentCreatedEmail, {
          kind: "new",
          firstName: firstName(student.displayName ?? student.name),
          assignmentTitle: title,
          className: ctx.className,
          teacherName: ctx.teacherName,
          due: due === null ? null : dueLabel(due),
          problems: problemCount(assignment),
          link: assignmentLink(assignmentId),
        }),
      });
    } catch (err) {
      // One bad address must not stop the rest of the class.
      logger.error(`Failed to email student ${maskEmail(email)}`, {
        error: err instanceof Error ? err.name : "unknown",
      });
    }
  });
  logger.info(`Finished sending assignment creation emails for ${assignmentId}`);
}

/** A copy made hidden from Courses has just been assigned (un-archived): announce it now. */
export const onAssignmentAssigned = onDocumentUpdated(
  { document: "assignments/{assignmentId}", secrets: [resendApiKey] },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after || !justAssigned(before, after)) return;
    await announceAssignment(event.params.assignmentId, after, resendApiKey.value());
  },
);

/** Hourly: remind students who have not turned in work due within the next day. */
export async function runDueReminders(db: admin.firestore.Firestore, now: Date, apiKey: string) {
  const soon = await db
    .collection("assignments")
    .where("dueDate", ">", now)
    .where("dueDate", "<=", new Date(now.getTime() + REMINDER_LEAD_MS))
    .get();
  let sent = 0;
  for (const doc of soon.docs) {
    const assignment = doc.data();
    if (!needsReminder(assignment, now.getTime())) continue;
    try {
      const teacherId = assignment.teacherId as string;
      const teacher = (await db.collection("users").doc(teacherId).get()).data();
      if (!teacherSendsStudentEmails(teacher)) continue;
      if (!(await claim(doc.ref, "reminderSentAt"))) continue;

      const handIns = await db
        .collection("submissions")
        .where("assignmentId", "==", doc.id)
        .select("studentId", "status")
        .get();
      const done = new Set(
        handIns.docs.filter((s) => handedIn(s.data())).map((s) => String(s.data().studentId)),
      );
      const missing = (await classRecipients(db, teacherId, assignment.courseId)).filter(
        (s) => !done.has(String(s.uid)),
      );
      if (missing.length === 0) continue;

      const ctx = await classContext(db, assignment, teacher);
      const due = millis(assignment.dueDate) as number;
      const title = text(assignment.title) ?? "Your assignment";
      const day = dueDayWord(due, now.getTime());
      await mapWithConcurrency(missing, EMAIL_CONCURRENCY, async (student) => {
        const email = student.email as string;
        try {
          await sendEmail({
            apiKey,
            to: email,
            replyTo: ctx.replyTo,
            tag: "assignment_reminder",
            subject: `Due ${day}: ${title}`,
            react: React.createElement(AssignmentCreatedEmail, {
              kind: "reminder",
              firstName: firstName(student.displayName ?? student.name),
              assignmentTitle: title,
              className: ctx.className,
              teacherName: ctx.teacherName,
              due: dueLabel(due),
              dueDay: day,
              problems: problemCount(assignment),
              link: assignmentLink(doc.id),
            }),
          });
          sent += 1;
        } catch (err) {
          logger.error(`Failed to remind student ${maskEmail(email)}`, {
            error: err instanceof Error ? err.name : "unknown",
          });
        }
      });
    } catch (error) {
      // One assignment's failure must not stop the rest.
      logger.error("Due reminder failed", {
        assignmentId: doc.id,
        error: error instanceof Error ? error.name : "unknown",
      });
    }
  }
  return sent;
}

export const sendDueReminders = onSchedule(
  {
    schedule: "every 1 hours",
    timeZone: "America/Los_Angeles",
    secrets: [resendApiKey],
    timeoutSeconds: 300,
  },
  async () => {
    const sent = await runDueReminders(admin.firestore(), new Date(), resendApiKey.value());
    logger.info("Due reminders sent", { sent });
  },
);

/** The teacher finished grading work that was waiting for review: tell the student. */
export const onSubmissionReviewed = onDocumentUpdated(
  { document: "submissions/{submissionId}", secrets: [resendApiKey] },
  async (event) => {
    const result = reviewedResult(event.data?.before.data(), event.data?.after.data());
    if (!result || !event.data) return;
    const db = admin.firestore();
    const [student, assignment] = await Promise.all([
      db.collection("users").doc(result.studentId).get().then((d) => d.data()),
      db.collection("assignments").doc(result.assignmentId).get().then((d) => d.data()),
    ]);
    const email = text(student?.email);
    if (!email || !assignment || !studentWantsEmails(student)) return;
    const teacher = (await db.collection("users").doc(String(assignment.teacherId)).get()).data();
    if (!teacherSendsStudentEmails(teacher)) return;
    if (!(await claim(event.data.after.ref, "resultEmailSentAt"))) return;

    const ctx = await classContext(db, assignment, teacher);
    const title = text(assignment.title) ?? "your assignment";
    await sendEmail({
      apiKey: resendApiKey.value(),
      to: email,
      replyTo: ctx.replyTo,
      tag: "results_ready",
      subject: `Your results for ${title} are ready`,
      react: React.createElement(ResultsReadyEmail, {
        firstName: firstName(student?.displayName ?? student?.name),
        assignmentTitle: title,
        className: ctx.className,
        teacherName: ctx.teacherName,
        earned: result.earned,
        total: result.total,
        percent: result.percent,
        link: resultsLink(result.assignmentId),
      }),
    });
    logger.info("Results email sent", { submissionId: event.params.submissionId });
  },
);
