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

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { announceAssignment } from "./student-emails";

const resendApiKey = defineSecret("RESEND_API_KEY");

/**
 * Email the class when a teacher creates an assignment they can see. Hidden copies are announced
 * by onAssignmentAssigned when the teacher assigns them. See student-emails.ts.
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
    await announceAssignment(event.params.assignmentId, assignmentData, resendApiKey.value());
  },
);

export { onAssignmentAssigned, sendDueReminders, onSubmissionReviewed } from "./student-emails";

export { deliverBillingUsage } from "./billing";

export { expireStaleReservations } from "./reservations";

export { onLowBalance } from "./credit-emails";

export {
  onAccessRequestCreated,
  onAccessRequestApproved,
  onStudentEnrolled,
  onFirstResults,
} from "./teacher-emails";
export { sendTeacherDigests } from "./teacher-digest";
