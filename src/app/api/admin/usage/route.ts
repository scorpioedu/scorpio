import { NextRequest, NextResponse } from "next/server";
import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { summariseUsage } from "@/lib/admin/summaries";

const ALLOWED_DAYS = [7, 30, 90] as const;
const ROW_CAP = 10000;

/**
 * GET /api/admin/usage?org=<id|all>&days=7|30|90 : AI usage for one organization or all of them.
 * Read with the Admin SDK: the client rules only let teachers see their own organization, which is
 * why the old in-browser view showed nothing for most organizations.
 */
async function handleUsage(req: NextRequest, { requestId }: AuthorizedContext) {
  try {
    const org = req.nextUrl.searchParams.get("org") || "all";
    const daysParam = Number(req.nextUrl.searchParams.get("days") ?? 30);
    const days = (ALLOWED_DAYS as readonly number[]).includes(daysParam) ? daysParam : 30;
    if (org !== "all" && !/^[A-Za-z0-9_-]{1,128}$/.test(org))
      return NextResponse.json({ error: "Invalid organization" }, { status: 400 });

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const usageQuery =
      org === "all"
        ? adminDb
            .collection("usage_analytics")
            .where("timestamp", ">=", since)
            .orderBy("timestamp", "desc")
        : // Same (organizationId, timestamp desc) index the teacher network page uses; the window is
          // applied in memory so no new composite index is needed.
          adminDb
            .collection("usage_analytics")
            .where("organizationId", "==", org)
            .orderBy("timestamp", "desc");

    const [orgsSnap, usageSnap] = await Promise.all([
      adminDb.collection("organizations").select("name", "planId").get(),
      usageQuery.limit(ROW_CAP).get(),
    ]);

    const organizations = orgsSnap.docs
      .map((d) => ({
        id: d.id,
        name: (d.get("name") as string) || d.id,
        planId: (d.get("planId") as string) || "free",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const orgNames = new Map(organizations.map((o) => [o.id, o.name]));

    const usage = summariseUsage(
      usageSnap.docs.map((d) => d.data()),
      { days, orgNames, truncated: usageSnap.size >= ROW_CAP },
    );
    return NextResponse.json({ organizations, usage });
  } catch (error) {
    return errorResponse(error, "admin/usage", requestId);
  }
}

export const GET = withAuthorizedRequest(handleUsage, { admin: true, rateLimit: "write" });
