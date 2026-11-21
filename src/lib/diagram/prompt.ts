// What a model needs to write a diagram. The reference is the same text on every call, so it can be
// prompt-cached. Keep it in step with the renderers in this folder.

export type DiagramKind = "plot" | "fbd" | "scene" | "bars" | "motion" | "circuit" | "field";

/** Every kind, in the order the reference lists them. */
export const DIAGRAM_KINDS: readonly DiagramKind[] = [
  "plot",
  "fbd",
  "scene",
  "bars",
  "motion",
  "circuit",
  "field",
];

const HEAD =
  String.raw`Diagrams: put one in a ` +
  "```dg" +
  String.raw` block. First line picks the kind. One command per line.
(…) below marks optional parts; write them without the parentheses.
Labels: F_N F_{net} v^2 \theta \vec{F} 30°; quote a label with spaces: "F_{B on A}". No other LaTeX. Directions: up down left right or degrees (0=right, CCW).`;

/** The reference text for each kind. Every character is sent on every call: keep these terse. */
const KIND_REFERENCE: Record<DiagramKind, string> = {
  plot: String.raw`plot x=t[s] y=v[m/s]        axes as name[unit]; optional xr=0,10 yr=-5,5 grid
seg 0,12 6,0 10,-8          straight segments; repeat an x for a jump: seg 0,0 0,5 2,5 2,0
fn 0.15*cos(8*t) 0..1.6     smooth curve over a range
pt 6,0 "A"  shade 0..6  hl 4 "label"  vl 2  note 3,8 "text"
xt 1:T 2:2T   yt 1:F_0      ticks with symbolic labels; xt none for a shape-only graph`,
  fbd: String.raw`fbd box "m" (tilt=30)       free-body diagram (or fbd dot)
f down F_g 1                direction, label, relative length; f 30 T ang=\theta marks the angle
                            tilt=30 is a slope rising to the right: normal 120, up-slope 30, down-slope 210.
                            Falling to the right: tilt=-30, normal 60, up-slope 150, down-slope -30.`,
  scene: String.raw`scene                       world units, y up; a block is 1 wide; keep scenes 3–8 wide
ground 0..5 (y=0)  wall 0 0..2  ceil 3 -1..1  surf x,y x,y (x,y..)
block A 2,0 (w= h=) "m"     bottom-centre at the point; or block A on=R t=.5
ball B 1,1 r=.3  pulley P 4,3 r=.3  incline R 0,0 30 5 (flip)  pend Q 0,3 1.5 20  loop L 5,1 1
rope p p  rod p p  spring p p  dash p p  hinge p  dot p "lbl"  text p "lbl"
f p dir len "lbl"  ang p a0 a1 "θ"  dim p p "L" (off=-14)
points: 2,3  A  A.t  A.r+0,.5   anchors: c t b l r (blocks also tl tr bl br; incline bot top corner; pend pivot bob; loop L 5,1 1 is a track circle, centre and radius)`,
  bars: String.raw`bars energy (unit=J) "title"  energy bar chart (or bars momentum); heights are relative units
initial K 0 U_g 4           label value pairs; values may be negative; ? draws an unknown bar
work W_f -1                 what enters or leaves the system (momentum: impulse J 2); omit if isolated
final K 3 U_g 0             initial + work must equal final`,
  motion: String.raw`motion dt=1 (v a num vertical axis)  dot diagram; v a add velocity/acceleration arrows, num numbers the dots
obj "car" x0=0 v0=2 a=1 n=5 n steps of dt at constant a; dot spacing and arrows are computed
seg a=-2 n=3                the object above carries on with a new a
obj "truck" v0=6 n=8        another object gets its own track, same scale`,
  circuit: String.raw`circuit                     say which nodes each element joins; the layout is automatic
battery a c 12V "ε" (r=1Ω)  kind, two nodes, value, label; a battery's first node is +
resistor a b 4Ω R_1 (i=I_1) i= draws a current arrow from first node to second (ir= reversed)
capacitor b c 10μF C  inductor b c 2mH L  bulb b c  switch b c open S  voltmeter b c  ammeter c d  wire d e
                            elements on the same two nodes are in parallel; sharing one node, in series. Close the loop: end on the battery's second node. An ammeter goes in series (its own node), a voltmeter across.
series a c resistor 4Ω R_1 switch closed S capacitor 10μF C     a chain from a to c
parallel b c resistor 6Ω R_2 resistor 3Ω R_3
ground c  node b "B"        (a bridge needs every node placed: at a 0,1 b 1,2 c 2,1)`,
  field: String.raw`field (xr=-4..4 yr=-3..3)   E and B pictures; field lines, equipotentials and forces are computed
charge 0,0 +2 "+2q"         point charge: x,y then signed relative size
plates 0,1 0,-1 w=4         centres of the + plate and the − plate
uniform E right  uniform B in (x=0..3 y=0..2)   a direction, or in/out of the page (crosses/dots)
wire 0,0 out "I"            long straight wire seen end-on, current out or in
equi  gauss circle 0,0 1.5 "S"  gauss rect -1,-1 1,1 "S"  pt 1,1 "P"
test 1,1 + "q" (v=right)    test charge with its force arrow; v= for the magnetic force`,
};

