import { NextRequest, NextResponse } from "next/server";
import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { parseJsonBody } from "@/lib/api-schema";
import { supportTicketUpdateBody, SUPPORT_TICKET_STATUSES } from "@/lib/schemas/api-bodies";
import {
  SUPPORT_TICKETS,
  TICKET_CATEGORIES,
  serialiseTicket,
  summariseTickets,
  type TicketStatus,
} from "@/lib/support/tickets";

/**
 * GET /api/admin/support?status=&category= : support tickets and pilot feedback, newest first.
 * The summary counts cover every ticket fetched, not only the filtered list, so the 2-day target
 * stays visible whichever filter is active.
 */
async function handleList(req: NextRequest, { requestId }: AuthorizedContext) {
  try {
    const status = req.nextUrl.searchParams.get("status");
    const category = req.nextUrl.searchParams.get("category");
    if (status && !SUPPORT_TICKET_STATUSES.includes(status as TicketStatus))
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    if (category && !(TICKET_CATEGORIES as readonly string[]).includes(category))
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });

    // Filtering happens in memory (single-field order only), so no composite index is needed.
    const snap = await adminDb
      .collection(SUPPORT_TICKETS)
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();
    const all = snap.docs.map((d) => serialiseTicket(d.id, d.data()));
    const tickets = all.filter(
      (t) => (!status || t.status === status) && (!category || t.category === category),
    );
    return NextResponse.json({ tickets, summary: summariseTickets(all) });
  } catch (error) {
    return errorResponse(error, "admin/support", requestId);
  }
}

/** PATCH /api/admin/support { id, status?, note? } : triage a ticket. Records who and when. */
async function handleUpdate(req: NextRequest, { caller, requestId }: AuthorizedContext) {
  try {
    const parsed = await parseJsonBody(req, supportTicketUpdateBody, { message: "Invalid update" });
    if (!parsed.ok) return parsed.response;
    const { id, status, note } = parsed.data;
    const ref = adminDb.collection(SUPPORT_TICKETS).doc(id);
    const current = (await ref.get()).data();
    if (!current) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    const update: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      updatedBy: caller.uid,
    };
    if (status !== undefined) update.status = status;
    if (note !== undefined) update.adminNote = note;
    await ref.update(update);
    return NextResponse.json({ ticket: serialiseTicket(id, { ...current, ...update }) });
  } catch (error) {
    return errorResponse(error, "admin/support", requestId);
  }
}

export const GET = withAuthorizedRequest(handleList, { admin: true, rateLimit: "write" });
export const PATCH = withAuthorizedRequest(handleUpdate, { admin: true, rateLimit: "write" });
