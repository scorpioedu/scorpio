import { billingContext } from '../billing-context';
import { adminDb } from '../firebase-admin';
import { scrubPII, type ScrubLevel } from '../../../functions/src/pii';
import { AiBudgetError, AiInputError, AiProviderError } from './errors';
import { reserveBudget, settleBudget, estimateMaximumCost } from '../../../functions/src/metering';
/**
 * Direct Gemini API configuration for Scorpio AI.
 * Uses a server-only key, bounded requests, and transactional budget reservations.
 */

/** Wire types for the subset of the Gemini REST API Scorpio uses. */
export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  [key: string]: unknown;
}
export interface GeminiContent {
  role?: string;
  parts: GeminiPart[];
}
export interface GeminiGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: unknown;
  [key: string]: unknown;
}
export interface GeminiRequest {
  contents?: (string | GeminiContent)[];
  prompt?: string;
  scrubLevel?: ScrubLevel;
  generationConfig?: GeminiGenerationConfig;
  safetySettings?: unknown[];
  systemInstruction?: string | GeminiContent;
}
export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
}
export interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}
export interface GeminiChatOptions {
  history?: GeminiContent[];
  generationConfig?: GeminiGenerationConfig;
  safetySettings?: unknown[];
  scrubLevel?: ScrubLevel;
}

function resolveApiKey(): string {
  if (!process.env.GEMINI_API_KEY) throw new Error("Set the server-only GEMINI_API_KEY");
  return process.env.GEMINI_API_KEY;
}

// Typed failures live in ./errors (RT-17); AiBudgetError stays importable from here for existing callers.
export { AiBudgetError };

/** Scrubs every text part of a Gemini content; other part kinds and non-content values pass through. */
function scrubParts<T>(content: T, names: string[], level: ScrubLevel): T {
  if (!content || typeof content !== "object") return content;
  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return content;
  const scrubbed = parts.map((p: unknown) => {
    const text = (p as { text?: unknown } | null)?.text;
    return typeof text === "string" ? { ...(p as object), text: scrubPII(text, names, level) } : p;
  });
  return { ...content, parts: scrubbed };
}

/** Message of anything thrown, including DOMException (not an Error in every realm). Log-only. */
function errText(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'unknown';
}

