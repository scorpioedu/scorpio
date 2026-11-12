import type { AssignmentQuestion } from "@/lib/assignment-security";
import { NextResponse } from 'next/server';
import { authenticateRequest, withAuthorizedRequest } from '@/lib/auth-verify';
import { adminDb } from '@/lib/firebase-admin';
import { isSubmissionLate } from '@/lib/due-date';
import { parseJsonBody, type FieldIssue } from '@/lib/api-schema';
import { submissionBody } from '@/lib/schemas/api-bodies';
import { errorResponse } from '@/lib/api-errors';
import { ClientError } from '@/lib/client-error';

/** Keeps the messages clients already show: they depend on which field failed. */
function submissionError(issues: FieldIssue[]): string {
  const issue = issues[0];
  const parts = issue?.path.split('.') ?? [];
  const field = parts[0];
  if (field === 'submissionId') return 'Invalid submission ID';
  if (field === 'answers') return 'Invalid answers';
  if (field === 'workFiles') return parts.length === 1 ? 'Too many attachments' : 'Invalid attachment';
  return 'Invalid submission';
}

export const POST = withAuthorizedRequest(async (req, { requestId }) => {
  const caller = (await authenticateRequest(req))!;
  const parsed = await parseJsonBody(req, submissionBody, { message: submissionError });
  if (!parsed.ok) return parsed.response;
  const { submissionId, ...body } = parsed.data;
  const profile = (await adminDb.collection('users').doc(caller.uid).get()).data()!;
  if (profile.role !== 'student') return NextResponse.json({ error: 'Student account required' }, { status: 403 });
  try {
    // Stable ID prevents duplicate submissions and duplicate grading on repeated clicks.
    const ref = submissionId ? adminDb.collection('submissions').doc(submissionId) : adminDb.collection('submissions').doc(`${caller.uid}_${body.assignmentId}`);
    await adminDb.runTransaction(async tx => {
      const assignment = (await tx.get(adminDb.collection('assignments').doc(body.assignmentId))).data();
      const existing = (await tx.get(ref)).data();
      if (!assignment || !assignment.answerKeySeparated) throw new ClientError('Assignment unavailable');
      const enrolled = assignment.visibility === 'global' ||
        (assignment.visibility === 'network' && profile.organizationId && assignment.organizationId === profile.organizationId) ||
        (assignment.courseId ? assignment.courseId === profile.courseId : assignment.teacherId === profile.teacherId);
      if (!enrolled) throw new ClientError('You are not enrolled in this assignment');
      if (existing && (existing.studentId !== caller.uid || existing.assignmentId !== body.assignmentId)) throw new ClientError('Access denied');
      if (existing && existing.status !== 'draft') {
        if (body.status === 'submitted') return; // Idempotent submit; never overwrite a grade.
        throw new ClientError('This submission is already final');
      }
      const given = body.answers;
      if (!Array.isArray(given) || given.length > 100) throw new ClientError('Invalid answers');
      const answers = (assignment.questions || []).map((q: AssignmentQuestion) => {
        const answer = given.find(a => a.questionId === q.id)?.answer || '';
        if (typeof answer !== 'string' || answer.length > 50000) throw new ClientError('Answer is too long');
        return { questionId: q.id, questionText: q.text, answer };
      });
      const now = new Date();
      const files = Array.isArray(body.workFiles) ? body.workFiles : [];
      if (files.length > 20) throw new ClientError('Too many attachments');
      for (const file of files) {
        let url: URL;
        try { url = new URL(file.url); } catch { throw new ClientError('Invalid attachment'); }
        const object = decodeURIComponent(url.pathname.split('/o/')[1] || '');
        const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
        if (url.protocol !== 'https:' || url.hostname !== 'firebasestorage.googleapis.com' || !bucket || !url.pathname.startsWith(`/v0/b/${bucket}/o/`) || !object.startsWith(`submissions/${caller.uid}/`)) throw new ClientError('Invalid attachment');
      }
      tx.set(ref, { assignmentId: body.assignmentId, studentId: caller.uid, studentName: profile.displayName || '', studentEmail: caller.email || '',
        teacherId: assignment.teacherId, courseId: assignment.courseId || null, answers, status: body.status,
        updatedAt: now, ...(body.status === 'submitted' ? { submittedAt: now } : {}), isLate: isSubmissionLate(assignment.dueDate, now),
        graded: false, totalPoints: (assignment.questions || []).reduce((n: number, q: AssignmentQuestion) => n + (q.points ?? 10), 0),
        earnedPoints: null, workFiles: files, unfocusCount: typeof body.unfocusCount === 'number' && Number.isFinite(body.unfocusCount) ? Math.max(0, body.unfocusCount) : 0 });
    });
    return NextResponse.json({ id: ref.id });
  } catch (error) {
    return errorResponse(error, 'submissions', requestId);
  }
}, { rateLimit: "write" });
