// A small, valid unit guide for tests: every topic of AP Physics 1 unit 4, built from one template.
// Tests change one thing in a copy and check that the verifier names it.
import type { TopicGuide, UnitGuide } from "../../src/lib/guides/schema";

const FILLER =
  "Momentum is the product of mass and velocity and it points the way the object moves. ".repeat(
    12,
  );

export function topicFixture(topic: string, extra: Partial<TopicGuide> = {}): TopicGuide {
  return {
    topic,
    bigIdea: "Momentum is mass times velocity, a vector.",
    picture: {
      diagram: 'scene\nground 0..5\nblock A 2,0 "m"\nf A.r right 1 "p"',
      caption: "A cart moving right has momentum to the right.",
    },
    explanation: `${FILLER}\n\nIn symbols, $\\vec{p} = m\\vec{v}$.\n\n${FILLER}`,
    equations: [
      {
        latex: "\\vec{p} = m\\vec{v}",
        meaning: "Momentum is mass times velocity.",
        variables: [
          { symbol: "\\vec{p}", name: "momentum", unit: "kg·m/s" },
          { symbol: "m", name: "mass", unit: "kg" },
          { symbol: "\\vec{v}", name: "velocity", unit: "m/s" },
        ],
        useWhen: "One object, one instant.",
        notWhen: "Not as a force.",
      },
    ],
    workedExamples: [
      {
        title: "A cart",
        prompt: "A $2.0\\ \\text{kg}$ cart moves at $3.0\\ \\text{m/s}$. Find its momentum.",
        steps: ["Write $p = mv$.", "Multiply: $(2.0)(3.0) = 6.0$."],
        answer: "$p = 6.0\\ \\text{kg·m/s}$",
        style: "stepped",
        spec: {
          givens: { m: { value: 2, unit: "kg" }, v: { value: 3, unit: "m/s" } },
          expr: "m*v",
          unit: "kg·m/s",
        },
      },
      {
        title: "Which way?",
        prompt: "A cart moves left. Which way does its momentum point?",
        steps: ["Momentum points the way the velocity does.", "The velocity is to the left."],
        answer: "To the left.",
        style: "ap",
      },
    ],
    misconceptions: [
      { tag: "momentum-not-vector", wrong: "Momentum has no direction.", right: "It is a vector." },
    ],
    checkYourself: [
      { q: "What is momentum?", a: "Mass times velocity." },
      { q: "Is it a vector?", a: "Yes." },
      { q: "What are its units?", a: "Kilogram metres per second." },
    ],
    teacherNotes: "Insist on signs.",
    ...extra,
  };
}

export function unitFixture(change: (guide: TopicGuide) => void = () => {}): UnitGuide {
  const guides = ["4.1", "4.2", "4.3", "4.4"].map((t) => topicFixture(t));
  change(guides[0]);
  return { curriculumId: "ap-physics-1", unit: 4, guides };
}

/**
 * A stand-in for the content pipeline's `evaluateSpec`, for tests only: plain arithmetic over the
 * givens. Anything but numbers, names, + - * / ^ and parentheses is refused.
 */
export function referenceEvaluator(spec: {
  givens: Record<string, { value: number; unit: string }>;
  expr: string;
  unit: string;
}): { ok: true; value: number; unit: string } | { ok: false; error: string } {
  if (!/^[\w\s+\-*/^().]+$/.test(spec.expr)) return { ok: false, error: "unsupported expression" };
  const names = Object.keys(spec.givens);
  try {
    const value = Function(
      ...names,
      `"use strict"; return (${spec.expr.replace(/\^/g, "**")});`,
    )(...names.map((n) => spec.givens[n].value));
    return Number.isFinite(value)
      ? { ok: true, value, unit: spec.unit }
      : { ok: false, error: "not a finite number" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
