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

// Every kind's student-visible numbers go through the same two checks. The renderer reports what
// it drew, so a value it computes and prints (an image distance, a wavelength) is covered too.
describe("answer-leak and invented-number checks on the newer kinds", () => {
  const problem = (text: string, correctAnswer: string): DraftProblem => ({
    ...base,
    text,
    correctAnswer,
    solution: "",
  });
  const leaked = (d: ReturnType<typeof attachDiagram>) =>
    !d.attached && /showed the answer/.test(d.warnings.join(" "));
  const invented = (d: ReturnType<typeof attachDiagram>) =>
    d.warnings.find((w) => /numbers the problem never states/.test(w));

  describe("circuit", () => {
    const p = problem(
      "A 12 V battery is connected in series with a 4 Ω resistor R_1 and an unknown resistor R_2. The current is 1.0 A. What is the resistance of R_2?",
      "8 Ω",
    );
    it("leaves out a circuit that prints the unknown resistance", () => {
      const d = attachDiagram(
        p,
        `circuit\nbattery a c 12V\nresistor a b 4Ω R_1\nresistor b c 8Ω R_2`,
      );
      expect(leaked(d)).toBe(true);
      expect(d.warnings[0]).toContain("(8)");
    });
    it("attaches the same circuit with the unknown left unvalued, with nothing to flag", () => {
      const d = attachDiagram(p, `circuit\nbattery a c 12V\nresistor a b 4Ω R_1\nresistor b c R_2`);
      expect(d.attached).toBe(true);
      expect(d.warnings).toEqual([]); // R_1 and R_2 are names: their subscripts are not numbers
    });
    it("flags an element value the text never gives", () => {
      const d = attachDiagram(p, `circuit\nbattery a c 12V\nresistor a b 6Ω R_1\nresistor b c R_2`);
      expect(d.attached).toBe(true);
      expect(invented(d)).toContain("never states: 6.");
    });
  });

  describe("bars and motion: values read against a numbered axis", () => {
    const energy = problem(
      "A 4 J block slides down a rough ramp and friction removes 1 J. How much kinetic energy does it have at the bottom?",
      "3 J",
    );
    it("a bar chart with an axis gives the missing bar's height away", () => {
      expect(
        leaked(attachDiagram(energy, `bars energy unit=J\ninitial U_g 4\nwork W_f -1\nfinal K 3`)),
      ).toBe(true);
    });
    it("without an axis the heights are relative and nothing can be read off", () => {
      const d = attachDiagram(energy, `bars energy\ninitial U_g 4\nwork W_f -1\nfinal K 3`);
      expect(d.attached).toBe(true);
      expect(d.warnings).toEqual([]);
    });
    it("an unknown bar keeps the answer off a numbered chart", () => {
      const d = attachDiagram(energy, `bars energy unit=J\ninitial U_g 4\nwork W_f -1\nfinal K ?`);
      expect(d.attached).toBe(true);
      expect(invented(d)).toBeUndefined(); // axis numbers are scale, not claims
    });
    const car = problem(
      "A car starts from rest and accelerates at 2 m/s^2. How far has it gone after 4 s?",
      "16 m",
    );
    it("a motion map with a numbered axis shows where the last dot is", () => {
      expect(
        leaked(attachDiagram(car, `motion dt=1 axis unit=m\nobj "car" x0=0 v0=0 a=2 n=4`)),
      ).toBe(true);
      const d = attachDiagram(car, `motion dt=1 v num\nobj "car" x0=0 v0=0 a=2 n=4`);
      expect(d.attached).toBe(true);
      expect(invented(d)).toBeUndefined(); // dot numbers 0–4 are scale
    });
  });

  describe("ray", () => {
    const lens = problem(
      "An object 4 cm tall stands 30 cm from a converging lens of focal length 10 cm. How far from the lens is the image?",
      "15 cm",
    );
    it("a diagram that prints the computed image distance is left out", () => {
      expect(leaked(attachDiagram(lens, `ray lens f=10 unit=cm num=all\nobj 30 h=4`))).toBe(true);
      // a virtual image's distance is printed as −15: still the answer to "how far"
      const magnifier = problem(
        "An object stands 6 cm from a converging lens of focal length 10 cm. How far from the lens is the image?",
        "15 cm",
      );
      expect(leaked(attachDiagram(magnifier, `ray lens f=10 unit=cm num=all\nobj 6`))).toBe(true);
    });
    it("the given numbers, or none, are fine: 2F is a name, not a number", () => {
      for (const src of [
        `ray lens f=10 unit=cm num\nobj 30 h=4`,
        `ray lens f=10 unit=cm setup\nobj 30 h=4`,
      ]) {
        const d = attachDiagram(lens, src);
        expect(d.attached).toBe(true);
        expect(d.warnings).toEqual([]);
      }
    });
    it("a refraction diagram with num=all prints the refracted angle", () => {
      const p = problem(
        "Light in air strikes glass of index 1.5 at 40° from the normal. Find the angle of refraction.",
        "25.4°",
      );
      expect(leaked(attachDiagram(p, `ray refract n1=1 n2=1.5 in=40 num=all`))).toBe(true);
      expect(attachDiagram(p, `ray refract n1=1 n2=1.5 in=40 num`).warnings).toEqual([]);
    });
  });

  describe("pv", () => {
    const gas = problem(
      "A gas at 6 kPa and 2 L expands at constant temperature to 4 L. What is its final pressure?",
      "3 kPa",
    );
    it("numbered axes let the final state be read off", () => {
      expect(
        leaked(
          attachDiagram(gas, `pv num P=kPa V=L\nstate A V=2 P=6\nstate B V=4\nisothermal A B`),
        ),
      ).toBe(true);
    });
    it("without numbers the same diagram is attached clean", () => {
      const d = attachDiagram(gas, `pv P=kPa V=L\nstate A V=2 P=6\nstate B V=4\nisothermal A B`);
      expect(d.attached).toBe(true);
      expect(d.warnings).toEqual([]);
    });
  });

  describe("levels and wave: computed values the renderer prints", () => {
    const atom = problem(
      "An atom has levels at -13.6 eV (n = 1), -3.4 eV (n = 2) and -1.51 eV (n = 3). What wavelength is emitted in the n = 3 to n = 2 transition?",
      "656 nm",
    );
    const H = `levels\nlevel -13.6 "n=1"\nlevel -3.4 "n=2"\nlevel -1.51 "n=3"\n`;
    it("a printed wavelength is the answer", () => {
      expect(leaked(attachDiagram(atom, H + `trans 3 2 show=lambda`))).toBe(true);
      const d = attachDiagram(atom, H + `trans 3 2`);
      expect(d.attached).toBe(true);
      expect(d.warnings).toEqual([]);
    });
    it("reads a frequency printed in scientific notation", () => {
      // ΔE = 1.89 eV -> f = 4.57×10^14 Hz, however the key writes it
      for (const key of ["4.57e14 Hz", "4.57 × 10^14 Hz"])
        expect(leaked(attachDiagram(problem(atom.text, key), H + `trans 3 2 show=f`))).toBe(true);
    });
    it("fringe positions are claims; order numbers are only a scale", () => {
      const slits = problem(
        "Light of wavelength 600 nm passes through two slits 0.2 mm apart and falls on a screen 1.5 m away. How far apart are the bright fringes?",
        "4.5 mm",
      );
      expect(leaked(attachDiagram(slits, `wave double lambda=600nm d=0.2mm L=1.5m num=all`))).toBe(
        true,
      );
      const d = attachDiagram(slits, `wave double orders=3 lambda=600nm d=0.2mm L=1.5m num`);
      expect(d.attached).toBe(true);
      expect(d.warnings).toEqual([]);
    });
  });

  it("still reads plots, free-body diagrams and scenes from their source, as before", () => {
    const p = problem("A 2 kg block hangs at rest from a rope. What is the tension?", "19.6 N");
    expect(leaked(attachDiagram(p, `fbd dot "m"\nf up "T = 19.6 N" 1\nf down F_g 1`))).toBe(true);
    expect(attachDiagram(p, `fbd dot "m"\nf up T 1\nf down F_g 1`).warnings).toEqual([]);
  });
});
