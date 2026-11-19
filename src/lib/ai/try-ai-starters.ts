// The example questions on the public Try AI page (/ai). Their replies are written here, not
// generated, so a visitor sees Raise at its best without spending the demo budget. Each reply's
// diagram goes through the same checks a live reply does (__tests__/try-ai-starters.test.ts).

export interface TryAiStarter {
  /** Short name on the example card. */
  label: string;
  /** What kind of picture the reply draws, shown on the card. */
  kind: "Setup" | "Free-body diagram" | "Graph";
  prompt: string;
  /** The diagram shown on the card: the same source as the ```dg block in `response`. */
  diagram: string;
  response: string;
}

const dg = (src: string) => "```dg\n" + src + "\n```";

const INCLINE = `scene
incline R 0,0 30 5
block A on=R t=.55 "m"
text R.top+0,.4 "frictionless"`;

const ELEVATOR = `fbd box "m"
f up F_N 1.4
f down F_g 1`;

const VT_GRAPH = `plot x=t[s] y=v[m/s] xr=0,10 yr=0,12
seg 0,0 4,8 10,8
xt 4 10
yt 8
shade 0..4
note 2,10 "area = ?"`;

const PENDULUM = `scene
ceil 3 -1..1
pend Q 0,3 2 30
dash Q.pivot 0,1
dot 0,1 "lowest point"`;

export const TRY_AI_STARTERS: TryAiStarter[] = [
  {
    label: "Block on an incline",
    kind: "Setup",
    prompt: "A 5 kg block slides down a frictionless 30° incline. What is its acceleration?",
    diagram: INCLINE,
    response: `${dg(INCLINE)}

Before any numbers, let's get the physical picture right.

**Which forces act on the block?** With no friction there are only two. Name them, and say which way each one points.

**Tilt your axes.** It's easiest to use one axis along the ramp and one perpendicular to it. Gravity lines up with neither, so you'll split it into components. Which one points down the slope: $mg\\sin\\theta$ or $mg\\cos\\theta$?

Once you have that, Newton's second law along the slope gives you $a$. One prediction first: would a 10 kg block reach the bottom sooner, later, or at the same time?`,
  },
  {
    label: "Is the normal force always mg?",
    kind: "Free-body diagram",
    prompt: "My teacher said the normal force always equals mg. Is that correct?",
    diagram: ELEVATOR,
    response: `Only in one special case: a flat surface, with no vertical acceleration. Most of the time $F_N \\neq mg$.

Take a box on the floor of an elevator that is **speeding up on its way up**.

${dg(ELEVATOR)}

The arrows are different lengths on purpose. The box is accelerating upward, so the net force on it points up, and Newton's second law gives

$$F_N - mg = ma \\quad\\Rightarrow\\quad F_N = m(g + a) > mg$$

The general rule: **the normal force is whatever it has to be** for Newton's second law to hold perpendicular to the surface.

Your turn: if the elevator were speeding up on its way *down*, which arrow would be longer?`,
  },
  {
    label: "Area under a v–t graph",
    kind: "Graph",
    prompt: "What does the area under a velocity–time graph tell me?",
    diagram: VT_GRAPH,
    response: `Start with the units. Area on this graph is (height) × (width), so it has units of $\\text{m/s} \\times \\text{s}$. What's left?

${dg(VT_GRAPH)}

That unit check is the whole idea: the area between the line and the time axis is the **displacement** over that interval. It works because $\\Delta x = v\\,\\Delta t$ for each thin slice of time, and adding up the slices is the area.

Try it on this graph:

- What is the shaded area, from $t = 0$ to $t = 4\\,\\text{s}$?
- How far does the object travel over the whole $10\\,\\text{s}$?

And one to think about: what would area *below* the time axis mean?`,
  },
  {
    label: "Pendulum speed",
    kind: "Setup",
    prompt: "Why is a pendulum moving fastest at the bottom of its swing?",
    diagram: PENDULUM,
    response: `Think about energy rather than forces, for a pendulum released from $30°$.

${dg(PENDULUM)}

As it swings, the bob trades one kind of energy for another. Ignoring air resistance, the total stays the same:

$$K + U_g = \\text{constant}$$

So two questions:

1. Where along the swing is $U_g = mgh$ smallest?
2. If $U_g$ is smallest there, what must be true of $K = \\tfrac{1}{2}mv^2$ at that point?

Answer those and you've explained it. Bonus: does the bob's mass change how fast it's going at the bottom?`,
  },
];

/** The replies with their diagrams taken out, for when Raise's diagrams are switched off. */
export function withoutDiagrams(text: string): string {
  return text
    .replace(/```dg[^\n]*\n[\s\S]*?```[ \t]*\n?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
