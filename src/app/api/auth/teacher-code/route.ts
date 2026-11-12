import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminFieldWithValue as FieldValue } from '@/lib/firebase-admin';
import { randomBytes } from 'crypto';
import { withAuthorizedRequest } from '@/lib/auth-verify';
import { enforceRateLimit } from '@/lib/rate-limit';

function generateCode(): string {
  const segment = () => randomBytes(2).toString('hex').toUpperCase();
  return `SCORP-${segment()}-${segment()}`;
}

async function handleTeacherCode(req: NextRequest) {
  try {
  if (!adminDb) {
    console.error('[teacher-code] adminDb is null — Firebase Admin SDK not initialized. Check FIREBASE_* env vars on Cloud Run.');
    return NextResponse.json({ error: 'Service unavailable: Firebase Admin not initialized' }, { status: 500 });
  }

  const body = await req.json();
  const { action, code, label, usedBy, usedByEmail, organizationId } = body;

  // ─── GENERATE (admin only) ───────────────────────────────────────────────
  if (action === 'generate') {
    const newCode = generateCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30-day expiry

    await adminDb.collection('teacherInviteCodes').doc(newCode).set({
      code: newCode,
      label: label?.trim() || null,
      organizationId: organizationId || null, // Optional: auto-join an org
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
      isUsed: false,
      usedAt: null,
      usedBy: null,
      usedByEmail: null,
    });

    return NextResponse.json({ code: newCode });
  }

  // ─── LIST (admin only) ────────────────────────────────────────────────────
  if (action === 'list') {
    const snapshot = await adminDb
      .collection('teacherInviteCodes')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const codes = snapshot.docs.map((doc: any) => {
      const d = doc.data();
      return {
        code: d.code,
        label: d.label,
        isUsed: d.isUsed,
        createdAt: d.createdAt?.toDate?.()?.toISOString() ?? null,
        expiresAt: d.expiresAt instanceof Date ? d.expiresAt.toISOString() : d.expiresAt?.toDate?.()?.toISOString() ?? null,
        usedAt: d.usedAt?.toDate?.()?.toISOString() ?? null,
        usedByEmail: d.usedByEmail,
      };
    });

    return NextResponse.json({ codes });
  }

  // ─── REVOKE (admin only) ──────────────────────────────────────────────────
  if (action === 'revoke') {
    if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

    const docRef = adminDb.collection('teacherInviteCodes').doc(code.trim().toUpperCase());
    const doc = await docRef.get();
    if (!doc.exists) return NextResponse.json({ error: 'Code not found' }, { status: 404 });

    await docRef.update({ isUsed: true, revokedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true });
  }

  // ─── VALIDATE (public — called during signup) ─────────────────────────────
  if (action === 'validate') {
    if (!code) return NextResponse.json({ valid: false, reason: 'Missing code' }, { status: 400 });

    const normalized = code.trim().toUpperCase();
    const docRef = adminDb.collection('teacherInviteCodes').doc(normalized);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ valid: false, reason: 'Invalid code' });
    }

    const data = doc.data()!;

    if (data.isUsed) {
      return NextResponse.json({ valid: false, reason: 'Code already used' });
    }

    const expiresAt = data.expiresAt instanceof Date
      ? data.expiresAt
      : data.expiresAt?.toDate?.();

    if (expiresAt && expiresAt < new Date()) {
      return NextResponse.json({ valid: false, reason: 'Code expired' });
    }

    return NextResponse.json({
      valid: true,
      organizationId: data.organizationId || null
    });
  }

  // ─── MARK USED (called after successful signup) ───────────────────────────
  if (action === 'markUsed') {
    return NextResponse.json({ error: 'Invites are redeemed atomically during registration' }, { status: 410 });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('[teacher-code] Unhandled error:', err);
    return NextResponse.json({ error: err?.message ?? 'Internal error', stack: process.env.NODE_ENV !== 'production' ? err?.stack : undefined }, { status: 500 });
  }
}

// generate, list and revoke require the admin claim; validate stays public (called during signup).
const ADMIN_ACTIONS = new Set(['generate', 'list', 'revoke']);
const adminTeacherCode = withAuthorizedRequest(handleTeacherCode, { admin: true, rateLimit: 'write' });

export async function POST(req: NextRequest) {
  let action: unknown;
  try { action = (await req.clone().json())?.action; } catch { action = undefined; }
  if (typeof action === 'string' && ADMIN_ACTIONS.has(action)) return adminTeacherCode(req);
  // The public actions are unauthenticated, so they are keyed by the trusted client IP (RT-11).
  const limited = await enforceRateLimit(req, 'teacherCode');
  if (limited) return limited;
  return handleTeacherCode(req);
}
