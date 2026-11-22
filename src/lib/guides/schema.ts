// The shape of a course guide: one file per unit, one guide per AP topic. See docs/courses.md
// ("Guides"). The schema says what a guide is; src/lib/guides/verify.ts checks that what it says is
// true (the LaTeX compiles, the diagrams draw, the numbers agree).
//
// Import only types from this file in components, so zod stays out of the pages that show guides.
import { z } from "zod";

const text = z.string().trim().min(1);

/** A diagram in the diagram language (src/lib/diagram), without the ```dg fence. */
const diagramSource = text;

export const equationSchema = z.strictObject({
  /** KaTeX, without dollar signs. */
  latex: text,
  /** What the equation says, in words. */
  meaning: text,
  variables: z.array(z.strictObject({ symbol: text, name: text, unit: z.string().trim() })).min(1),
  useWhen: text,
  notWhen: text,
});

/**
 * How a worked example's number is computed, so a checker can recompute it: `expr` is arithmetic
 * over the names in `givens`, and its value in `unit` is the example's answer.
 */
export const specSchema = z.strictObject({
  givens: z.record(
    z.string().regex(/^[A-Za-z_]\w*$/, "a given's name must be a plain identifier"),
    z.strictObject({ value: z.number().finite(), unit: z.string().trim() }),
  ),
  expr: text,
  unit: z.string().trim(),
});

/** An answer with a digit in it is a number someone can get wrong, so it must carry a spec. */
export const isNumericAnswer = (answer: string) => /\d/.test(answer);

export const workedExampleSchema = z
  .strictObject({
    title: text,
    prompt: text,
    /** Markdown, one step each. */
    steps: z.array(text).min(2),
    answer: text,
    /** "stepped" shows one step at a time; "ap" is written out like an exam response. */
    style: z.enum(["stepped", "ap"]),
    spec: specSchema.optional(),
  })
  .superRefine((example, ctx) => {
    if (isNumericAnswer(example.answer) && !example.spec)
      ctx.addIssue({
        code: "custom",
        path: ["spec"],
        message: "a numeric worked example needs a spec (givens, expr, unit)",
      });
  });

export const tryItParamSchema = z
  .strictObject({
    name: z.string().regex(/^[A-Za-z_]\w*$/, "a parameter's name must be a plain identifier"),
    label: text,
    min: z.number().finite(),
    max: z.number().finite(),
    step: z.number().positive(),
    default: z.number().finite(),
    unit: z.string().trim(),
  })
  .superRefine((p, ctx) => {
    if (p.min >= p.max)
      ctx.addIssue({ code: "custom", path: ["max"], message: "max must be above min" });
    if (p.default < p.min || p.default > p.max)
      ctx.addIssue({
        code: "custom",
        path: ["default"],
        message: "default must be between min and max",
      });
  });

export const topicGuideSchema = z.strictObject({
  /** The AP topic id ("4.2") in the course the file belongs to. */
  topic: z.string().regex(/^\d{1,2}\.\d{1,2}$/),
  /** One sentence. */
  bigIdea: text,
  /** Left out only where no picture helps. */
  picture: z.strictObject({ diagram: diagramSource, caption: text }).optional(),
  /** Markdown, 2–4 short paragraphs. */
  explanation: text,
  equations: z.array(equationSchema),
  /** Markdown. Required for the calculus-based courses (`requiresDerivation`). */
  derivation: text.optional(),
  workedExamples: z.array(workedExampleSchema).length(2),
  misconceptions: z
    .array(
      z.strictObject({
        /** A misconception tag of the course (functions/src/misconceptions.ts), when one fits. */
        tag: text.optional(),
        wrong: text,
        right: text,
      }),
    )
    .min(1),
  checkYourself: z.array(z.strictObject({ q: text, a: text })).length(3),
  tryIt: z
    .strictObject({
      /** Diagram source with {{name}} or {{arithmetic over names}} placeholders. */
      diagram: diagramSource,
      /** One line on what to watch while dragging. */
      caption: text.optional(),
      params: z.array(tryItParamSchema).min(1),
    })
    .optional(),
  /** Topic ids earlier in the same course. */
  prerequisites: z.array(z.string()).optional(),
  /** Markdown; shown to teachers only. */
  teacherNotes: text.optional(),
});

export const unitGuideSchema = z.strictObject({
  curriculumId: text,
  unit: z.number().int().positive(),
  guides: z.array(topicGuideSchema).min(1),
});

export type GuideEquation = z.infer<typeof equationSchema>;
export type WorkedExampleSpec = z.infer<typeof specSchema>;
export type WorkedExample = z.infer<typeof workedExampleSchema>;
export type TopicGuide = z.infer<typeof topicGuideSchema>;
export type UnitGuide = z.infer<typeof unitGuideSchema>;
