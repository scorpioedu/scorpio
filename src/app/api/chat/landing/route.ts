import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { errorResponse } from "@/lib/api-errors";

import { model, AiBudgetError } from "@/lib/ai/config";
import {
  VISITOR_COOKIE,
  VISITOR_COOKIE_MAX_AGE_S,
  getVisitorSecret,
  hashIp,
  issueVisitorToken,
  verifyVisitorToken,
} from "@/lib/landing-visitor";
import { getClientIp } from "@/lib/client-ip";
import { billingContext } from "@/lib/billing-context";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/api-schema";
import { landingChatBody } from "@/lib/schemas/api-bodies";
import { diagramsOn } from "@/lib/ai/tutor";
import { summarizeBalance } from "../../../../../functions/src/budget-policy";
import { landingDiagramSection } from "@/lib/diagram/prompt";
import { auditDiagramBlocks } from "@/lib/diagram/blocks";

async function callGeminiDirect(prompt: string, maxOutputTokens: number) {
  const result = await model.generateContent({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens },
  });
  const response = await result.response;
  if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
    console.warn("[Landing Chat] reply hit the output limit");
  }
  return { text: response.text(), usage: undefined };
}

/** Remove any diagram that cannot be drawn or says something false, as Raise does in class. */
function cleanDiagrams(text: string): string {
  const audit = auditDiagramBlocks(text);
  if (audit.dropped.length > 0)
    console.warn("[Landing Chat] diagram dropped:", audit.dropped.join(" | "));
  return audit.text;
}

const LANDING_LIMIT = 10;
// Per-IP daily ceiling is looser than the per-visitor limit so shared school/office networks still work.
const LANDING_IP_DAILY_LIMIT = 30;
const LANDING_DAILY_CAP_DEFAULT = 2000;
const LANDING_MAX_OUTPUT_TOKENS = 512;
// A diagram block runs 60-200 tokens; give replies that may carry one the room Raise has in class.
const LANDING_MAX_OUTPUT_TOKENS_WITH_DIAGRAMS = 1024;
const BUDGET_ALERT_RATIO = 0.8;

const LANDING_SYSTEM_PROMPT = `You are Raise, Scorpio's optional hint assistant, answering on Scorpio's public Try Raise page. Your role is to help prospective teachers, students, parents and schools understand Scorpio, answer questions about features, research and pricing, and show how Raise gives hints instead of answers.

ABOUT SCORPIO:
Scorpio is a homework tool for AP Physics 1, AP Physics 2, AP Physics C: Mechanics and AP Physics C: Electricity and Magnetism. It has ready-made problem sets for every AP unit (every problem checked by a person), a lesson for every unit, answers marked as students work, and a class misconception report. Study (scorpioedu.org/lessons) gives any student 161 free lessons with practice, with no AI and no account needed. Scorpio is run not for profit and was built by a high school junior.

AI FOR STUDENTS IS OFF BY DEFAULT:
- Study, lessons, practice and the marking of numeric and multiple-choice answers use no AI.
- Raise, the hint assistant, stays off for a class until its teacher turns it on.
- AI can draft a score and feedback for a written answer; the student sees it only after the teacher has checked and saved it.
- Never say students use AI in Scorpio by default.

KEY DIFFERENTIATORS:
- 0% Direct Answer Rate in a 125-response study on 25 test questions, scored by a Ph.D. physics auditor. This is a measured result, not a guarantee.
- 0.92 LaTeX notation density in the study (baseline Gemini: 0.22)
- Inference-Time Scaffolding — no fine-tuning, no black-box retraining. Every Socratic behaviour is enforced at inference time — observable, auditable, reproducible.
- +0.67 pedagogical uplift measured in a 125-response ablation study
- 100% cost transparency — zero-markup Gemini API pass-through billing from a prepaid balance

FEATURES:
- Raise: optional hint assistant for a class, off until the teacher turns it on. Students ask questions, Raise guides them instead of giving the answer. Teacher-controlled message limits per student.
- Notebook (scorpioedu.org/student/notebook): note-taking workspace with full LaTeX support for derivations.
- Formula vault (scorpioedu.org/student/vault): The equations and constants for the student's course; teachers choose which ones students see.
- Courses (scorpioedu.org/teacher/courses): every unit of the four AP Physics courses, in order, with problem sets to assign and a calendar to plan the year.
- Waypoints (scorpioedu.org/teacher/waypoints): Ready-made assignments, including the problem sets for all four courses. Every Waypoint is free to copy, including department waypoints shared inside a school network.
- Auto-grading: numeric answers with units and tolerance, and multiple choice, marked by plain code. Written answers wait for the teacher, who can ask AI for a draft score. Free.
- Class misconception report (scorpioedu.org/teacher/insights): top misconceptions ranked by how many students showed them (for example 8 of 24 students), by class, assignment and AP unit. Free.
- Not built: Google Classroom and Canvas integrations. Students join with a class code and teachers can export grades as CSV.
- Assignments (scorpioedu.org/teacher/create): assignment builder; teachers can optionally paste text or upload a file and have AI turn it into questions.
- Grading (scorpioedu.org/teacher/submission/grade): rubric-based grading; AI drafts are optional and always checked by the teacher before students see them.
- Network & Billing (scorpioedu.org/teacher/network): Teacher-controlled AI limits per student, real-time usage analytics, and the AI balance.

RESEARCH:
- Full methodology available at scorpioedu.org/research
- Tested against an unconstrained baseline model (not Khanmigo) in a 125-response study
- Scorpio: 0% direct answer rate | unconstrained baseline: 100%

PRICING:
- Scorpio is free for every teacher: every feature, no card, no trial, no per-student fees. Department sharing and the AI tools are included.
- AI runs on a prepaid balance charged at Google's exact cost, with no markup. Every network gets $1 of AI free each month.
- Gemini 3.8 Flash rates: $0.75 per 1M input tokens and $3.75 per 1M output tokens through 31 Dec 2026, then $1.50 and $7.50 from 1 Jan 2027. A Raise hint costs a fraction of a cent. Current rates are always on scorpioedu.org/pricing.
- Teachers can top up from $5; Polar's processing fee is shown before paying. Paid credit never expires.
- Refer a colleague: when they get their first class results, you get $5 of AI credit and they get $2.
- Schools can pay by invoice.
- Contact rushil@scorpioedu.org to pay by invoice
- Teachers request access at scorpioedu.org/request-access (we reply within 1–2 business days with an access code). Students join with a class code from their teacher, or study free at scorpioedu.org/lessons with no account.

SOCRATIC TUTORING (PHYSICS QUESTIONS / DEMO / TRY AI):
When a visitor asks a physics question, conceptual problem, homework question, or derivation:
- Embody Raise, Scorpio's Socratic physics learning assistant.
- NEVER give direct numerical answers, final formulas, or complete solutions.
- Guide the student step by step using targeted Socratic questions, prompting them to identify relevant physical principles, draw free-body diagrams, break down forces into components, and write governing equations.
- Format all mathematical notation, formulas, variables, and units using clean LaTeX ($...$ inline, $$...$$ block).

TONE: Be warm, confident, and genuinely helpful. Be honest about what Scorpio does and doesn't do. Keep most answers to 2–4 sentences. Use markdown formatting (bold, bullets) for clarity. When referencing paths, ALWAYS use clickable markdown links with scorpioedu.org as the base, e.g., [scorpioedu.org/research](https://scorpioedu.org/research). Guide interested teachers toward scorpioedu.org/request-access and students toward scorpioedu.org/lessons. Never make up features that don't exist.`;

