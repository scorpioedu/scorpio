import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from './lib/auth-verify';
import { adminDb } from './lib/firebase-admin';
import { classInvitePath, networkInvitePath } from './lib/onboarding-links';

export default async function proxy(request: NextRequest) {
  const caller = await authenticateRequest(request);
  const path = request.nextUrl.pathname;
  const protectedPage = path.startsWith('/teacher') || path.startsWith('/student');
  if (!caller) return protectedPage ? NextResponse.redirect(new URL('/login', request.url)) : NextResponse.next();
  const profile = (await adminDb.collection('users').doc(caller.uid).get()).data();
  if (!profile) return protectedPage ? NextResponse.redirect(new URL('/signup', request.url)) : NextResponse.next();
  const home = profile.role === 'teacher' ? '/teacher' : '/student';
  if (path === '/login' || path === '/signup') {
    // Already signed in on an invite's login or signup link: go to the invite, not home, so the code isn't lost.
    const classCode = request.nextUrl.searchParams.get('classCode');
    const teacherInvite = request.nextUrl.searchParams.get('teacherInvite');
    const invite =
      profile.role === 'teacher'
        ? teacherInvite && networkInvitePath(teacherInvite)
        : classCode && classInvitePath(classCode);
    return NextResponse.redirect(new URL(invite || home, request.url));
  }
  if (path.startsWith('/teacher') && profile.role !== 'teacher') {
    return NextResponse.redirect(new URL(home, request.url));
  }
  return NextResponse.next();
}
export const config = { matcher: ['/teacher/:path*', '/student/:path*', '/login', '/signup'] };
