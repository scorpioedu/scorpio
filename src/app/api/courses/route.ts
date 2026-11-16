import { NextResponse } from 'next/server';
import { authenticateRequest, withAuthorizedRequest } from '@/lib/auth-verify';
import { adminDb } from '@/lib/firebase-admin';
import { errorResponse } from '@/lib/api-errors';
import { ClientError } from '@/lib/client-error';
import { parseJsonBody } from '@/lib/api-schema';
import { courseBody, courseBodyMessage } from '@/lib/schemas/api-bodies';
export const POST = withAuthorizedRequest(async (req, { requestId }) => {
  const caller = (await authenticateRequest(req))!;
  const parsed = await parseJsonBody(req, courseBody, { message: courseBodyMessage });
  if (!parsed.ok) return parsed.response;
  const { name, code } = parsed.data;
  const profile = (await adminDb.collection('users').doc(caller.uid).get()).data()!;
  if (!profile.organizationId) return NextResponse.json({ error: 'Join a network first' }, { status: 400 });
  try {
    const ref = adminDb.collection('courses').doc();
    await adminDb.runTransaction(async tx => {
      const codeRef = adminDb.collection('course_codes').doc(code);
      const reserved = await tx.get(codeRef);
      const existing = await tx.get(adminDb.collection('courses').where('code', '==', code).limit(1));
      if (reserved.exists || !existing.empty) throw new ClientError('Class code already exists');
      tx.create(codeRef, { courseId: ref.id });
      tx.create(ref, { name: name.trim().slice(0,120), code, teacherId: caller.uid, organizationId: profile.organizationId, createdAt: new Date().toISOString() });
    });
    return NextResponse.json({ id: ref.id });
  } catch (error) { return errorResponse(error, 'courses', requestId); }
}, { teacher: true, rateLimit: "write" });
