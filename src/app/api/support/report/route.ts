import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { errorResponse } from "@/lib/api-errors";
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

async function handlePost(req: NextRequest, { requestId }: AuthorizedContext) {
  try {
    const body = await req.json();
    const {
      title,
      description,
      category = 'bug',
      priority = 'normal',
      pageUrl = '',
      userRole = 'student',
      userId = null,
      userEmail = null,
      userName = null,
      userAgent = '',
      screenshots = [],
    } = body;

    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json(
        { error: 'Please provide a description of the issue or feedback.' },
        { status: 400 }
      );
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const prefix = category === 'bug' ? 'BUG' : category === 'feature' ? 'FEAT' : 'SUP';
    const ticketId = `SC-${prefix}-${Date.now().toString(36).toUpperCase().slice(-4)}${randomSuffix}`;

    const reportData = {
      ticketId,
      title: title?.trim() || `${category.toUpperCase()}: ${description.trim().slice(0, 50)}...`,
      description: description.trim(),
      category,
      priority,
      pageUrl,
      userRole,
      userId,
      userEmail,
      userName,
      screenshots: Array.isArray(screenshots) ? screenshots.slice(0, 3) : [],
      userAgent: userAgent || req.headers.get('user-agent') || 'Unknown',
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    // A ticket that was not stored must never be acknowledged: the user would believe support has it (G-006).
    // Nothing from `reportData` (description, email, screenshots) is logged.
    if (!adminDb) {
      console.error(`[Support API] Admin DB not available; ticket ${ticketId} was not stored (requestId=${requestId})`);
      return NextResponse.json({ error: 'Support is temporarily unavailable. Please try again shortly.', requestId }, { status: 503 });
    }
    try {
      await adminDb.collection('support_tickets').doc(ticketId).set(reportData);
    } catch (dbError) {
      console.error(`[Support API] Could not store ticket ${ticketId} (requestId=${requestId}):`, dbError instanceof Error ? dbError.name : 'unknown');
      return NextResponse.json({ error: 'We could not save your report. Please try again.', requestId }, { status: 503 });
    }

    return NextResponse.json({
      success: true,
      ticketId,
      message: 'Support ticket submitted successfully.',
    });
  } catch (error: unknown) {
    return errorResponse(error, 'support-report', requestId);
  }
}

export const POST = withAuthorizedRequest(handlePost, { identityField: "userId", rateLimit: "support" });
