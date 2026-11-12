import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, withAuthorizedRequest } from '@/lib/auth-verify';
import { adminDb } from '@/lib/firebase-admin';
import { splitAssignmentQuestions, mergeAnswerKey } from '@/lib/assignment-security';
import { parseJsonBody } from '@/lib/api-schema';
import { createAssignmentBody } from '@/lib/schemas/api-bodies';

export const POST = withAuthorizedRequest(async (req) => {
  const caller = (await authenticateRequest(req))!;
  const parsed = await parseJsonBody(req, createAssignmentBody, { message: 'Invalid assignment' });
  if (!parsed.ok) return parsed.response;
  const data = parsed.data;
  const profile = (await adminDb.collection('users').doc(caller.uid).get()).data()!;
  if (data.courseId) {
    const course = (await adminDb.collection('courses').doc(data.courseId).get()).data();
    if (course?.teacherId !== caller.uid) return NextResponse.json({ error: 'Invalid class' }, { status: 403 });
  }
  const { rubric, dueDate, questions, ...fields } = data;
  let split: ReturnType<typeof splitAssignmentQuestions>;
  try { split = splitAssignmentQuestions(questions); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid assignment' }, { status: 400 }); }
  const { publicQuestions, answers } = split;
  const ref = adminDb.collection('assignments').doc();
  const batch = adminDb.batch();
  batch.set(ref, { ...fields, teacherId: caller.uid, organizationId: profile.organizationId || null,
    questions: publicQuestions, rubric: null, answerKeySeparated: true,
    dueDate: dueDate ? new Date(dueDate) : null, createdAt: new Date() });
  batch.set(adminDb.collection('assignment_keys').doc(ref.id), { answers, rubric: rubric || '', teacherId: caller.uid });
  await batch.commit();
  return NextResponse.json({ id: ref.id });
}, { teacher: true });

export async function GET(req: NextRequest) {
  const caller = await authenticateRequest(req);
  if (!caller) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id || id.includes('/')) return NextResponse.json({ error: 'Invalid assignment' }, { status: 400 });
  const assignment = (await adminDb.collection('assignments').doc(id).get()).data();
  const profile = (await adminDb.collection('users').doc(caller.uid).get()).data();
  if (profile?.role !== 'teacher' || !assignment || !(assignment.teacherId === caller.uid || assignment.visibility === 'global' ||
      (assignment.visibility === 'network' && profile.organizationId && assignment.organizationId === profile.organizationId))) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const key = (await adminDb.collection('assignment_keys').doc(id).get()).data();
  return NextResponse.json(mergeAnswerKey(assignment, key));
}
