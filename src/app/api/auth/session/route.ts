import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { parseJsonBody } from '@/lib/api-schema';
import { sessionBody } from '@/lib/schemas/api-bodies';

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get('origin');
    if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    const parsed = await parseJsonBody(req, sessionBody, { message: 'Invalid session credentials' });
    if (!parsed.ok) return NextResponse.json({ error: 'Invalid session credentials' }, { status: 401 });
    const { idToken } = parsed.data;
    const token = await adminAuth.verifyIdToken(idToken, true);
    const limited = await enforceRateLimit(req, 'session', token.uid);
    if (limited) return limited;
    const profile = (await adminDb.collection('users').doc(token.uid).get()).data();
    if (!profile || !['teacher', 'student'].includes(profile.role)) return NextResponse.json({ error: 'Complete registration first' }, { status: 403 });
    // Roles and enrollment come exclusively from the server-managed profile.
    const expiresIn = 5 * 24 * 60 * 60 * 1000;
    const session = await adminAuth.createSessionCookie(idToken, { expiresIn });
    (await cookies()).set('__session', session, {
      maxAge: expiresIn / 1000, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
    });
    return NextResponse.json({ status: 'success', role: profile.role });
  } catch {
    return NextResponse.json({ error: 'Invalid session credentials' }, { status: 401 });
  }
}
export async function DELETE() {
  (await cookies()).delete('__session');
  return NextResponse.json({ status: 'success' });
}
