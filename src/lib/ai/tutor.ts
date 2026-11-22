import { model, CONTEXT_WINDOW_SIZE } from "./config";
import { scrubPII } from "./utils";
import { CONSTRAINT_LEVELS, ConstraintLevel } from "./constants";
import { auditDiagramBlocks } from "../diagram/blocks";
import { buildExplainPrompt, buildSolvePrompt, buildTeacherPrompt } from "./tutor-prompts";

/** Raise may draw diagrams only when RAISE_DIAGRAMS is "on" (off by default). */
export function diagramsOn(): boolean {
  return process.env.RAISE_DIAGRAMS === "on";
}

/**
 * Log replies that hit the output limit. With config.ts's thinkingBudget 0, gemini-3.8-flash mostly
 * skips thinking, but measurements (Nov 2026) saw up to 377 thinking tokens with diagrams on, and
 * those count against maxOutputTokens. If this shows up in logs, the limit needs another look.
 */
function noteCutOff(
  kind: string,
  response: {
    candidates?: { finishReason?: string }[];
    usageMetadata?: { candidatesTokenCount?: number; thoughtsTokenCount?: number };
  },
) {
  if (response.candidates?.[0]?.finishReason !== "MAX_TOKENS") return;
  console.warn(
    `Raise ${kind} reply hit the output limit: ${response.usageMetadata?.candidatesTokenCount ?? 0} reply tokens, ${response.usageMetadata?.thoughtsTokenCount ?? 0} thinking tokens`,
  );
}

/** Remove any diagram that cannot be drawn, so a student never sees a broken one. */
function cleanDiagrams(text: string): string {
  const audit = auditDiagramBlocks(text);
  if (audit.dropped.length > 0) console.warn("Raise diagram dropped:", audit.dropped.join(" | "));
  return audit.text;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function formatChatHistory(messages: ChatMessage[], userLabel = "Student"): string {
  // Take last N messages for context
  const recentMessages = messages.slice(-CONTEXT_WINDOW_SIZE);

  return recentMessages
    .map((msg) => `${msg.role === "user" ? userLabel : "Raise"}: ${msg.content}`)
    .join("\n\n");
}

export async function explainPhysicsConcept(
  concept: string,
  chatHistory: ChatMessage[] = [],
  constraintLevel: ConstraintLevel = "FULL",
  studentNames: string[] = [],
): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }> {
  const constraints = CONSTRAINT_LEVELS[constraintLevel];
  const scrubbedMessage = scrubPII(concept, studentNames);
  const historyContext =
    chatHistory.length > 0
      ? `=== PREVIOUS CONVERSATION HISTORY ===\n${formatChatHistory(chatHistory.map((m) => ({ ...m, content: scrubPII(m.content, studentNames) })))}\n=====================================\n\n`
      : "";

  const prompt = buildExplainPrompt({
    constraints,
    historyContext,
    message: scrubbedMessage,
    diagrams: diagramsOn(),
  });

  const result = await model.generateContent({
    scrubLevel: "full",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.7,
    },
  });
  const response = await result.response;
  noteCutOff("explain", response);
  return {
    text: cleanDiagrams(response.text()),
    usage: {
      inputTokens: response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
    },
  };
}

export async function helpSolveProblem(
  problem: string,
  chatHistory: ChatMessage[] = [],
  constraintLevel: ConstraintLevel = "FULL",
  assignmentContext?: string,
  studentNames: string[] = [],
  /** The assignment's AP course, when known: narrows the diagram reference to that course's kinds. */
  course?: string,
): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }> {
  const constraints = CONSTRAINT_LEVELS[constraintLevel];
  const scrubbedMessage = scrubPII(problem, studentNames);
  const historyContext =
    chatHistory.length > 0
      ? `=== PREVIOUS CONVERSATION HISTORY ===\n${formatChatHistory(chatHistory.map((m) => ({ ...m, content: scrubPII(m.content, studentNames) })))}\n=====================================\n\n`
      : "";

  const context = assignmentContext
    ? `=== STUDENT'S CURRENT ASSIGNMENT CONTEXT ===\n${scrubPII(assignmentContext, studentNames)}\n==========================================\n\n`
    : "";
  const prompt = buildSolvePrompt({
    constraints,
    context,
    historyContext,
    message: scrubbedMessage,
    diagrams: diagramsOn(),
    course,
  });

  const result = await model.generateContent({
    scrubLevel: "full",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.7,
    },
  });
  const response = await result.response;
  noteCutOff("solve", response);
  return {
    text: cleanDiagrams(response.text()),
    usage: {
      inputTokens: response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
    },
  };
}

/** Raise for teachers: full answers, problem writing, diagrams. Student names are still scrubbed. */
export async function assistTeacher(
  message: string,
  chatHistory: ChatMessage[] = [],
  studentNames: string[] = [],
): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }> {
  const scrubbedMessage = scrubPII(message, studentNames);
  const historyContext =
    chatHistory.length > 0
      ? `=== PREVIOUS CONVERSATION HISTORY ===\n${formatChatHistory(
          chatHistory.map((m) => ({ ...m, content: scrubPII(m.content, studentNames) })),
          "Teacher",
        )}\n=====================================\n\n`
      : "";

  const prompt = buildTeacherPrompt({
    historyContext,
    message: scrubbedMessage,
    diagrams: diagramsOn(),
  });

  const result = await model.generateContent({
    scrubLevel: "full",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      // Full worked solutions and problem sets run longer than student replies.
      maxOutputTokens: 2048,
      temperature: 0.5,
    },
  });
  const response = await result.response;
  noteCutOff("teacher", response);
  return {
    text: cleanDiagrams(response.text()),
    usage: {
      inputTokens: response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
    },
  };
}
