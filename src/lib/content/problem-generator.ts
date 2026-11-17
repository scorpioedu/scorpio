// AI drafts AP Physics 1 problems in Scorpio's numeric / multiple-choice format, then a second,
// independent AI call solves each one without seeing the key. Disagreements are flagged for the
// person who reviews every draft before it goes live (docs/content-pipeline.md).

import { apTopic, apUnit } from "@/data/ap";
import { MISCONCEPTION_TAGS } from "../../../functions/src/misconceptions";
import {
  answerAgrees,
  validateDraftProblem,
  type DraftProblem,
  type Difficulty,
} from "./problem-format";

export interface ModelReply {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}
/** Injected so tests (and scripts) can run without the real provider. */
export type ModelCall = (req: {
  systemInstruction: string;
  prompt: string;
  temperature: number;
  maxOutputTokens: number;
}) => Promise<ModelReply>;

export interface GeneratedDraft {
  /** Undefined when the draft failed validation; `raw` still holds what the model sent. */
  problem?: DraftProblem;
  raw: unknown;
  errors: string[];
  warnings: string[];
  check?: { answer: string; agrees: boolean; reasoning: string };
}

export const GENERATOR_SYSTEM_INSTRUCTION = `You write AP Physics 1 homework problems for high school students in the United States.

Rules:
- Every problem must be solvable with AP Physics 1 methods (algebra and trigonometry, no calculus) and must test the given topic.
- Use realistic numbers and SI units. Use g = 9.8 m/s^2 unless the problem says otherwise. State every value needed; do not rely on a figure.
- Write the problems yourself. Do not copy published AP exam questions or textbook problems.
- Numeric problems ask for exactly one quantity. "correctAnswer" is a number and unit only, for example "2.4 m/s" or "-15 N" or "0.25 s". Use 2-3 significant figures. No words, no equations, no "approximately".
- Multiple-choice problems have exactly 4 options. "correctAnswer" is copied exactly from the options. Wrong options must be answers a student would plausibly reach.
- "distractors" lists common wrong answers and the misconception behind each, using only ids from the MISCONCEPTION TAGS list. For multiple choice, give one entry per wrong option that reflects a misconception (copy the option text exactly). For numeric, give 1-3 wrong values a student with that misconception would compute, with units. A distractor must never equal the correct answer.
- "solution" is a short worked solution a teacher can check line by line, ending with the final answer.
- Mix conceptual and quantitative problems when asked for several, and vary the situations (carts, sports, astronauts, lab setups, everyday objects); do not reuse the same scenario, such as a truck hitting a car, across problems.

Return ONLY JSON: {"problems": [{"text": string, "type": "numeric" | "multiple-choice", "options"?: string[], "correctAnswer": string, "solution": string, "distractors": [{"answer": string, "misconception": string}], "difficulty": "easy" | "medium" | "hard"}]}`;

export const SOLVER_SYSTEM_INSTRUCTION = `You are checking an answer key. Solve the AP Physics 1 problem yourself, carefully, step by step, using g = 9.8 m/s^2 unless the problem says otherwise.
Return ONLY JSON: {"reasoning": string (brief), "answer": string}
- For a numeric problem, "answer" is a number with its unit, e.g. "2.4 m/s".
- For multiple choice, "answer" is the full text of the option you choose, copied exactly.`;

export function buildGeneratorPrompt(
  topicId: string,
  count: number,
  difficulty?: Difficulty,
): string {
  const topic = apTopic(topicId);
  const unit = topic ? apUnit(topic.unit) : undefined;
  if (!topic || !unit) throw new Error(`Unknown AP topic ${topicId}`);
  const tags = MISCONCEPTION_TAGS.filter(
    (t) =>
      t.category === "conceptual" &&
      t.id !== "other" &&
      (t.units.includes(unit.unit) || !t.units.length),
  );
  const nNumeric = Math.ceil(count / 2);
  return [
    `Write ${count} AP Physics 1 problem${count === 1 ? "" : "s"}: ${nNumeric} numeric and ${count - nNumeric} multiple-choice.`,
    `Unit ${unit.unit}: ${unit.title}. Topic ${topic.id}: ${topic.title} (${topic.summary})`,
    difficulty ? `Difficulty: ${difficulty}.` : "Spread difficulty from easy to hard.",
    "",
    "MISCONCEPTION TAGS (id: what the student believes):",
    ...tags.map((t) => `- ${t.id}: ${t.label}`),
  ].join("\n");
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*|```$/g, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

function solverPrompt(p: DraftProblem): string {
  const opts = p.options?.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n");
  return `PROBLEM (${p.type === "numeric" ? "numeric answer" : "multiple choice"}):\n${p.text}${opts ? `\n\nOPTIONS:\n${opts}` : ""}`;
}

/** Second opinion on the key from a fresh call that never sees it. Never throws. */
export async function independentlySolve(
  problem: DraftProblem,
  call: ModelCall,
): Promise<GeneratedDraft["check"]> {
  try {
    const reply = await call({
      systemInstruction: SOLVER_SYSTEM_INSTRUCTION,
      prompt: solverPrompt(problem),
      temperature: 0,
      maxOutputTokens: 1500,
    });
    const parsed = parseJson(reply.text) as { answer?: unknown; reasoning?: unknown } | undefined;
    const answer = typeof parsed?.answer === "string" ? parsed.answer.trim().slice(0, 300) : "";
    if (!answer) return { answer: "", agrees: false, reasoning: "The checker returned no answer." };
    // Multiple choice: accept "B", "B.", "B) text" or the option text itself.
    let resolved = answer;
    if (problem.options && !problem.options.includes(answer)) {
      const lettered = answer.match(/^\(?([A-F])(?:[.):]|\s|$)\s*(.*)$/i);
      const rest = lettered?.[2]?.trim();
      if (rest && problem.options.includes(rest)) resolved = rest;
      else if (lettered)
        resolved = problem.options[lettered[1].toUpperCase().charCodeAt(0) - 65] ?? answer;
    }
    return {
      answer: resolved,
      agrees: answerAgrees(problem, resolved),
      reasoning: typeof parsed?.reasoning === "string" ? parsed.reasoning.slice(0, 3000) : "",
    };
  } catch (error) {
    return {
      answer: "",
      agrees: false,
      reasoning: `The checker failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function generateProblems(
  input: { apTopic: string; count: number; difficulty?: Difficulty },
  call: ModelCall,
): Promise<GeneratedDraft[]> {
  const count = Math.max(1, Math.min(5, Math.floor(input.count)));
  const reply = await call({
    systemInstruction: GENERATOR_SYSTEM_INSTRUCTION,
    prompt: buildGeneratorPrompt(input.apTopic, count, input.difficulty),
    temperature: 0.8,
    maxOutputTokens: 6000,
  });
  const parsed = parseJson(reply.text) as { problems?: unknown } | undefined;
  if (!parsed || !Array.isArray(parsed.problems))
    throw new Error("The model did not return a problems list");
  const drafts: GeneratedDraft[] = parsed.problems.slice(0, count).map((raw) => {
    // Tolerance is the reviewer's call (models send fractions like 0.05 meaning 5%); default 3% applies.
    const { tolerance: _t, ...rest } = (raw && typeof raw === "object" ? raw : {}) as Record<
      string,
      unknown
    >;
    void _t;
    const v = validateDraftProblem(rest, input.apTopic);
    return { problem: v.problem, raw, errors: v.errors, warnings: v.warnings };
  });
  await Promise.all(
    drafts.map(async (d) => {
      if (d.problem) d.check = await independentlySolve(d.problem, call);
    }),
  );
  return drafts;
}
