/**
 * Seeds the local Firebase emulators with a demo teacher, class and student for trying the app.
 * Refuses to run against anything but the emulators. Test-only accounts and passwords.
 *
 *   npm run dev:emulators   (or with functions: npx firebase emulators:start --only auth,firestore,storage,functions --project demo-scorpio)
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node tools/seed-emulator-demo.cjs
 *
 * Accounts: teacher@demo.test / demo-teacher-pass, student@demo.test / demo-student-pass,
 * otherteacher@demo.test / demo-other-pass (owns the library waypoints).
 */
const admin = require("firebase-admin");
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Emulators only: set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST");
}
admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "demo-scorpio" });
const db = admin.firestore();
const auth = admin.auth();

async function account(email, password, displayName, profile) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password, displayName, emailVerified: true });
  }
  await auth.setCustomUserClaims(user.uid, {
    role: profile.role,
    organizationId: profile.organizationId || null,
  });
  await db
    .collection("users")
    .doc(user.uid)
    .set(
      { email, displayName, name: displayName, createdAt: new Date(), ...profile },
      { merge: true },
    );
  return user.uid;
}

(async () => {
  await db.collection("organizations").doc("demo-org").set(
    {
      name: "Demo High School",
      planId: "department-monthly",
      subscriptionStatus: "active",
      aiBudgetLimit: 100,
      aiUsageCurrent: 0,
      aiUsageReserved: 0,
      createdAt: new Date(),
    },
    { merge: true },
  );
  await db
    .collection("organizations")
    .doc("other-org")
    .set(
      {
        name: "Other School",
        planId: "department-monthly",
        subscriptionStatus: "active",
        aiBudgetLimit: 100,
        aiUsageCurrent: 0,
      },
      { merge: true },
    );

  const teacher = await account("teacher@demo.test", "demo-teacher-pass", "Demo Teacher", {
    role: "teacher",
    organizationId: "demo-org",
  });
  const other = await account("otherteacher@demo.test", "demo-other-pass", "Other Teacher", {
    role: "teacher",
    organizationId: "other-org",
  });
  await db
    .collection("courses")
    .doc("demo-course")
    .set(
      {
        name: "AP Physics 1",
        code: "DEMO-AP1",
        teacherId: teacher,
        organizationId: "demo-org",
        createdAt: new Date(),
      },
      { merge: true },
    );
  await account("student@demo.test", "demo-student-pass", "Demo Student", {
    role: "student",
    organizationId: "demo-org",
    teacherId: teacher,
    courseId: "demo-course",
  });

  // A library waypoint in the legacy seeded shape (answers inline, no question ids), for the migration.
  await db
    .collection("assignments")
    .doc("legacy-waypoint")
    .set({
      teacherId: other,
      organizationId: "other-org",
      visibility: "global",
      title: "Legacy Kinematics Waypoint",
      description: "Seeded the old way",
      topic: "kinematics",
      createdAt: new Date(),
      questions: [
        {
          type: "multiple-choice",
          text: "Area under a v-t graph?",
          options: ["Acceleration", "Displacement"],
          answer: "Displacement",
        },
        {
          type: "numerical",
          text: "A car accelerates from rest at 3 m/s² for 6 s. Final velocity?",
          answer: "18 m/s",
        },
      ],
    });
  console.log("Seeded demo-org, demo-course, three accounts and one legacy waypoint.");
  await Promise.all(admin.apps.map((a) => a.delete()));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
