import { NextRequest, NextResponse } from "next/server";
import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { summariseUsers } from "@/lib/admin/summaries";
import { SUPPORT_TICKETS, serialiseTicket, summariseTickets } from "@/lib/support/tickets";

/**
 * GET /api/admin/overview : user counts (total, by role, per organization), pending access requests
 * and the ticket summary, read with the Admin SDK so every organization is included.
 */
async function handleOverview(_req: NextRequest, { requestId }: AuthorizedContext) {
  try {
    const [usersSnap, orgsSnap, pendingSnap, ticketsSnap] = await Promise.all([
      adminDb
        .collection("users")
        .select("role", "organizationId", "teacherId", "createdAt", "lastLoginAt")
        .get(),
      adminDb.collection("organizations").select("name", "planId").get(),
      adminDb.collection("accessRequests").where("status", "==", "pending").select().get(),
      adminDb.collection(SUPPORT_TICKETS).orderBy("createdAt", "desc").limit(500).get(),
    ]);

    const users = summariseUsers(
      usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      orgsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    );
    const tickets = summariseTickets(ticketsSnap.docs.map((d) => serialiseTicket(d.id, d.data())));

    return NextResponse.json({
      users,
      pendingAccessRequests: pendingSnap.size,
      tickets,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error, "admin/overview", requestId);
  }
}

export const GET = withAuthorizedRequest(handleOverview, { admin: true, rateLimit: "write" });
