import { NextResponse } from 'next/server';
import { authenticateRequest, withAuthorizedRequest } from '@/lib/auth-verify';
import { adminDb } from '@/lib/firebase-admin';
import { newOrganizationDefaults } from '@/lib/organization-defaults';
import { errorResponse } from '@/lib/api-errors';
import { ClientError } from '@/lib/client-error';
import { parseJsonBody } from '@/lib/api-schema';
import { membershipBody } from '@/lib/schemas/api-bodies';

export const POST = withAuthorizedRequest(async (req, { requestId }) => {
  const caller = (await authenticateRequest(req))!;
  const parsed = await parseJsonBody(req, membershipBody);
  if (!parsed.ok) return parsed.response;
  const { action, name, code, memberId } = parsed.data;
  try {
    await adminDb.runTransaction(async tx => {
      const ref = adminDb.collection('users').doc(caller.uid);
      const profile = (await tx.get(ref)).data()!;
      const orgRef = profile.organizationId ? adminDb.collection('organizations').doc(profile.organizationId) : null;
      const org = orgRef ? (await tx.get(orgRef)).data() : null;
      if (action === 'create') {
        if (profile.organizationId || typeof name !== 'string' || !name.trim()) throw new ClientError('Leave your current network first');
        const fresh = adminDb.collection('organizations').doc();
        tx.set(fresh, { id: fresh.id, name: name.trim().slice(0, 120), ownerId: caller.uid, ownerEmail: caller.email || '', ...newOrganizationDefaults('membership'), createdAt: new Date() });
        tx.update(ref, { organizationId: fresh.id });
      } else if (action === 'join') {
        if (profile.organizationId) throw new ClientError('Leave your current network first');
        if (typeof code !== 'string' || code.includes('/') || !code.trim()) throw new ClientError('A network-linked teacher invite code is required');
        const inviteRef = adminDb.collection('teacherInviteCodes').doc(code.trim().toUpperCase());
        const invite = (await tx.get(inviteRef)).data();
        if (!invite?.organizationId || invite.isUsed || !invite.expiresAt || invite.expiresAt.toDate() <= new Date()) throw new ClientError('Invalid network invite');
        const target = adminDb.collection('organizations').doc(invite.organizationId);
        if (!(await tx.get(target)).exists) throw new ClientError('Network not found');
        if ((await tx.get(adminDb.collection('users').where('organizationId', '==', invite.organizationId).where('role', '==', 'teacher').limit(50))).size >= 50) throw new ClientError('Network teacher capacity reached');
        tx.update(ref, { organizationId: invite.organizationId });
        tx.update(inviteRef, { isUsed: true, usedBy: caller.uid, usedAt: new Date() });
      } else if (action === 'leave' || action === 'remove') {
        const targetId = action === 'leave' ? caller.uid : memberId;
        if (typeof targetId !== 'string' || targetId.includes('/')) throw new ClientError('Invalid member');
        if (action === 'remove' && org?.ownerId !== caller.uid) throw new ClientError('Only the owner can remove members');
        if (targetId === org?.ownerId) {
          const members = await tx.get(adminDb.collection('users').where('organizationId', '==', profile.organizationId).limit(2));
          if (members.size > 1) throw new ClientError('Transfer network ownership before leaving');
          if (org?.planId !== 'free' && !['canceled','revoked'].includes(org?.subscriptionStatus)) throw new ClientError('Cancel the network subscription before disbanding');
        }
        const targetRef = adminDb.collection('users').doc(targetId);
        const target = (await tx.get(targetRef)).data();
        if (!profile.organizationId || target?.organizationId !== profile.organizationId) throw new ClientError('Invalid member');
        const students = await tx.get(adminDb.collection('users').where('teacherId', '==', targetId).limit(1));
        if (!students.empty) throw new ClientError('Reassign or remove enrolled students before leaving the network');
        tx.update(targetRef, { organizationId: null });
        if (targetId === org?.ownerId && orgRef) tx.delete(orgRef);
      } else throw new ClientError('Unknown action');
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'membership', requestId);
  }
}, { teacher: true, rateLimit: "write" });
