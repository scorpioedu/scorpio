// Diagrams on AI-drafted problems: which are attached, which are left out, and what the reviewer is
// told. All problems here are made up for the test.
import { attachDiagram, plotFacts } from "../src/lib/content/problem-diagram";
import {
  generateProblems,
  generatorSystemInstruction,
  type ModelCall,
} from "../src/lib/content/problem-generator";
import type { DraftProblem } from "../src/lib/content/problem-format";
import { render } from "../src/lib/diagram";

const base: DraftProblem = {
  text: "A rover's velocity falls steadily from 12 m/s at t = 0 s to 0 m/s at t = 6.0 s, then to -8.0 m/s at t = 10 s. What is its displacement from t = 0 s to t = 10 s?",
  type: "numeric",
  correctAnswer: "20 m",
  solution: "Area above minus area below: 36 - 16 = 20 m.",
  distractors: [],
  difficulty: "medium",
  points: 10,
  apTopic: "1.3",
};
const VT = "plot x=t[s] y=v[m/s]\nseg 0,12 6,0 10,-8\nxt 2 4 6 8 10\nyt -8 -4 4 8 12";

describe("attachDiagram", () => {
  it("leaves the problem alone when there is no diagram", () => {
    for (const raw of [undefined, "", "   ", 42]) {
      expect(attachDiagram(base, raw)).toEqual({ text: base.text, attached: false, warnings: [] });
    }
  });

  it("appends a good graph as a dg block and confirms the graph agrees with the key", () => {
    const d = attachDiagram(base, VT);
    expect(d.attached).toBe(true);
    expect(d.text).toBe(`${base.text}\n\n\`\`\`dg\n${VT}\n\`\`\``);
    expect(d.warnings.join(" ")).toMatch(
      /area under the graph from t \(s\) = 0 to 10 is 20, which matches the key/,
    );
  });

  it("tells the reviewer when nothing on the graph matches the key", () => {
    const wrong = "plot x=t[s] y=v[m/s]\nseg 0,12 6,0 10,-4\nxt 2 4 6 8 10\nyt -4 4 8 12";
    const d = attachDiagram({ ...base, text: base.text.replace("-8.0", "-4.0") }, wrong);
    expect(d.attached).toBe(true);
    expect(d.warnings.join(" ")).toMatch(/nothing read off the graph equals the key 20/);
  });

  it("accepts a source the model wrapped in its own fence", () => {
    expect(attachDiagram(base, "```dg\n" + VT + "\n```").attached).toBe(true);
  });

  it("leaves out a diagram that cannot be drawn, and says why", () => {
    const d = attachDiagram(base, "plot\nseg 0,12 6,zero");
    expect(d.attached).toBe(false);
    expect(d.text).toBe(base.text);
    expect(d.warnings[0]).toMatch(/could not be drawn.*line 2/);
  });

  it("leaves out a diagram that shows the answer", () => {
    const p: DraftProblem = {
      ...base,
      text: "A 0.50 kg rocket starts from rest. The net force on it rises steadily from 0 N to 24 N over 3.0 s. What is its speed at t = 3.0 s?",
      correctAnswer: "72 m/s",
    };
    const d = attachDiagram(p, 'plot x=t[s] y=F[N]\nseg 0,0 3,24\nnote 1.5,20 "v = 72 m/s"');
    expect(d.attached).toBe(false);
    expect(d.warnings[0]).toMatch(/showed the answer \(72\)/);
  });

  it("flags numbers the problem never states", () => {
    const d = attachDiagram(base, VT + '\nnote 3,14 "top speed 15 m/s"');
    expect(d.attached).toBe(true);
    expect(d.warnings.join(" ")).toMatch(/never states: 15\./);
    // the graph's own scale ticks are not claims
    expect(attachDiagram(base, VT).warnings.join(" ")).not.toMatch(/never states/);
  });

  it("attaches a picture that may be wrong, but warns the reviewer", () => {
    const p: DraftProblem = {
      ...base,
      type: "multiple-choice",
      options: ["a", "b", "c", "d"],
      correctAnswer: "a",
      text: "A 12 kg crate on a floor is pushed with 45 N at 30 degrees below the horizontal. Which statement is right?",
    };
    const d = attachDiagram(
      p,
      'scene\nground 0..5\nblock S 2,0 w=1.2 h=0.6 "12 kg"\nf S.tl -30 1.3 "45 N"',
    );
    expect(d.attached).toBe(true);
    expect(d.warnings[0]).toMatch(/Diagram may be wrong \(line 4\): arrow "45 N" runs through/);
  });

  it("leaves out a diagram that would push the text past the length limit", () => {
    const d = attachDiagram({ ...base, text: base.text + " ".repeat(10) + "x".repeat(3800) }, VT);
    expect(d.attached).toBe(false);
    expect(d.warnings[0]).toMatch(/too long/);
  });
});

