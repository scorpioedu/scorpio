// Reading and writing a student's Study progress (`study_progress/{uid}`) and their share links
// (`study_shares/{token}`). Server only; Firestore rules let a student read their own progress and
// nothing else, and no client writes either collection.
import { randomBytes } from "crypto";
import { adminDb } from "@/lib/firebase-admin";
import {
  parseProgress,
  recordAttempt,
  recordRead,
  type Attempt,
  type StudyProgress,
  type TopicKey,
} from "./progress";

const progressRef = (uid: string) => adminDb.collection("study_progress").doc(uid);

export async function readProgress(uid: string): Promise<StudyProgress> {
  return parseProgress((await progressRef(uid).get()).data());
}

/** Applies one answer in a transaction, so two quick answers never overwrite each other. */
export async function saveAttempt(uid: string, attempt: Attempt): Promise<StudyProgress> {
  return adminDb.runTransaction(async (tx) => {
    const ref = progressRef(uid);
    const stored = (await tx.get(ref)).data();
    const next = recordAttempt(parseProgress(stored), attempt);
    // A full write (not a merge), so topics that left review are really removed; the share token is kept.
    tx.set(ref, { ...next, studentId: uid, shareToken: stored?.shareToken ?? null });
    return next;
  });
}

/** Marks lessons as opened (one topic as it is read, or several moved over from the browser). */
export async function saveRead(uid: string, topics: TopicKey[]): Promise<void> {
  await adminDb.runTransaction(async (tx) => {
    const ref = progressRef(uid);
    const stored = (await tx.get(ref)).data();
    const next = recordRead(parseProgress(stored), topics, new Date());
    tx.set(ref, { ...next, studentId: uid, shareToken: stored?.shareToken ?? null });
  });
}

/** The student's share token, if they have one. */
export async function readShareToken(uid: string): Promise<string | null> {
  const token = (await progressRef(uid).get()).data()?.shareToken;
  return typeof token === "string" ? token : null;
}

/** Makes a new share link (the old one stops working). */
export async function createShareToken(uid: string, name: string): Promise<string> {
  const token = randomBytes(16).toString("base64url");
  const old = await readShareToken(uid);
  const batch = adminDb.batch();
  if (old) batch.delete(adminDb.collection("study_shares").doc(old));
  batch.set(adminDb.collection("study_shares").doc(token), {
    studentId: uid,
    name,
    createdAt: new Date(),
  });
  batch.set(progressRef(uid), { shareToken: token, studentId: uid }, { merge: true });
  await batch.commit();
  return token;
}

export async function revokeShareToken(uid: string): Promise<void> {
  const old = await readShareToken(uid);
  const batch = adminDb.batch();
  if (old) batch.delete(adminDb.collection("study_shares").doc(old));
  batch.set(progressRef(uid), { shareToken: null, studentId: uid }, { merge: true });
  await batch.commit();
}

/** The student a share link points to, or null for an unknown or revoked link. */
export async function resolveShareToken(
  token: string,
): Promise<{ uid: string; name: string } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const share = (await adminDb.collection("study_shares").doc(token).get()).data();
  if (!share || typeof share.studentId !== "string") return null;
  // A revoked token is deleted, but check the student's current token too.
  if ((await readShareToken(share.studentId)) !== token) return null;
  return { uid: share.studentId, name: typeof share.name === "string" ? share.name : "A student" };
}
