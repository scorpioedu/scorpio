import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { errorResponse } from '@/lib/api-errors';

import { model, AiBudgetError } from '@/lib/ai/config';
import { VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE_S, getVisitorSecret, hashIp, issueVisitorToken, verifyVisitorToken } from '@/lib/landing-visitor';
import { getClientIp } from '@/lib/client-ip';
import { billingContext } from '@/lib/billing-context';
import { checkRateLimit } from '@/lib/rate-limit';
async function callGeminiDirect(prompt: string) {
  const result = await model.generateContent({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: LANDING_MAX_OUTPUT_TOKENS },
  });
  const response = await result.response;
  return { text: response.text(), usage: undefined };
}

const LANDING_LIMIT = 10;
// Per-IP daily ceiling is looser than the per-visitor limit so shared school/office networks still work.
const LANDING_IP_DAILY_LIMIT = 30;
const LANDING_DAILY_CAP_DEFAULT = 2000;
const LANDING_MAX_OUTPUT_TOKENS = 512;
const BUDGET_ALERT_RATIO = 0.8;

const LANDING_SYSTEM_PROMPT = `You are Raise, Scorpio's AI learning assistant and expert product guide embedded in the Scorpio Physics LMS public landing page and Try AI playground. Your role is to help prospective teachers, students, and institutions understand Scorpio's value, answer questions about features, research, pricing, and demonstrate Scorpio's signature Socratic physics tutoring.

ABOUT SCORPIO:
Scorpio is the world's only AI Physics LMS. It was built around a 4-layer Socratic scaffolding architecture that makes "homework cheating" structurally impossible — the AI never answers questions directly; it guides students through the derivation process step by step.

KEY DIFFERENTIATORS:
- 0% Direct Answer Rate — verified by Ph.D. audit. The AI cannot give away answers, it is architecturally prevented from doing so.
- 0.92 LaTeX notation density — real-time symbolic math rendering (vs. ChatGPT: 0.18, Khanmigo: 0.31)
- Inference-Time Scaffolding — no fine-tuning, no black-box retraining. Every Socratic behaviour is enforced at inference time — observable, auditable, reproducible.
- +0.67 pedagogical uplift measured in a 125-response ablation study
- 100% cost transparency — zero-markup Gemini API pass-through billing via Polar metered billing

FEATURES:
- Raise (scorpioedu.org/student/tutor): Socratic physics learning assistant. Students ask questions, Raise guides them — never tells them the answer. Teacher-controlled message limits per student.
- Notebook (scorpioedu.org/student/notebook): AI-powered note-taking workspace with full LaTeX support for complex derivations.
- Vault (scorpioedu.org/student/vault): Secure personal file and material library.
- Waypoints Network (scorpioedu.org/teacher/waypoints): Peer-validated physics modules shared across institutions within a Scorpio Network.
- Assignments (scorpioedu.org/teacher/create): AI-powered assignment builder — paste text or upload a file and Scorpio auto-parses it into structured questions.
- AI-Assisted Grading (scorpioedu.org/teacher/submission/grade): Automated rubric-based grading with explainability.
- Network & Billing (scorpioedu.org/teacher/network): Teacher-controlled AI budget caps per student, real-time usage analytics, and Polar metered billing.

RESEARCH:
- Full methodology available at scorpioedu.org/research
- Validated against ChatGPT and Khanmigo in a controlled study
- Scorpio: 0% direct answer rate | ChatGPT: 100% | Khanmigo: 12%
- Scorpio: 0.92 LaTeX density | ChatGPT: 0.18 | Khanmigo: 0.31

PRICING:
- Department License for institutional use ($10/month or $100/year flat for the whole department) — teachers pay the actual Gemini API cost with zero markup
- Polar metered billing: Input tokens $0.75/M, Output tokens $3.75/M (Gemini 3.8 Flash raw pass-through rates)
- Contact rushil@scorpioedu.org for institutional or departmental pricing
- Sign up at scorpioedu.org/signup — teachers create a Scorpio Network after onboarding

SOCRATIC TUTORING (PHYSICS QUESTIONS / DEMO / TRY AI):
When a visitor asks a physics question, conceptual problem, homework question, or derivation:
- Embody Raise, Scorpio's Socratic physics learning assistant.
- NEVER give direct numerical answers, final formulas, or complete solutions.
- Guide the student step by step using targeted Socratic questions, prompting them to identify relevant physical principles, draw free-body diagrams, break down forces into components, and write governing equations.
- Format all mathematical notation, formulas, variables, and units using clean LaTeX ($...$ inline, $$...$$ block).

TONE: Be warm, confident, and genuinely helpful. You're excited about Scorpio because you know it actually works. Keep most answers to 2–4 sentences. Use markdown formatting (bold, bullets) for clarity. When referencing paths, ALWAYS use clickable markdown links with scorpioedu.org as the base, e.g., [scorpioedu.org/research](https://scorpioedu.org/research). Guide interested visitors specifically toward scorpioedu.org/signup. Never make up features that don't exist.`;

const unavailable = (error: string) =>
  NextResponse.json({ error, unavailable: true }, { status: 503, headers: { 'Retry-After': '300' } });

function dailyCap(): number {
  const n = Number(process.env.LANDING_DAILY_CAP);
  return Number.isInteger(n) && n > 0 ? n : LANDING_DAILY_CAP_DEFAULT;
}

