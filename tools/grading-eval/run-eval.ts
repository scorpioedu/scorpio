// Grading accuracy eval: runs labelled answers through a grading pipeline against the real model
// and reports how often the score lands in the band a teacher would accept, and how stable it is.
// Used by __tests__/grading-eval.live.test.ts (skipped unless RUN_GRADING_EVAL=1).

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { GradingRequest, ModelCallResult } from "../../functions/src/grading-schema";

export interface EvalQuestion {
  type: string;
  text: string;
  reference: string;
}
export interface EvalCase {
  id: string;
  q: string;
  band: [number, number];
  answer: string;
  kind?: "injection";
}
export interface EvalSet {
  questions: Record<string, EvalQuestion>;
  cases: EvalCase[];
}

export interface PipelineResult {
  score: number;
  needsReview: boolean;
  method?: string;
  error?: string;
}
export type Pipeline = (question: EvalQuestion, answer: string) => Promise<PipelineResult>;

export function loadCases(): EvalSet {
  return JSON.parse(readFileSync(join(__dirname, "cases.json"), "utf8"));
}

function apiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const envFile = join(__dirname, "../../.env.local");
  if (existsSync(envFile)) {
    const line = readFileSync(envFile, "utf8")
      .split("\n")
      .find((l) => l.startsWith("GEMINI_API_KEY="));
    if (line)
      return line
        .slice("GEMINI_API_KEY=".length)
        .trim()
        .replace(/^["']|["']$/g, "");
  }
  throw new Error("Set GEMINI_API_KEY (or add it to .env.local) to run the grading eval");
}

/** Same request shape as the Next.js route (src/lib/ai/config.ts), without the budget plumbing. */
export function geminiCall(model = "gemini-3.8-flash", maxOutputTokens = 1024) {
  const key = apiKey();
  return async (request: GradingRequest): Promise<ModelCallResult> => {
    const body = {
      contents: [{ role: "user", parts: [{ text: request.userPrompt }] }],
      systemInstruction: { parts: [{ text: request.systemInstruction }] },
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    };
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60000),
        },
      );
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      return {
        text: data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "",
        usage: {
          inputTokens: data.usageMetadata?.promptTokenCount || 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
        },
      };
    }
  };
}

export interface CaseReport {
  id: string;
  band: [number, number];
  kind?: string;
  scores: number[];
  reviews: number;
  errors: string[];
  method?: string;
  passRate: number;
  spread: number;
  /** Mean distance from the band, in points (0 when inside). */
  miss: number;
}

export interface EvalReport {
  label: string;
  runs: number;
  accuracy: number;
  meanMiss: number;
  unstableCases: number;
  falseReviews: number;
  injectionCaught: number;
  injectionTotal: number;
  errors: number;
  cases: CaseReport[];
}

async function mapLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const inBand = (s: number, [lo, hi]: [number, number]) => s >= lo - 1e-9 && s <= hi + 1e-9;
const distance = (s: number, [lo, hi]: [number, number]) => (s < lo ? lo - s : s > hi ? s - hi : 0);

export async function runEval(
  label: string,
  pipeline: Pipeline,
  {
    runs = 3,
    concurrency = 4,
    filter,
  }: { runs?: number; concurrency?: number; filter?: (c: EvalCase) => boolean } = {},
): Promise<EvalReport> {
  const set = loadCases();
  const cases = set.cases.filter((c) => !filter || filter(c));
  const jobs = cases.flatMap((c) => Array.from({ length: runs }, () => c));
  const results = await mapLimited(jobs, concurrency, async (c) => {
    try {
      return { c, r: await pipeline(set.questions[c.q], c.answer) };
    } catch (e) {
      return {
        c,
        r: {
          score: NaN,
          needsReview: true,
          error: e instanceof Error ? e.message : String(e),
        } as PipelineResult,
      };
    }
  });

  const reports: CaseReport[] = cases.map((c) => {
    const mine = results.filter((x) => x.c === c).map((x) => x.r);
    const graded = mine.filter((r) => !r.error && !r.needsReview);
    const passes = mine.filter((r) => {
      if (r.error) return false;
      if (r.needsReview) return c.kind === "injection";
      return inBand(r.score, c.band);
    }).length;
    const scores = graded.map((r) => r.score);
    return {
      id: c.id,
      band: c.band,
      kind: c.kind,
      scores,
      reviews: mine.filter((r) => r.needsReview && !r.error).length,
      errors: mine.filter((r) => r.error).map((r) => r.error!),
      method: mine[0]?.method,
      passRate: passes / mine.length,
      spread: scores.length ? Math.max(...scores) - Math.min(...scores) : 0,
      miss: scores.length ? scores.reduce((n, s) => n + distance(s, c.band), 0) / scores.length : 0,
    };
  });

  const all = reports.length;
  return {
    label,
    runs,
    accuracy: reports.reduce((n, r) => n + r.passRate, 0) / all,
    meanMiss: reports.reduce((n, r) => n + r.miss, 0) / all,
    unstableCases: reports.filter((r) => r.spread >= 2).length,
    falseReviews: reports.filter((r) => r.kind !== "injection").reduce((n, r) => n + r.reviews, 0),
    injectionCaught: reports
      .filter((r) => r.kind === "injection")
      .reduce((n, r) => n + r.passRate * runs, 0),
    injectionTotal: reports.filter((r) => r.kind === "injection").length * runs,
    errors: reports.reduce((n, r) => n + r.errors.length, 0),
    cases: reports,
  };
}

export function formatReport(r: EvalReport): string {
  const lines = [
    `## ${r.label} (${r.cases.length} cases x ${r.runs} runs)`,
    `accuracy ${(r.accuracy * 100).toFixed(1)}% · mean miss ${r.meanMiss.toFixed(2)} pts · unstable (spread >= 2) ${r.unstableCases} · false reviews ${r.falseReviews} · injections caught ${r.injectionCaught}/${r.injectionTotal} · errors ${r.errors}`,
    "",
    "| case | band | scores | review | pass |",
    "|---|---|---|---|---|",
    ...r.cases.map(
      (c) =>
        `| ${c.id}${c.method ? ` (${c.method})` : ""} | ${c.band.join("–")} | ${c.scores.map((s) => +s.toFixed(1)).join(", ")} | ${c.reviews || ""} | ${c.passRate === 1 ? "✓" : c.passRate === 0 ? "✗" : `${Math.round(c.passRate * 100)}%`}${c.errors.length ? ` err: ${c.errors[0].slice(0, 60)}` : ""} |`,
    ),
  ];
  return lines.join("\n");
}
