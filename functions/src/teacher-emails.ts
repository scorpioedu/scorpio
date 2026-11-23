/**
 * The three emails that carry a new teacher from "approved" to "my class is using this":
 * the access code, the first student joining, and the first results. Each is sent once.
 */

import * as React from "react";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { sendEmail } from "./lib/email";
import { TeacherNoticeEmail } from "./templates/TeacherNoticeEmail";
import {
  TEACHER_GRADES,
  TEACHER_HOME,
  approvedRequest,
  firstName,
  newEnrollment,
  newResult,
  signupLink,
} from "./teacher-email-rules";

const resendApiKey = defineSecret("RESEND_API_KEY");

// These emails invite a reply ("reply if anything gets in the way"), so replies go to a real inbox.
const REPLY_TO = "rushil@scorpioedu.org";

const hello = (name: unknown) => (firstName(name) ? `Hi ${firstName(name)},` : "Hi,");

/**
 * Firestore triggers are at-least-once, and two students can join in the same second. Whoever sets
 * `field` on the document first sends; everyone else skips.
 */
async function claim(ref: admin.firestore.DocumentReference, field: string): Promise<boolean> {
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get(field)) return false;
    tx.update(ref, { [field]: new Date() });
    return true;
  });
}

/** Admin approved a request: send the code as a link that opens signup with it filled in. */
export const onAccessRequestApproved = onDocumentUpdated(
  { document: "accessRequests/{requestId}", secrets: [resendApiKey] },
  async (event) => {
    const approved = approvedRequest(event.data?.before.data(), event.data?.after.data());
    if (!approved || !event.data) return;
    if (!(await claim(event.data.after.ref, "approvalEmailSentAt"))) return;
    const sent = await sendEmail({
      apiKey: resendApiKey.value(),
      replyTo: REPLY_TO,
      to: approved.email,
      subject: "Your Scorpio access is approved",
      react: React.createElement(TeacherNoticeEmail, {
        preview: "Your access code is ready. Create your teacher account.",
        headline: "Your access is approved",
        greeting: hello(approved.name),
        paragraphs: [
          "Thanks for your interest in Scorpio. Your access request is approved.",
          "The button below opens the teacher signup with your access code already filled in. Setting up a class and assigning a first unit takes about five minutes.",
          `If the button doesn't work, go to scorpioedu.org/signup, choose Teacher and enter this code: ${approved.code}`,
        ],
        action: { label: "Create your teacher account", link: signupLink(approved.code) },
        footer:
          "The code works once and expires in 60 days. Reply to this email if anything gets in the way.",
      }),
    });
    if (sent) logger.info("Approval email sent", { requestId: event.params.requestId });
  },
);

/** A student landed in a class: tell the teacher the first time it happens. */
export const onStudentEnrolled = onDocumentWritten(
  { document: "students/{studentId}", secrets: [resendApiKey] },
  async (event) => {
    const enrolled = newEnrollment(event.data?.before.data(), event.data?.after.data());
    if (!enrolled) return;
    const db = admin.firestore();
    const teacherRef = db.collection("users").doc(enrolled.teacherId);
    if (!(await claim(teacherRef, "onboardingEmails.firstStudentAt"))) return;

    // Teachers who already had students before this email existed are marked, not emailed.
    const roster = await db
      .collection("users")
      .where("teacherId", "==", enrolled.teacherId)
      .where("role", "==", "student")
      .count()
      .get();
    if (roster.data().count > 1) return;

    const teacher = (await teacherRef.get()).data();
    if (typeof teacher?.email !== "string" || !teacher.email) return;
    const course = enrolled.courseId
      ? (await db.collection("courses").doc(enrolled.courseId).get()).data()
      : undefined;
    const className = typeof course?.name === "string" && course.name ? course.name : "your class";

    const sent = await sendEmail({
      apiKey: resendApiKey.value(),
      replyTo: REPLY_TO,
      to: teacher.email,
      subject: `Your first student joined ${className}`,
      react: React.createElement(TeacherNoticeEmail, {
        preview: `${className} has its first student on Scorpio.`,
        headline: "Your first student joined",
        greeting: hello(teacher.displayName),
        paragraphs: [
          `Your first student just joined ${className} on Scorpio, so your invite is working.`,
          "As the rest of the class joins they appear under Classes. Any work you have assigned is already waiting for them, and it is graded as each student turns it in.",
        ],
        action: { label: "Open your class", link: TEACHER_HOME },
        footer:
          "You get this once, for your first student. We'll write again when the first results are in.",
      }),
    });
    if (sent) logger.info("First-student email sent", { teacherId: enrolled.teacherId });
  },
);

/** The first piece of student work the teacher can look at. */
export const onFirstResults = onDocumentUpdated(
  { document: "submissions/{submissionId}", secrets: [resendApiKey] },
  async (event) => {
    const result = newResult(event.data?.before.data(), event.data?.after.data());
    if (!result) return;
    const db = admin.firestore();
    const teacherRef = db.collection("users").doc(result.teacherId);
    if (!(await claim(teacherRef, "onboardingEmails.firstResultsAt"))) return;

    // Same as above: a teacher with graded work from before this email existed is not "first".
    const graded = await db
      .collection("submissions")
      .where("teacherId", "==", result.teacherId)
      .where("graded", "==", true)
      .count()
      .get();
    if (graded.data().count > 1) return;

    const teacher = (await teacherRef.get()).data();
    if (typeof teacher?.email !== "string" || !teacher.email) return;
    const after = event.data?.after.data();
    const assignment =
      typeof after?.assignmentId === "string"
        ? (await db.collection("assignments").doc(after.assignmentId).get()).data()
        : undefined;
    const title =
      typeof assignment?.title === "string" && assignment.title
        ? assignment.title
        : "your assignment";

    const sent = await sendEmail({
      apiKey: resendApiKey.value(),
      replyTo: REPLY_TO,
      to: teacher.email,
      subject: `First results are in for ${title}`,
      react: React.createElement(TeacherNoticeEmail, {
        preview: `A student turned in ${title}.`,
        headline: "Your first results are in",
        greeting: hello(teacher.displayName),
        paragraphs: [
          result.needsReview
            ? `A student turned in ${title}. Scorpio graded what it could and set the rest aside for you to review.`
            : `A student turned in ${title}, and Scorpio has graded it.`,
          "The Gradebook has each student's score and answers. As more of the class turns work in, Misconceptions shows what they got wrong and why, so you know what to reteach.",
        ],
        action: { label: "Open the Gradebook", link: TEACHER_GRADES },
        footer:
          "You get this once, for your first results. Scorpio does not email you for every submission.",
      }),
    });
    if (sent) logger.info("First-results email sent", { teacherId: result.teacherId });
  },
);
