// Diagram blocks inside model text: find them, and drop the ones that would mislead a student.

import { render } from "./index";

const FENCE = /```dg[^\n]*\n([\s\S]*?)```[ \t]*\n?/g;

export interface DiagramAudit {
  /** The text with unusable diagram blocks removed. */
  text: string;
  /** Blocks kept. */
  kept: number;
  /** Blocks removed, with the renderer's reasons (for logs, not for students). */
  dropped: string[];
  /** Readability warnings on the blocks that were kept (for logs). */
  warnings: string[];
}

/** Words that say a body is at rest or at constant velocity, so its forces must balance. */
const EQUILIBRIUM =
  /\b(at rest|stationary|equilibrium|constant (velocity|speed)|not (moving|accelerating)|doesn'?t (move|accelerate)|isn'?t (moving|accelerating)|balanced|net force (is )?(zero|0)|sitting|sits|resting|rests|hangs?|hanging)\b/i;

/**
 * Keep a model's diagram only if it can be drawn and says nothing false. Nobody reviews a live
 * tutor's drawings, so:
 * - errors, or a block the model never closed: removed (a student never sees a broken diagram);
 * - "physics" warnings (an arrow through a block, unbalanced forces on a body at rest, a force
 *   "X on Y" not on Y or pulling where it should push): removed, because a wrong picture teaches
 *   the wrong thing;
 * - readability and markup warnings: kept, and returned for logging.
 * Whether a body is at rest is read from the reply text just before the diagram.
 */
export function auditDiagramBlocks(text: string): DiagramAudit {
  const dropped: string[] = [];
  const warnings: string[] = [];
  let kept = 0;
  let out = text.replace(FENCE, (block, src: string, offset: number) => {
    const before = text.slice(Math.max(0, offset - 600), offset);
    const r = render(src, { equilibrium: EQUILIBRIUM.test(before) });
    const wrong = r.warnings.filter((w) => w.kind === "physics");
    if (r.ok && !wrong.length) {
      kept++;
      for (const w of r.warnings) warnings.push(`line ${w.line}: ${w.msg}`);
      return block;
    }
    dropped.push(
      [...r.errors, ...wrong].map((e) => `line ${e.line}: ${e.msg}`).join("; ") ||
        "could not be drawn",
    );
    return "";
  });
  const open = out.lastIndexOf("```dg");
  if (open !== -1 && !/```dg[^\n]*\n[\s\S]*?```/.test(out.slice(open))) {
    dropped.push("block was not closed");
    out = out.slice(0, open);
  }
  return { text: out.replace(/\n{3,}/g, "\n\n").trimEnd(), kept, dropped, warnings };
}

/**
 * For text that is still arriving (a typing effect): hide a diagram block until its closing fence
 * is there, so a half-written diagram is never drawn. The text before the block is unchanged.
 */
export function hideOpenDiagramBlock(text: string): string {
  const open = text.lastIndexOf("```dg");
  if (open === -1) return text;
  const closed = /```dg[^\n]*\n[\s\S]*?```/.test(text.slice(open));
  return closed ? text : text.slice(0, open).trimEnd();
}