async function callGeminiDirect(request: string | GeminiRequest) {
  // A bare string request carries no options; treat it as an empty options object.
  const req: GeminiRequest = typeof request === "string" ? {} : request;
  const apiKey = resolveApiKey();
  const modelName = "gemini-3.8-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  let contents: GeminiContent[] = [];
  if (typeof request === "string") {
    contents = [{ parts: [{ text: request }] }];
  } else if (Array.isArray(req?.contents)) {
    contents = req.contents.map((c): GeminiContent => {
      if (typeof c === "string") return { parts: [{ text: c }] };
      return c;
    });
  } else if (req?.prompt) {
    contents = [{ parts: [{ text: req.prompt }] }];
  }

  // Single choke point for PII: every text part leaves through here (RT-10). Idempotent, so callers
  // that already scrub are unaffected. Names come from billingContext (withScrubNames); with none
  // supplied only pattern PII (email, phone, ids...) is masked.
  const scrubNames = billingContext.getStore()?.scrubNames ?? [];
  // Callers that always scrubbed (student-authored text) opt into 'full'; everything else, notably
  // teacher-authored assignment text, only loses emails and supplied names so dates and long decimals survive.
  const scrubLevel: ScrubLevel = req?.scrubLevel === 'full' ? 'full' : 'contact';
  contents = contents.map(c => scrubParts(c, scrubNames, scrubLevel));

  const payload: {
    contents: GeminiContent[];
    generationConfig: GeminiGenerationConfig & { maxOutputTokens: number };
    safetySettings: unknown[];
    systemInstruction?: GeminiContent;
  } = {
    contents,
    generationConfig: {
      temperature: 0.7,
      ...req?.generationConfig,
      maxOutputTokens: Math.min(req?.generationConfig?.maxOutputTokens || 2048, 8192),
      thinkingConfig: { thinkingBudget: 0 },
    },
    safetySettings: req?.safetySettings || [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    ],
  };

  if (req?.systemInstruction) {
    // Trusted rules live here so untrusted text in `contents` can never outrank them.
    payload.systemInstruction = scrubParts(
      typeof req.systemInstruction === "string"
        ? { parts: [{ text: req.systemInstruction }] }
        : req.systemInstruction,
      scrubNames,
      scrubLevel,
    );
  }

  const context = billingContext.getStore();
  // Only the admin-only research route is exempt; public landing traffic must always be capped by a budget.
  const isExempt = context?.type === 'research';
  if (!context?.organizationId && !isExempt) throw new Error('An authenticated network is required for AI');
  const payloadText = JSON.stringify(payload);
  const inputBytes = Buffer.byteLength(payloadText);
  if (inputBytes > 100000) throw new AiInputError('Conversation is too long; start a new conversation');
  let reservation: string | null = null;
  if (context?.organizationId) {
    try {
      reservation = await reserveBudget(adminDb, context.organizationId, context.type, context.userId,
        estimateMaximumCost(inputBytes, payload.generationConfig.maxOutputTokens));
    } catch (budgetErr) {
      const detail = budgetErr instanceof Error ? budgetErr.message : String(budgetErr);
      if (!isExempt) throw new AiBudgetError(detail);
      console.error(`[AI] ${context.type} reservation skipped (exempt type, proceeding uncapped):`, detail);
    }
  }
  // Any failure after the hold is taken must release it: charge the input estimate, never leave it pending.
  const settleEstimate = async () => {
    if (!reservation) return;
    try {
      await settleBudget(adminDb, reservation, Math.ceil(inputBytes / 4), 0);
    } catch (settleErr) {
      console.error('[AI] failed to settle reservation after provider failure:', settleErr instanceof Error ? settleErr.message : settleErr);
    }
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(60000),
      headers: {
        "Content-Type": "application/json",
        "Referer": process.env.NEXT_PUBLIC_APP_URL || "https://scorpioedu.org",
      },
      body: payloadText,
    });
  } catch (fetchErr) {
    await settleEstimate();
    // The cause (timeout, DNS, TLS) stays in this message for server logs; callers only get a generic 502.
    throw new AiProviderError(`AI provider request failed: ${errText(fetchErr)}`);
  }

  if (!res.ok) {
    if (reservation) await settleBudget(adminDb, reservation, 0, 0);
    throw new AiProviderError(`AI provider returned ${res.status}`);
  }

  let data: { usageMetadata?: GeminiUsageMetadata; candidates?: GeminiCandidate[] };
  try {
    data = await res.json();
  } catch (parseErr) {
    await settleEstimate();
    throw new AiProviderError(`AI provider returned an unreadable body: ${errText(parseErr)}`);
  }
  if (!data.usageMetadata) {
    if (reservation) {
      console.warn('[AI] provider returned no usageMetadata; settling with the input-size estimate');
      await settleEstimate();
    }
  } else if (reservation) {
    await settleBudget(adminDb, reservation, data.usageMetadata.promptTokenCount || 0,
      (data.usageMetadata.candidatesTokenCount || 0) + (data.usageMetadata.thoughtsTokenCount || 0));
  }
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text).join("") || "";

  const responseObj = {
    text: () => text,
    usageMetadata: data.usageMetadata || {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0,
    },
    candidates: data.candidates || [],
  };

  return {
    response: Promise.resolve(responseObj),
  };
}

export const model = {
  generateContent: (request: string | GeminiRequest) => callGeminiDirect(request),
  startChat: (options?: GeminiChatOptions) => {
    const history: GeminiContent[] = [...(options?.history || [])];
    return {
      async sendMessage(prompt: string | GeminiContent) {
        const userMsg: GeminiContent = typeof prompt === "string" ? { role: "user", parts: [{ text: prompt }] } : prompt;
        const currentContents = [...history, userMsg];
        const res = await callGeminiDirect({
          contents: currentContents,
          generationConfig: options?.generationConfig,
          safetySettings: options?.safetySettings,
          scrubLevel: options?.scrubLevel,
        });
        const respObj = await res.response;
        const modelText = respObj.text();
        history.push(userMsg);
        history.push({ role: "model", parts: [{ text: modelText }] });
        return res;
      },
      getHistory: async () => history,
    };
  },
};

export type GeminiModel = typeof model;

export const CONTEXT_WINDOW_SIZE = 10;