type Admission = { ok: true; remaining: number } | { ok: false; reason: 'visitor' | 'ip' | 'daily' };

/** Atomically checks and increments the per-visitor, per-IP-per-day and global-per-day counters. */
async function admit(visitorId: string, ipHash: string | null): Promise<Admission> {
  const day = new Date().toISOString().slice(0, 10);
  const visitorRef = adminDb.collection('landing_visitors').doc(`c_${visitorId}`);
  const ipRef = ipHash ? adminDb.collection('landing_visitors').doc(`ip_${ipHash}_${day}`) : null;
  const dailyRef = adminDb.collection('landing_daily').doc(day);
  const cap = dailyCap();
  return adminDb.runTransaction(async (tx): Promise<Admission> => {
    const [v, ip, d] = await Promise.all([tx.get(visitorRef), ipRef ? tx.get(ipRef) : Promise.resolve(null), tx.get(dailyRef)]);
    const visitorCount: number = v.exists ? (v.data()?.messageCount ?? 0) : 0;
    const ipCount: number = ip && ip.exists ? (ip.data()?.messageCount ?? 0) : 0;
    const dailyCount: number = d.exists ? (d.data()?.count ?? 0) : 0;
    if (visitorCount >= LANDING_LIMIT) return { ok: false, reason: 'visitor' };
    if (ipCount >= LANDING_IP_DAILY_LIMIT) return { ok: false, reason: 'ip' };
    if (dailyCount >= cap) return { ok: false, reason: 'daily' };
    const now = new Date();
    tx.set(visitorRef, { messageCount: visitorCount + 1, lastMessageAt: now, ...(visitorCount === 0 ? { firstMessageAt: now } : {}) }, { merge: true });
    if (ipRef) tx.set(ipRef, { messageCount: ipCount + 1, lastMessageAt: now }, { merge: true });
    tx.set(dailyRef, { count: dailyCount + 1, updatedAt: now }, { merge: true });
    return { ok: true, remaining: LANDING_LIMIT - (visitorCount + 1) };
  });
}

/** Logs when the landing organization has used 80% or more of its budget. Never throws. */
async function warnIfNearBudget(orgId: string) {
  try {
    const org = (await adminDb.collection('organizations').doc(orgId).get()).data();
    const limit = Number(org?.aiBudgetLimit) || 0;
    if (limit <= 0) return;
    const used = (Number(org?.aiUsageCurrent) || 0) + (Number(org?.aiUsageReserved) || 0);
    if (used >= limit * BUDGET_ALERT_RATIO) {
      console.warn(`[Landing Chat] ALERT: landing org budget past 80% (${Math.round((used / limit) * 100)}% used)`);
    }
  } catch (err) {
    console.error('[Landing Chat] budget alert check failed:', err instanceof Error ? err.message : err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (typeof message !== "string" || message.length > 4000) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Fail closed: without a budgeted landing org or a signing secret, never reach the provider.
    const landingOrgId = process.env.LANDING_ORG_ID;
    const secret = getVisitorSecret();
    if (!landingOrgId || !secret) {
      console.error('[Landing Chat] not configured: LANDING_ORG_ID or LANDING_VISITOR_COOKIE_SECRET missing');
      return unavailable('The demo is temporarily unavailable. Please try again later.');
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
          httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: VISITOR_COOKIE_MAX_AGE_S,
        });
      }
      return res;
    };

    if (ipHash) {
      const rate = await checkRateLimit(req, `ip_${ipHash}`, 'landing', { windowMs: 60000, maxRequests: 5 });
      if (!rate.allowed) return withCookie(NextResponse.json({ error: rate.error }, { status: 429, headers: rate.retryAfterSeconds ? { 'Retry-After': String(rate.retryAfterSeconds) } : undefined }));
    }

    let admission: Admission;
    try {
      admission = await admit(visitorId, ipHash);
    } catch (dbErr) {
      console.error('[Landing Chat] counter transaction failed; refusing request:', dbErr instanceof Error ? dbErr.message : dbErr);
      return withCookie(unavailable('The demo is temporarily unavailable. Please try again later.'));
    }

    if (!admission.ok) {
      if (admission.reason === 'daily') {
        console.error('[Landing Chat] ALERT: global daily message cap reached');
        return withCookie(unavailable('The demo has reached its daily capacity. Please try again tomorrow or sign up.'));
      }
      return withCookie(NextResponse.json({
        error: `You've reached the ${LANDING_LIMIT}-message demo limit. Sign up for unlimited access.`,
        limitReached: true,
      }, { status: 429 }));
    }

    // Generate AI response (server-side direct REST call — avoids firebase/ai client SDK in Cloud Run)
    let result;
    try {
      result = await billingContext.run({ organizationId: landingOrgId, type: "landing" }, () => callGeminiDirect(`${LANDING_SYSTEM_PROMPT}\n\nVisitor question: ${message}`));
    } catch (aiErr) {
      if (aiErr instanceof AiBudgetError) {
        console.error('[Landing Chat] landing budget refused the request:', aiErr.message);
        return withCookie(unavailable('The demo is temporarily unavailable. Please try again later.'));
      }
      throw aiErr;
    }

    await warnIfNearBudget(landingOrgId);

    return withCookie(NextResponse.json({
      text: result.text,
      remaining: admission.remaining,
    }));
  } catch (error: unknown) {
    return errorResponse(error, 'landing-chat');
  }
}
