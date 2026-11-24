import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withAuthorizedRequest, type AuthorizedContext } from "@/lib/auth-verify";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";
import { ClientError } from "@/lib/client-error";
import { parseJsonBody } from "@/lib/api-schema";
import { adminPilotBody } from "@/lib/schemas/api-bodies";
import {
  pilotOrganizationFields,
  pilotBonusExpiry,
  DEFAULT_PILOT_BUDGET_CENTS,
  DEFAULT_PILOT_COHORT,
} from "@/lib/organization-defaults";
import { inviteAuthPath } from "@/lib/onboarding-links";
import {
  MAX_ADMIN_GRANT_CENTS,
  summarizeBalance,
} from "../../../../../functions/src/budget-policy";
import { applyCreditInTx } from "../../../../../functions/src/credits";

const iso = (v: unknown): string | null => {
  if (!v) return null;
  if (typeof v === "string") return v;
  const d =
    typeof (v as { toDate?: () => Date }).toDate === "function"
      ? (v as { toDate: () => Date }).toDate()
      : v instanceof Date
        ? v
        : null;
  return d ? d.toISOString() : null;
};

/**
 * GET /api/admin/pilots : every network with a pilot record (with its teachers and student count),
 * the free networks that could start one, and the pilot invite codes.
 */
/** Total pilot credit granted (start + top-ups); older pilots only recorded budgetCents. */
function pilotGranted(o: Record<string, unknown>): number {
  const p = (o.pilot ?? {}) as { grantedCents?: number; budgetCents?: number };
  return Number(p.grantedCents ?? p.budgetCents ?? 0) || 0;
}