const unavailable = (error: string) =>
  NextResponse.json(
    { error, unavailable: true },
    { status: 503, headers: { "Retry-After": "300" } },
  );

function dailyCap(): number {
  const n = Number(process.env.LANDING_DAILY_CAP);
  return Number.isInteger(n) && n > 0 ? n : LANDING_DAILY_CAP_DEFAULT;
}

type Admission =
  { ok: true; remaining: number } | { ok: false; reason: "visitor" | "ip" | "daily" };

/** Atomically checks and increments the per-visitor, per-IP-per-day and global-per-day counters. */
async function admit(visitorId: string, ipHash: string | null): Promise<Admission> {
  const day = new Date().toISOString().slice(0, 10);
  const visitorRef = adminDb.collection("landing_visitors").doc(`c_${visitorId}`);
  const ipRef = ipHash ? adminDb.collection("landing_visitors").doc(`ip_${ipHash}_${day}`) : null;
  const dailyRef = adminDb.collection("landing_daily").doc(day);
  const cap = dailyCap();
  return adminDb.runTransaction(async (tx): Promise<Admission> => {
    const [v, ip, d] = await Promise.all([
      tx.get(visitorRef),
      ipRef ? tx.get(ipRef) : Promise.resolve(null),
      tx.get(dailyRef),
    ]);
    const visitorCount: number = v.exists ? (v.data()?.messageCount ?? 0) : 0;
    const ipCount: number = ip && ip.exists ? (ip.data()?.messageCount ?? 0) : 0;
    const dailyCount: number = d.exists ? (d.data()?.count ?? 0) : 0;
    if (visitorCount >= LANDING_LIMIT) return { ok: false, reason: "visitor" };
    if (ipCount >= LANDING_IP_DAILY_LIMIT) return { ok: false, reason: "ip" };
    if (dailyCount >= cap) return { ok: false, reason: "daily" };
    const now = new Date();
    tx.set(
      visitorRef,
      {
        messageCount: visitorCount + 1,
        lastMessageAt: now,
        ...(visitorCount === 0 ? { firstMessageAt: now } : {}),
      },
      { merge: true },
    );
    if (ipRef) tx.set(ipRef, { messageCount: ipCount + 1, lastMessageAt: now }, { merge: true });
    tx.set(dailyRef, { count: dailyCount + 1, updatedAt: now }, { merge: true });
    return { ok: true, remaining: LANDING_LIMIT - (visitorCount + 1) };
  });
}

