// What a model needs to write a diagram. The reference is the same text on every call, so it can be
// prompt-cached. Keep it in step with the renderers in this folder.

export const DIAGRAM_REFERENCE =
  String.raw`Diagrams: put one in a ` +
  "```dg" +
  String.raw` block. First line picks the kind. One command per line.
(…) below marks optional parts; write them without the parentheses.
Labels: F_N F_{net} v^2 \theta \vec{F} 30°; quote a label with spaces: "F_{B on A}". No other LaTeX. Directions: up down left right or degrees (0=right, CCW).

plot x=t[s] y=v[m/s]        axes as name[unit]; optional xr=0,10 yr=-5,5 grid
seg 0,12 6,0 10,-8          straight segments; repeat an x for a jump: seg 0,0 0,5 2,5 2,0
fn 0.15*cos(8*t) 0..1.6     smooth curve over a range
pt 6,0 "A"  shade 0..6  hl 4 "label"  vl 2  note 3,8 "text"
xt 1:T 2:2T   yt 1:F_0      ticks with symbolic labels; xt none for a shape-only graph

fbd box "m" (tilt=30)       free-body diagram (or fbd dot)
f down F_g 1                direction, label, relative length; f 30 T ang=\theta marks the angle
                            tilt=30 is a slope rising to the right: normal 120, up-slope 30, down-slope 210.
                            Falling to the right: tilt=-30, normal 60, up-slope 150, down-slope -30.

scene                       world units, y up; a block is 1 wide; keep scenes 3–8 wide
ground 0..5 (y=0)  wall 0 0..2  ceil 3 -1..1  surf x,y x,y (x,y..)
block A 2,0 (w= h=) "m"     bottom-centre at the point; or block A on=R t=.5
ball B 1,1 r=.3  pulley P 4,3 r=.3  incline R 0,0 30 5 (flip)  pend Q 0,3 1.5 20  loop L 5,1 1
rope p p  rod p p  spring p p  dash p p  hinge p  dot p "lbl"  text p "lbl"
f p dir len "lbl"  ang p a0 a1 "θ"  dim p p "L" (off=-14)
points: 2,3  A  A.t  A.r+0,.5   anchors: c t b l r (blocks also tl tr bl br; incline bot top corner; pend pivot bob; loop L 5,1 1 is a track circle, centre and radius)`;

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

/** The block appended to the Try AI prompt when diagrams are switched on. */
export function landingDiagramSection(): string {
  return `\n\n${LANDING_DIAGRAM_RULES}\n\n=== DIAGRAM LANGUAGE ===\n${DIAGRAM_REFERENCE}\n========================`;
}

/** The block appended to a tutor prompt when diagrams are switched on. */
export function tutorDiagramSection(mode: "explain" | "solve"): string {
  return `\n${mode === "explain" ? TUTOR_EXPLAIN_DIAGRAM_RULES : TUTOR_SOLVE_DIAGRAM_RULES}\n\n=== DIAGRAM LANGUAGE ===\n${DIAGRAM_REFERENCE}\n========================`;
}