async function handleList(_req: NextRequest, { requestId }: AuthorizedContext) {
  try {
    const [orgsSnap, usersSnap, invitesSnap] = await Promise.all([
      adminDb
        .collection("organizations")
        .select(
          "name",
          "planId",
          "subscriptionStatus",
          "pilot",
          "aiBonusCents",
          "aiBonusExpiresAt",
          "aiUsageReserved",
          "lastAiUsageAt",
          "ownerId",
          "ownerEmail",
        )
        .get(),
      adminDb.collection("users").select("role", "organizationId", "displayName", "email").get(),
      adminDb.collection("teacherInviteCodes").where("isPilot", "==", true).get(),
    ]);

    const teachers = new Map<string, { uid: string; name: string; email: string }[]>();
    const students = new Map<string, number>();
    for (const d of usersSnap.docs) {
      const u = d.data();
      if (!u.organizationId) continue;
      if (u.role === "teacher") {
        const list = teachers.get(u.organizationId) ?? [];
        list.push({ uid: d.id, name: u.displayName ?? "", email: u.email ?? "" });
        teachers.set(u.organizationId, list);
      } else if (u.role === "student") {
        students.set(u.organizationId, (students.get(u.organizationId) ?? 0) + 1);
      }
    }

    const pilots = [];
    const candidates = [];
    for (const d of orgsSnap.docs) {
      const o = d.data();
      const base = {
        id: d.id,
        name: o.name ?? "(unnamed network)",
        planId: o.planId ?? "free",
        ownerEmail: o.ownerEmail ?? null,
        teachers: teachers.get(d.id) ?? [],
        students: students.get(d.id) ?? 0,
      };
      if (o.pilot) {
        pilots.push({
          ...base,
          pilot: o.pilot,
          subscriptionStatus: o.subscriptionStatus ?? "none",
          // Pilot AI is bonus credit now: show what was granted and how much of it is gone.
          aiBudgetLimit: pilotGranted(o),
          aiUsageCurrent: Math.max(0, pilotGranted(o) - summarizeBalance(o).bonusCents),
          lastAiUsageAt: iso(o.lastAiUsageAt),
        });
      } else if (!o.planId || o.planId === "free") {
        candidates.push(base);
      }
    }
    pilots.sort((a, b) => String(b.pilot.startedAt).localeCompare(String(a.pilot.startedAt)));
    candidates.sort((a, b) => a.name.localeCompare(b.name));

    const invites = invitesSnap.docs
      .map((d) => {
        const i = d.data();
        return {
          code: d.id,
          contactEmail: i.contactEmail ?? null,
          contactName: i.contactName ?? null,
          pilot: i.pilot ?? null,
          isUsed: !!i.isUsed,
          usedByEmail: i.usedByEmail ?? null,
          expiresAt: iso(i.expiresAt),
          createdAt: iso(i.createdAt),
          link: inviteAuthPath("signup", "network", d.id),
        };
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    return NextResponse.json({
      pilots,
      candidates,
      invites,
      defaults: {
        budgetCents: DEFAULT_PILOT_BUDGET_CENTS,
        cohort: DEFAULT_PILOT_COHORT,
        capCents: MAX_ADMIN_GRANT_CENTS,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error, "admin/pilots", requestId);
  }
}

function newInviteCode() {
  const segment = () => randomBytes(2).toString("hex").toUpperCase();
  return `SCORP-${segment()}-${segment()}`;
}

/** POST /api/admin/pilots : start, extend, top up, end or reset a pilot, or create a pilot invite. */
async function handleAction(req: NextRequest, { caller, requestId }: AuthorizedContext) {
  const parsed = await parseJsonBody(req, adminPilotBody, { message: "Invalid pilot change" });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  try {
    if (body.action === "invite") {
      const invites = adminDb.collection("teacherInviteCodes");
      const existing = await invites.where("contactEmail", "==", body.email).get();
      const now = new Date();
      const usable = existing.docs.find((d) => {
        const i = d.data();
        const exp = i.expiresAt?.toDate?.() as Date | undefined;
        return i.isPilot === true && !i.isUsed && exp && exp > now;
      });
      if (usable) {
        return NextResponse.json({
          code: usable.id,
          link: inviteAuthPath("signup", "network", usable.id),
          reused: true,
        });
      }
      const code = newInviteCode();
      await invites.doc(code).create({
        code,
        label: `Pilot: ${body.cohort ?? DEFAULT_PILOT_COHORT}`,
        organizationId: null,
        contactEmail: body.email,
        contactName: body.name || null,
        school: null,
        expiresAt: new Date(now.getTime() + (body.expiresDays ?? 60) * 24 * 60 * 60 * 1000),
        isUsed: false,
        usedAt: null,
        usedBy: null,
        usedByEmail: null,
        isPilot: true,
        pilot: {
          cohort: body.cohort ?? DEFAULT_PILOT_COHORT,
          budgetCents: body.budgetCents ?? DEFAULT_PILOT_BUDGET_CENTS,
          endsAt: body.endsAt ?? null,
        },
        createdBy: caller.uid,
        createdAt: now,
      });
      return NextResponse.json(
        { code, link: inviteAuthPath("signup", "network", code), reused: false },
        { status: 201 },
      );
    }

    const ref = adminDb.collection("organizations").doc(body.organizationId);
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new ClientError("Network not found", 404);
      const org = snap.data()!;
      const isPilotNow = org.planId === "pilot";

      switch (body.action) {
        case "start": {
          if (isPilotNow && org.pilot?.status === "active")
            throw new ClientError("This network is already a pilot");
          const budgetCents = body.budgetCents ?? DEFAULT_PILOT_BUDGET_CENTS;
          const fields: Record<string, unknown> = pilotOrganizationFields(
            { budgetCents, endsAt: body.endsAt ?? null, cohort: body.cohort, note: body.note },
            "admin",
          );
          delete fields.aiBonusCents;
          delete fields.aiBonusExpiresAt;
          tx.update(ref, fields);
          applyCreditInTx(
            tx,
            ref,
            org,
            ref.collection("credit_ledger").doc(),
            {
              organizationId: ref.id,
              bucket: "bonus",
              cents: budgetCents,
              kind: "admin",
              reason: "Pilot AI credit",
              actorUid: caller.uid,
            },
            new Date(),
            pilotBonusExpiry(body.endsAt ?? null),
          );
          return;
        }
        case "extend":
          if (!isPilotNow || org.pilot?.status !== "active")
            throw new ClientError("Only an active pilot can be extended");
          tx.update(ref, { "pilot.endsAt": body.endsAt });
          return;
        case "topup": {
          if (!isPilotNow) throw new ClientError("Only a pilot network can be topped up here");
          if (body.addCents > MAX_ADMIN_GRANT_CENTS)
            throw new ClientError(`One grant cannot go above $${MAX_ADMIN_GRANT_CENTS / 100}`);
          tx.update(ref, { "pilot.grantedCents": pilotGranted(org) + body.addCents });
          applyCreditInTx(
            tx,
            ref,
            org,
            ref.collection("credit_ledger").doc(),
            {
              organizationId: ref.id,
              bucket: "bonus",
              cents: body.addCents,
              kind: "admin",
              reason: "Pilot top-up",
              actorUid: caller.uid,
            },
            new Date(),
            pilotBonusExpiry(org.pilot?.endsAt ?? null),
          );
          return;
        }
        case "end":
          if (!isPilotNow) throw new ClientError("This network is not a pilot");
          // Unspent pilot credit stays with the network until it expires.
          tx.update(ref, {
            planId: "free",
            "pilot.status": "ended",
            "pilot.endedAt": new Date().toISOString(),
          });
          return;
        case "reset_usage":
          throw new ClientError("Pilot AI is credit now; use Top up to add more.");
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "admin/pilots", requestId);
  }
}

export const GET = withAuthorizedRequest(handleList, { admin: true, rateLimit: "write" });
export const POST = withAuthorizedRequest(handleAction, { admin: true, rateLimit: "write" });
