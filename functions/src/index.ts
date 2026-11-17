/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { setGlobalOptions } from "firebase-functions";
import * as logger from "firebase-functions/logger";
import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { collectSubmissionObjects, deleteStorageObjects } from "./assignment-cleanup";
import { mapWithConcurrency, selectRecipients } from "./assignment-email";

admin.initializeApp();

// Setting global options for all V2 functions.
setGlobalOptions({ maxInstances: 10 });

/**
 * Trigger to delete all submissions when an assignment is deleted.
 */
export const onAssignmentDeleted = onDocumentDeleted(
  "assignments/{assignmentId}",
  async (event) => {
    const assignmentId = event.params.assignmentId;
    const db = admin.firestore();
    const submissionsRef = db.collection("submissions");

    const snapshot = await submissionsRef.where("assignmentId", "==", assignmentId).get();

    // Remove uploaded files first (only under submissions/{studentId}/), then the documents that reference them.
    const objects = collectSubmissionObjects(snapshot.docs.map((doc) => doc.data()));
    const failedObjects = await deleteStorageObjects(admin.storage().bucket(), objects);
    if (failedObjects.length > 0) {
      logger.error(
        `Could not delete ${failedObjects.length} storage objects for assignment ${assignmentId}`,
      );
    }

    for (let i = 0; i < snapshot.docs.length; i += 400) {
      const batch = db.batch();
      snapshot.docs.slice(i, i + 400).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    await db.collection("assignment_keys").doc(assignmentId).delete();
    logger.info(
      `Deleted ${snapshot.size} submissions and ${objects.length - failedObjects.length} files for assignment ${assignmentId}`,
    );
  },
);

// Import and export new grading triggers
export { onSubmissionCreated, onSubmissionUpdated, sweepStuckGrading } from "./grading";

import * as React from "react";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { sendEmail } from "./lib/email";
import { maskEmail } from "./pii";
import { AssignmentCreatedEmail } from "./templates/AssignmentCreatedEmail";

const resendApiKey = defineSecret("RESEND_API_KEY");
const EMAIL_CONCURRENCY = 5;

/**
 * Trigger to send emails to all students when a teacher creates a new assignment.
 */
export const onAssignmentCreated = onDocumentCreated(
  {
    document: "assignments/{assignmentId}",
    secrets: [resendApiKey],
  },
  async (event) => {
    const assignmentData = event.data?.data();
    if (!assignmentData) {
      return;
    }

    const db = admin.firestore();
    const teacherId = assignmentData.teacherId;

    if (!teacherId) {
      logger.info("No teacherId found on assignment, skipping emails.");
      return;
    }

    const teacherDoc = await db.collection("users").doc(teacherId).get();
    if (teacherDoc.exists) {
      const teacherData = teacherDoc.data();
      const disableEmails = teacherData?.preferences?.disableAssignmentEmails ?? true;
      if (disableEmails) {
        logger.info(`Teacher ${teacherId} has disabled assignment emails, skipping.`);
        return;
      }
    }

    // Idempotency: Firestore triggers are at-least-once. Claim the send in a transaction so a
    // duplicate delivery of the same create event does not email everyone twice.
    const assignmentRef = db.collection("assignments").doc(event.params.assignmentId);
    const claimed = await db.runTransaction(async (tx) => {
      const current = await tx.get(assignmentRef);
      if (current.data()?.emailsSentAt) return false;
      tx.update(assignmentRef, { emailsSentAt: new Date() });
      return true;
    });
    if (!claimed) {
      logger.info(`Assignment ${event.params.assignmentId} emails already sent, skipping.`);
      return;
    }

    // Find all students for this teacher, narrowed to the assignment's course when it has one
    const studentsSnapshot = await db
      .collection("users")
      .where("teacherId", "==", teacherId)
      .where("role", "==", "student")
      .get();

    const recipients = selectRecipients(studentsSnapshot.docs, assignmentData.courseId);
    if (recipients.length === 0) {
      logger.info(
        `No students found for assignment ${event.params.assignmentId}, skipping emails.`,
      );
      return;
    }

    logger.info(`Sending assignment notification to ${recipients.length} students.`);

    await mapWithConcurrency(recipients, EMAIL_CONCURRENCY, async (student) => {
      const email = student.email as string;
      try {
        await sendEmail({
          apiKey: resendApiKey.value(),
          to: email,
          subject: `New Assignment Published: ${assignmentData.title || "Assignment"}`,
          react: React.createElement(AssignmentCreatedEmail, {
            studentName: (student.displayName as string) || (student.name as string) || "Student",
            assignmentName: assignmentData.title || "Assignment",
            link: `https://scorpioedu.org/student/assignments`,
          }),
        });
      } catch (err) {
        // Log but don't fail the entire batch if one email fails
        logger.error(`Failed to email student ${maskEmail(email)}`, {
          error: err instanceof Error ? err.name : "unknown",
        });
      }
    });
    logger.info(`Finished sending assignment creation emails for ${event.params.assignmentId}`);
  },
);

export { deliverBillingUsage } from "./billing";

export { expireStaleReservations } from "./reservations";