/** Mechanics courses draw motion and energy; E&M courses draw circuits and fields. */
const MECHANICS: DiagramKind[] = ["plot", "fbd", "scene", "bars", "motion"];
const ELECTRICITY: DiagramKind[] = ["plot", "fbd", "scene", "circuit", "field"];
const COURSE_KINDS: Record<string, DiagramKind[]> = {
  "physics-1": MECHANICS,
  "physics-c-mech": MECHANICS,
  "physics-2": ELECTRICITY,
  "physics-c-em": ELECTRICITY,
};

/** The kinds worth describing to a model working in `course` (an AP course id). All of them when the course is unknown. */
export function diagramKindsForCourse(course?: string): readonly DiagramKind[] {
  return (course !== undefined && COURSE_KINDS[course]) || DIAGRAM_KINDS;
}

/**
 * The language reference for a course's kinds, or for the kinds listed. The reference is sent on
 * every call, so a caller that knows the course should ask for that course's kinds only.
 */
export function diagramReference(course?: string | readonly DiagramKind[]): string {
  const kinds = Array.isArray(course)
    ? course
    : diagramKindsForCourse(course as string | undefined);
  return [
    HEAD,
    ...DIAGRAM_KINDS.filter((k) => kinds.includes(k)).map((k) => KIND_REFERENCE[k]),
  ].join("\n\n");
}

/** The whole reference: every kind. */
export const DIAGRAM_REFERENCE = diagramReference();

/** Rules for Raise explaining a concept: a picture is welcome when it carries the idea. */
export const TUTOR_EXPLAIN_DIAGRAM_RULES = `Diagrams (optional):
   - When a picture carries the idea better than words (a motion graph, the forces on an object, a physical setup), include ONE diagram. Most replies need none; never add one for decoration.
   - Refer to the diagram in your explanation. Arrow lengths are claims: make them agree with the physics, or make them all 1.
   - Use only values you state in the text.`;

/** Rules for Raise coaching a problem: draw what is given, never the student's work or the answer. */
export const TUTOR_SOLVE_DIAGRAM_RULES = `Diagrams (optional):
   - You may include ONE diagram of what the problem states: its setup, or a graph it describes. Most replies need none.
   - Never draw the answer or a step the student should do. If the question is about forces, do not draw the free-body diagram: ask the student to describe theirs.
   - No numbers or ticks the problem does not give.`;

/**
 * Rules for the public Try AI page, where one prompt answers both concept questions and problems.
 * They follow the two sets above, so the demo draws the way Raise does in class.
 */
export const LANDING_DIAGRAM_RULES = `Diagrams (optional, physics questions only):
   - Include ONE diagram when a picture carries the idea better than words: a physical setup, the forces on an object, or a motion graph. Most replies need none; never draw one for questions about Scorpio itself.
   - For a problem to solve, draw only what the problem states. Never draw the answer or a step the visitor should do, and do not draw the free-body diagram for a forces problem: ask them to describe theirs.
   - For a concept question, refer to the diagram in your explanation. Arrow lengths are claims: make them agree with the physics, or make them all 1.
   - Use only values you state in the text or the problem gives.`;

/** The block appended to the Try AI prompt when diagrams are switched on (every kind unless a course is given). */
export function landingDiagramSection(course?: string): string {
  return `\n\n${LANDING_DIAGRAM_RULES}\n\n=== DIAGRAM LANGUAGE ===\n${diagramReference(course)}\n========================`;
}

/** The block appended to a tutor prompt when diagrams are switched on (every kind unless a course is given). */
export function tutorDiagramSection(mode: "explain" | "solve", course?: string): string {
  return `\n${mode === "explain" ? TUTOR_EXPLAIN_DIAGRAM_RULES : TUTOR_SOLVE_DIAGRAM_RULES}\n\n=== DIAGRAM LANGUAGE ===\n${diagramReference(course)}\n========================`;
}