/**
 * Logs when the landing organization has used 80% or more of what it can spend this month: its
 * monthly spend cap when one is set, otherwise this month's spend plus its remaining balance.
 * Never throws.
 */
async function warnIfNearBudget(orgId: string) {
  try {
    const org = (await adminDb.collection("organizations").doc(orgId).get()).data();
    if (!org) return;
    const b = summarizeBalance(org);
    const used = b.monthSpendCents + b.reservedCents;
    const limit = b.monthlyCapCents > 0 ? b.monthlyCapCents : used + b.availableCents;
    if (limit <= 0) return;
    if (used >= limit * BUDGET_ALERT_RATIO) {
      console.warn(
        `[Landing Chat] ALERT: landing org budget past 80% (${Math.round((used / limit) * 100)}% used)`,
      );
    }
  } catch (err) {
    console.error(
      "[Landing Chat] budget alert check failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseJsonBody(req, landingChatBody, {
      message: "Missing required fields",
    });
    if (!parsed.ok) return parsed.response;
    const { message } = parsed.data;

    // Fail closed: without a budgeted landing org or a signing secret, never reach the provider.
    const landingOrgId = process.env.LANDING_ORG_ID;
    const secret = getVisitorSecret();
    if (!landingOrgId || !secret) {
      console.error(
        "[Landing Chat] not configured: LANDING_ORG_ID or LANDING_VISITOR_COOKIE_SECRET missing",
      );
      return unavailable("The demo is temporarily unavailable. Please try again later.");
    }

    // Visitor identity is a server-signed cookie; any visitorId in the body is ignored.
    let visitorId = verifyVisitorToken(req.cookies.get(VISITOR_COOKIE)?.value, secret);
    let newToken: string | null = null;
    if (!visitorId) {
      const issued = issueVisitorToken(secret);
      visitorId = issued.id;
      newToken = issued.token;
    }
    // No trusted IP header (not on Vercel): skip per-IP controls and rely on the cookie and the global daily cap.
    const ip = getClientIp(req.headers);
    const ipHash = ip ? hashIp(ip, secret) : null;

    const withCookie = (res: NextResponse) => {
      if (newToken) {
        res.cookies.set(VISITOR_COOKIE, newToken, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: VISITOR_COOKIE_MAX_AGE_S,
        });
      }
      return res;
    };

    if (ipHash) {
      const rate = await checkRateLimit(req, `ip_${ipHash}`, "landing", {
        windowMs: 60000,
        maxRequests: 5,
      });
      if (!rate.allowed)
        return withCookie(
          NextResponse.json(
            { error: rate.error },
            {
              status: 429,
              headers: rate.retryAfterSeconds
                ? { "Retry-After": String(rate.retryAfterSeconds) }
                : undefined,
            },
          ),
        );
    }

    let admission: Admission;
    try {
      admission = await admit(visitorId, ipHash);
    } catch (dbErr) {
      console.error(
        "[Landing Chat] counter transaction failed; refusing request:",
        dbErr instanceof Error ? dbErr.message : dbErr,
      );
      return withCookie(
        unavailable("The demo is temporarily unavailable. Please try again later."),
      );
    }

    if (!admission.ok) {
      if (admission.reason === "daily") {
        console.error("[Landing Chat] ALERT: global daily message cap reached");
        return withCookie(
          unavailable(
            "The demo has reached its daily capacity. Please try again tomorrow or sign up.",
          ),
        );
      }
      return withCookie(
        NextResponse.json(
          {
            error: `You've reached the ${LANDING_LIMIT}-message demo limit. Sign up for unlimited access.`,
            limitReached: true,
          },
          { status: 429 },
        ),
      );
    }

    // Generate AI response (server-side direct REST call — avoids firebase/ai client SDK in Cloud Run)
    const diagrams = diagramsOn();
    const prompt = `${LANDING_SYSTEM_PROMPT}${diagrams ? landingDiagramSection() : ""}\n\nVisitor question: ${message}`;
    const maxTokens = diagrams
      ? LANDING_MAX_OUTPUT_TOKENS_WITH_DIAGRAMS
      : LANDING_MAX_OUTPUT_TOKENS;
    let result;
    try {
      result = await billingContext.run({ organizationId: landingOrgId, type: "landing" }, () =>
        callGeminiDirect(prompt, maxTokens),
      );
    } catch (aiErr) {
      if (aiErr instanceof AiBudgetError) {
        console.error("[Landing Chat] landing budget refused the request:", aiErr.message);
        return withCookie(
          unavailable("The demo is temporarily unavailable. Please try again later."),
        );
      }
      throw aiErr;
    }

    await warnIfNearBudget(landingOrgId);

    return withCookie(
      NextResponse.json({
        text: diagrams ? cleanDiagrams(result.text) : result.text,
        remaining: admission.remaining,
      }),
    );
  } catch (error: unknown) {
    return errorResponse(error, "landing-chat");
  }
}
