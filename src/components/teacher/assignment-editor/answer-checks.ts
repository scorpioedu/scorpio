"use client";

// "Check this answer" flags for generated questions whose key a second solve disagreed with
// (POST /api/ai/generate returns `answerCheck` per question). The flags live here, beside the
// editor, and never on the question objects, so they cannot be saved into an assignment or reach
// students. A flag shows until the teacher changes that question's answer or dismisses it.
import { useSyncExternalStore } from "react";
import type { Question, RawQuestion } from "./types";

export interface AnswerFlag {
  /** The generated answer the second solve disagreed with. */
  key: string;
  /** What the second solve answered. */
  checkedAnswer: string;
}

let flags: ReadonlyMap<string, AnswerFlag> = new Map();
const listeners = new Set<() => void>();

function publish(next: Map<string, AnswerFlag>) {
  flags = next;
  listeners.forEach((listener) => listener());
}

/** Flags the editor questions made from generated ones (same order) that came back "disagrees"; returns how many. */
export function flagAnswerChecks(generated: RawQuestion[], questions: Question[]): number {
  const next = new Map(flags);
  let flagged = 0;
  generated.forEach((raw, i) => {
    const question = questions[i];
    if (!question || raw.answerCheck !== "disagrees") return;
    const checkedAnswer = typeof raw.checkedAnswer === "string" ? raw.checkedAnswer.trim() : "";
    next.set(question.id, { key: question.correctAnswer ?? "", checkedAnswer });
    flagged++;
  });
  if (flagged) publish(next);
  return flagged;
}

export function dismissAnswerCheck(questionId: string): void {
  if (!flags.has(questionId)) return;
  const next = new Map(flags);
  next.delete(questionId);
  publish(next);
}

/** The flag to show on a question: none once its answer differs from the one that was checked. */
export function activeAnswerFlag(
  question: Pick<Question, "id" | "correctAnswer">,
  current: ReadonlyMap<string, AnswerFlag> = flags,
): AnswerFlag | undefined {
  const flag = current.get(question.id);
  return flag && (question.correctAnswer ?? "") === flag.key ? flag : undefined;
}

/** Drops the flags of questions whose answer has been edited, so undoing the edit does not bring one back. */
export function settleAnswerChecks(questions: Pick<Question, "id" | "correctAnswer">[]): void {
  const edited = questions.filter((q) => flags.has(q.id) && !activeAnswerFlag(q));
  if (!edited.length) return;
  const next = new Map(flags);
  edited.forEach((q) => next.delete(q.id));
  publish(next);
}

export function clearAnswerChecks(): void {
  if (flags.size) publish(new Map());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => flags;

export function useAnswerFlags(): ReadonlyMap<string, AnswerFlag> {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
