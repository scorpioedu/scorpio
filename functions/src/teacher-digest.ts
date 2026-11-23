/**
 * Monday summary for teachers: what was turned in, what is missing, what is waiting for review and
 * the week's most common mistakes. Sent only to teachers with something to report.
 */

import * as React from "react";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { sendEmail } from "./lib/email";
import { mapWithConcurrency } from "./assignment-email";
import { TeacherDigestEmail } from "./templates/TeacherDigestEmail";
import { TEACHER_GRADES, firstName } from "./teacher-email-rules";
import {
  DIGEST_WINDOW_MS,
  buildDigest,
  digestKey,
  digestSubject,
  type Digest,
  type DigestAssignment,
} from "./teacher-digest-rules";

const resendApiKey = defineSecret("RESEND_API_KEY");
const REPLY_TO = "rushil@scorpioedu.org";
const TEACHER_INSIGHTS = "https://scorpioedu.org/teacher/insights";
const TEACHERS_AT_ONCE = 3;

type Send = (to: string, subject: string, greeting: string, digest: Digest) => Promise<unknown>;

const millis = (v: unknown): number | null => {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === "function")
    return (v as { toMillis: () => number }).toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
};

/** Builds and sends every digest due at `now`. Returns how many were sent. */
export async function runTeacherDigests(
  db: admin.firestore.Firestore,
  now: Date,
  send: Send,
): Promise<number> {
  const since = new Date(now.getTime() - DIGEST_WINDOW_MS);
  const key = digestKey(now);

  // One read each for the week's work and mistakes, grouped by teacher in memory. These are
  // single-field range queries, so they need no composite index.
  const [weekSubs, weekEvents, cameDue] = await Promise.all([
    db
      .collection("submissions")
      .where("submittedAt", ">=", since)
      .select("teacherId", "assignmentId", "status")
      .get(),
    db
      .collection("misconception_events")
      .where("createdAt", ">=", since)
      .select("teacherId", "tag", "studentId", "final")
      .get(),
    db
      .collection("assignments")
      .where("dueDate", ">=", since)
      .where("dueDate", "<=", now)
      .select("teacherId")
      .get(),
  ]);

  const subsByTeacher = new Map<string, string[]>();
  for (const d of weekSubs.docs) {
    const s = d.data();
    if (s.status === "draft" || typeof s.teacherId !== "string" || !s.teacherId) continue;
    const list = subsByTeacher.get(s.teacherId) ?? [];
    list.push(String(s.assignmentId));
    subsByTeacher.set(s.teacherId, list);
  }
  const eventsByTeacher = new Map<string, Array<{ tag: string; studentId: string }>>();
  for (const d of weekEvents.docs) {
    const e = d.data();
    if (e.final !== true || typeof e.teacherId !== "string" || !e.teacherId) continue;
    const list = eventsByTeacher.get(e.teacherId) ?? [];
    list.push({ tag: String(e.tag), studentId: String(e.studentId) });
    eventsByTeacher.set(e.teacherId, list);
  }
  const candidates = new Set<string>(subsByTeacher.keys());
  for (const d of cameDue.docs) {
    const t = d.data().teacherId;
    if (typeof t === "string" && t && !t.includes("/")) candidates.add(t);
  }

  let sent = 0;
  await mapWithConcurrency([...candidates], TEACHERS_AT_ONCE, async (teacherId) => {
    try {
      const teacherRef = db.collection("users").doc(teacherId);
      const teacher = (await teacherRef.get()).data();
      if (teacher?.role !== "teacher" || typeof teacher.email !== "string" || !teacher.email)
        return;
      if (teacher.preferences?.disableWeeklyDigest === true) return;
      if (teacher.digestSentFor === key) return;

      const [assignmentSnap, courseSnap, studentSnap, reviewSnap] = await Promise.all([
        db.collection("assignments").where("teacherId", "==", teacherId).get(),
        db.collection("courses").where("teacherId", "==", teacherId).select("archivedAt").get(),
        db
          .collection("users")
          .where("teacherId", "==", teacherId)
          .where("role", "==", "student")
          .select("courseId")
          .get(),
        db
          .collection("submissions")
          .where("teacherId", "==", teacherId)
          .where("status", "==", "pending_review")
          .count()
          .get(),
      ]);

      const archivedCourses = new Set(
        courseSnap.docs.filter((d) => d.data().archivedAt).map((d) => d.id),
      );
      const enrolledByCourse = new Map<string, number>();
      for (const d of studentSnap.docs) {
        const c = d.data().courseId;
        if (typeof c === "string" && c) enrolledByCourse.set(c, (enrolledByCourse.get(c) ?? 0) + 1);
      }

      const week = subsByTeacher.get(teacherId) ?? [];
      const active = new Set(week);
      const sinceMs = since.getTime();
      const horizon = now.getTime() + DIGEST_WINDOW_MS;
      const assignments: DigestAssignment[] = [];
      for (const d of assignmentSnap.docs) {
        const a = d.data();
        const courseId = typeof a.courseId === "string" && a.courseId ? a.courseId : null;
        if (!courseId || a.archivedAt || a.visibility === "global" || archivedCourses.has(courseId))
          continue;
        const dueMs = millis(a.dueDate);
        // Only count hand-ins for assignments the digest can show.
        const inWindow = dueMs !== null && dueMs >= sinceMs && dueMs <= horizon;
        if (!active.has(d.id) && !inWindow) continue;
        const handIns = await db
          .collection("submissions")
          .where("assignmentId", "==", d.id)
          .select("status")
          .get();
        assignments.push({
          id: d.id,
          title: typeof a.title === "string" && a.title ? a.title : "Untitled assignment",
          courseId,
          dueMs,
          turnedIn: handIns.docs.filter((s) => s.data().status !== "draft").length,
        });
      }

      const digest = buildDigest({
        now: now.getTime(),
        assignments,
        enrolledByCourse,
        weekSubmissions: week,
        toReview: reviewSnap.data().count,
        events: eventsByTeacher.get(teacherId) ?? [],
      });
      if (!digest) return;

      // Scheduled runs can be retried: claim the week before sending.
      const claimed = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(teacherRef);
        if (fresh.get("digestSentFor") === key) return false;
        tx.update(teacherRef, { digestSentFor: key });
        return true;
      });
      if (!claimed) return;

      const name = firstName(teacher.displayName);
      await send(teacher.email, digestSubject(digest), name ? `Hi ${name},` : "Hi,", digest);
      sent += 1;
    } catch (error) {
      // One teacher's failure must not stop the rest.
      logger.error("Teacher digest failed", {
        teacherId,
        error: error instanceof Error ? error.name : "unknown",
      });
    }
  });
  return sent;
}

export const sendTeacherDigests = onSchedule(
  {
    schedule: "every monday 07:00",
    timeZone: "America/Los_Angeles",
    secrets: [resendApiKey],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const sent = await runTeacherDigests(
      admin.firestore(),
      new Date(),
      (to, subject, greeting, digest) =>
        sendEmail({
          apiKey: resendApiKey.value(),
          to,
          subject,
          replyTo: REPLY_TO,
          react: React.createElement(TeacherDigestEmail, {
            greeting,
            digest,
            gradebookLink: TEACHER_GRADES,
            insightsLink: TEACHER_INSIGHTS,
          }),
        }),
    );
    logger.info("Teacher digests sent", { sent });
  },
);
