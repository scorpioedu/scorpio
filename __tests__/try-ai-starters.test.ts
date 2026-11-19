import { auditDiagramBlocks } from "../src/lib/diagram/blocks";
import { render } from "../src/lib/diagram";
import { TRY_AI_STARTERS, withoutDiagrams } from "../src/lib/ai/try-ai-starters";

describe("Try AI example replies", () => {
  it.each(TRY_AI_STARTERS.map((s) => [s.label, s] as const))(
    "%s: its diagram draws, passes the live checks, and matches the card",
    (_label, s) => {
      const r = render(s.diagram);
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
      const audit = auditDiagramBlocks(s.response);
      expect(audit.dropped).toEqual([]);
      expect(audit.kept).toBe(1);
      expect(s.response).toContain("```dg\n" + s.diagram + "\n```");
    },
  );

  it("drops diagrams cleanly when they are switched off", () => {
    for (const s of TRY_AI_STARTERS) {
      const text = withoutDiagrams(s.response);
      expect(text).not.toContain("```");
      expect(text).not.toMatch(/\n{3,}/);
      // No sentence is left introducing a picture that is no longer there.
      expect(text.split("\n\n")[0]).not.toMatch(/:$/);
    }
  });
});