describe("plotFacts", () => {
  it("reads areas, end values, peaks and slopes", () => {
    const facts = plotFacts(render(VT));
    const get = (label: string) => facts.find((f) => f.label.startsWith(label))!.value;
    expect(get("area under the graph")).toBeCloseTo(20);
    expect(get("value at")).toBeCloseTo(-8);
    expect(get("largest size")).toBeCloseTo(12);
    expect(get("slope from t (s) = 0 to 6")).toBeCloseTo(-2);
    expect(get("total area")).toBeCloseTo(52); // 36 above + 16 below: distance, not displacement
  });
});

describe("generator and diagrams", () => {
  it("asks for an optional diagram and gives the model the language reference", () => {
    const s = generatorSystemInstruction();
    expect(s).toContain('"diagram"?: string');
    expect(s).toContain("DIAGRAM LANGUAGE:");
    expect(s).toContain("plot x=t[s] y=v[m/s]");
    expect(s).toMatch(/never the answer/);
  });

  it("puts a usable diagram in the draft's text and its notes in the warnings", async () => {
    const call: ModelCall = async (req) => {
      if (req.systemInstruction.startsWith("You write")) {
        const { text, type, correctAnswer, solution, difficulty } = base;
        return {
          text: JSON.stringify({
            problems: [
              { text, type, correctAnswer, solution, difficulty, distractors: [], diagram: VT },
            ],
          }),
        };
      }
      return { text: JSON.stringify({ reasoning: "area", answer: "20 m" }) };
    };
    const [d] = await generateProblems({ apTopic: "1.3", count: 1 }, call);
    expect(d.problem!.text).toContain("```dg\nplot x=t[s]");
    expect(d.warnings.join(" ")).toMatch(/matches the key/);
    expect(d.check).toMatchObject({ agrees: true });
  });
});

describe("diagram repair round", () => {
  const draftWith = (diagram: string) => {
    const { text, type, correctAnswer, solution, difficulty } = base;
    return JSON.stringify({
      problems: [{ text, type, correctAnswer, solution, difficulty, distractors: [], diagram }],
    });
  };

  it("sends the renderer's messages back once and keeps the corrected diagram", async () => {
    const prompts: string[] = [];
    const call: ModelCall = async (req) => {
      if (req.systemInstruction.startsWith("You write"))
        return { text: draftWith("plot x=t[s] y=v[m/s]\nseg 0,12 6,0 10,-8") };
      if (req.systemInstruction.startsWith("You fix")) {
        prompts.push(req.prompt);
        return { text: JSON.stringify({ diagram: VT }) };
      }
      return { text: JSON.stringify({ answer: "20 m" }) };
    };
    const [d] = await generateProblems({ apTopic: "1.3", count: 1 }, call);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatch(/not on a labelled tick/);
    expect(d.problem!.text).toContain("yt -8 -4 4 8 12");
    expect(d.warnings[0]).toMatch(/corrected version/);
  });

  it("keeps the first outcome when the retry is no better or fails", async () => {
    for (const fix of [JSON.stringify({ diagram: "plot\nseg 0,zero" }), "not json", null]) {
      const call: ModelCall = async (req) => {
        if (req.systemInstruction.startsWith("You write"))
          return { text: draftWith("plot\nseg 0,12 6,zero") };
        if (req.systemInstruction.startsWith("You fix")) {
          if (fix === null) throw new Error("down");
          return { text: fix };
        }
        return { text: JSON.stringify({ answer: "20 m" }) };
      };
      const [d] = await generateProblems({ apTopic: "1.3", count: 1 }, call);
      expect(d.problem!.text).not.toContain("```dg");
      expect(d.warnings.join(" ")).toMatch(/could not be drawn/);
    }
  });

  it("does not call the model again for a clean diagram", async () => {
    let fixes = 0;
    const call: ModelCall = async (req) => {
      if (req.systemInstruction.startsWith("You write")) return { text: draftWith(VT) };
      if (req.systemInstruction.startsWith("You fix")) fixes++;
      return { text: JSON.stringify({ answer: "20 m" }) };
    };
    await generateProblems({ apTopic: "1.3", count: 1 }, call);
    expect(fixes).toBe(0);
  });
});

describe("graph values only the picture gives", () => {
  it("flags a graph corner the text never states", () => {
    const p = { ...base, text: base.text.replace("12 m/s", "a steady speed") };
    expect(attachDiagram(p, VT).warnings.join(" ")).toMatch(/Only the graph gives 12/);
    expect(attachDiagram(base, VT).warnings.join(" ")).not.toMatch(/Only the graph/);
  });
});
