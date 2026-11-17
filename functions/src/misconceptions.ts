// Misconception tags shared by grading (Cloud Function + Next.js grade route), the content pipeline
// and the teacher insights report. Dependency-free so `functions/` compiles it on its own; the web
// app re-exports it from src/data/ap/misconceptions.ts.
//
// Wording is our own. The conceptual tags follow the well-known findings of physics education
// research on introductory mechanics (force/motion, Newton's third law, energy, momentum, rotation,
// oscillation and fluids); the procedural tags are the slips the deterministic numeric checker
// detects. `units` lists the AP Physics 1 units (see src/data/ap/physics1.json) where the idea
// usually shows up, so the report can group by unit even when a question has no AP tag.

export type MisconceptionCategory = "conceptual" | "procedural";

export interface MisconceptionTag {
  id: string;
  /** Teacher-facing, short: what the student seems to believe. */
  label: string;
  /** One sentence on what it looks like in student work and what is actually true. */
  description: string;
  category: MisconceptionCategory;
  /** AP Physics 1 unit numbers (1–8) where this usually appears. Empty means any unit. */
  units: number[];
}

export const MISCONCEPTION_TAGS: readonly MisconceptionTag[] = [
  // --- Unit 1: kinematics ---------------------------------------------------------------------
  {
    id: "velocity-acceleration-confusion",
    label: "Treats velocity and acceleration as the same thing",
    description:
      "Assumes a fast object has a large acceleration, or that zero velocity means zero acceleration (e.g. at the top of a throw, where a = g).",
    category: "conceptual",
    units: [1, 2],
  },
  {
    id: "acceleration-sign-means-slowing",
    label: "Thinks negative acceleration always means slowing down",
    description:
      "Reads the sign of acceleration as speeding up or slowing down instead of comparing it with the direction of velocity.",
    category: "conceptual",
    units: [1],
  },
  {
    id: "distance-displacement-confusion",
    label: "Mixes up distance and displacement",
    description:
      "Uses total path length where the change in position is needed, or ignores direction for displacement and velocity.",
    category: "conceptual",
    units: [1],
  },
  {
    id: "graph-as-picture",
    label: "Reads a motion graph as a picture of the path",
    description:
      "Treats a position-time or velocity-time graph as the shape of the motion, or confuses slope with height (value) on the graph.",
    category: "conceptual",
    units: [1, 7],
  },
  {
    id: "projectile-components-coupled",
    label: "Couples horizontal and vertical motion of a projectile",
    description:
      "Thinks horizontal speed changes during flight, or that a faster horizontal launch makes an object fall more slowly.",
    category: "conceptual",
    units: [1],
  },
  {
    id: "heavier-falls-faster",
    label: "Thinks heavier objects fall faster",
    description:
      "Expects free-fall acceleration to depend on mass when air resistance is negligible.",
    category: "conceptual",
    units: [1, 2],
  },
  // --- Unit 2: force and translational dynamics -----------------------------------------------
  {
    id: "force-implies-motion",
    label: "Velocity is in the direction of the net force",
    description:
      "Assumes an object moves in the direction of the net force, rather than accelerating in that direction.",
    category: "conceptual",
    units: [2],
  },
  {
    id: "motion-requires-force",
    label: "Thinks constant motion needs a constant force",
    description:
      "Believes a moving object needs a net force to keep moving at constant velocity (Newton's first law not applied).",
    category: "conceptual",
    units: [2],
  },
  {
    id: "impetus-force",
    label: "Adds a 'force of motion' that stays with the object",
    description:
      "Draws a force from the throw or push acting after contact has ended, e.g. a forward force on a ball in flight.",
    category: "conceptual",
    units: [2],
  },
  {
    id: "third-law-unequal-forces",
    label: "Thinks the bigger or faster object pushes harder",
    description:
      "Says the two forces in a Newton's third law pair have different sizes (truck vs car, person vs wall).",
    category: "conceptual",
    units: [2, 4],
  },
  {
    id: "third-law-pair-same-object",
    label: "Puts a third-law pair on the same object",
    description:
      "Treats weight and normal force (or any two balancing forces on one object) as an action-reaction pair.",
    category: "conceptual",
    units: [2],
  },
  {
    id: "normal-force-equals-weight",
    label: "Assumes the normal force always equals mg",
    description:
      "Sets the normal force to mg on inclines, in accelerating elevators, or when other vertical forces act.",
    category: "conceptual",
    units: [2],
  },
  {
    id: "mass-weight-confusion",
    label: "Confuses mass and weight",
    description:
      "Uses kilograms as a force, or thinks mass changes with location the way weight does.",
    category: "conceptual",
    units: [2],
  },
  {
    id: "friction-always-opposes-motion",
    label: "Thinks friction always points against the motion",
    description:
      "Misses that static friction opposes relative sliding and can point forward (walking, a box on an accelerating truck), or uses μs·N as the static friction value.",
    category: "conceptual",
    units: [2],
  },
  {
    id: "centrifugal-force",
    label: "Adds an outward 'centrifugal' force in circular motion",
    description:
      "Draws an outward force on an object moving in a circle, or treats centripetal force as an extra force on the free-body diagram.",
    category: "conceptual",
    units: [2, 6],
  },
  {
    id: "no-gravity-in-orbit",
    label: "Thinks there is no gravity in orbit",
    description: "Explains weightlessness by a lack of gravity rather than continuous free fall.",
    category: "conceptual",
    units: [2, 6],
  },
  {
    id: "net-force-vector-addition",
    label: "Adds forces as numbers instead of vectors",
    description:
      "Adds force magnitudes regardless of direction, or skips components when forces act at an angle.",
    category: "procedural",
    units: [2],
  },
  {
    id: "system-boundary",
    label: "Includes internal forces or leaves out external ones",
    description:
      "Counts forces between parts of the chosen system as external, or forgets an external force when applying Newton's laws or conservation.",
    category: "conceptual",
    units: [2, 4],
  },
  // --- Unit 3: work, energy and power ---------------------------------------------------------
  {
    id: "energy-force-confusion",
    label: "Uses force and energy interchangeably",
    description:
      "Treats energy, force and power as the same idea, e.g. 'the ball runs out of force'.",
    category: "conceptual",
    units: [3],
  },
  {
    id: "work-sign",
    label: "Gets the sign of work wrong",
    description:
      "Ignores the angle between force and displacement; says friction or gravity on a rising object does positive work, or that a perpendicular force does work.",
    category: "conceptual",
    units: [3, 6],
  },
  {
    id: "energy-not-conserved",
    label: "Loses or creates energy without a cause",
    description:
      "Lets total energy change in a system with no external work or dissipation, or forgets thermal energy when friction acts.",
    category: "conceptual",
    units: [3, 6],
  },
  {
    id: "potential-energy-reference",
    label: "Thinks potential energy has one true zero",
    description:
      "Believes the zero of gravitational potential energy is fixed, or mixes reference levels within one problem.",
    category: "conceptual",
    units: [3],
  },
  {
    id: "power-energy-confusion",
    label: "Confuses power with energy",
    description: "Treats power as an amount of energy rather than a rate of energy transfer.",
    category: "conceptual",
    units: [3],
  },
  // --- Unit 4: linear momentum -----------------------------------------------------------------
  {
    id: "momentum-kinetic-energy-confusion",
    label: "Treats momentum and kinetic energy as interchangeable",
    description:
      "Assumes kinetic energy is conserved whenever momentum is, or uses mv² and mv interchangeably.",
    category: "conceptual",
    units: [4],
  },
  {
    id: "momentum-not-vector",
    label: "Ignores the direction of momentum",
    description:
      "Adds momentum magnitudes when objects move in opposite directions, or misses the sign change in a bounce.",
    category: "conceptual",
    units: [4],
  },
  {
    id: "impulse-force-confusion",
    label: "Confuses impulse with force",
    description:
      "Thinks a longer stopping time means a larger impulse or a larger force (airbags, catching an egg).",
    category: "conceptual",
    units: [4],
  },
  // --- Units 5 and 6: rotation -----------------------------------------------------------------
  {
    id: "torque-ignores-lever-arm",
    label: "Ignores the lever arm or angle in torque",
    description:
      "Treats torque as just the force, or uses the full distance when the force is not perpendicular.",
    category: "conceptual",
    units: [5],
  },
  {
    id: "rotational-inertia-mass-only",
    label: "Thinks rotational inertia depends only on mass",
    description:
      "Ignores how mass is distributed about the axis (a hoop vs a disk of the same mass).",
    category: "conceptual",
    units: [5, 6],
  },
  {
    id: "linear-angular-confusion",
    label: "Mixes up linear and angular quantities",
    description:
      "Uses linear speed where angular speed is needed (or the reverse), or thinks every point on a rigid rotating object has the same linear speed.",
    category: "conceptual",
    units: [5, 6],
  },
  {
    id: "equilibrium-forces-only",
    label: "Checks only forces for equilibrium",
    description:
      "Concludes an object is in equilibrium because forces balance, without checking that torques also balance.",
    category: "conceptual",
    units: [5],
  },
  {
    id: "angular-momentum-not-conserved",
    label: "Misses conservation of angular momentum",
    description:
      "Expects angular speed to stay the same when rotational inertia changes (skater pulling in arms) with no external torque.",
    category: "conceptual",
    units: [6],
  },
  // --- Unit 7: oscillations ---------------------------------------------------------------------
  {
    id: "period-depends-on-amplitude",
    label: "Thinks the period depends on amplitude",
    description:
      "Expects a bigger swing or stretch to change the period of a simple harmonic oscillator.",
    category: "conceptual",
    units: [7],
  },
  {
    id: "pendulum-period-depends-on-mass",
    label: "Thinks a pendulum's period depends on its mass",
    description:
      "Uses mass in the simple pendulum period, or leaves mass out of the spring-mass period.",
    category: "conceptual",
    units: [7],
  },
  {
    id: "shm-max-at-wrong-point",
    label: "Puts maximum speed or acceleration at the wrong point",
    description:
      "Says speed is greatest at the turning points or acceleration is greatest at equilibrium.",
    category: "conceptual",
    units: [7],
  },
  // --- Unit 8: fluids ---------------------------------------------------------------------------
  {
    id: "buoyancy-depends-on-object-weight",
    label: "Thinks buoyant force depends on the object's weight or depth",
    description:
      "Ties buoyant force to the object's own weight, or to how deep a fully submerged object is, instead of the weight of displaced fluid.",
    category: "conceptual",
    units: [8],
  },
  {
    id: "pressure-force-confusion",
    label: "Confuses pressure with force",
    description:
      "Treats pressure as a force, or expects fluid pressure to depend on container shape rather than depth.",
    category: "conceptual",
    units: [8],
  },
  {
    id: "faster-fluid-higher-pressure",
    label: "Thinks faster fluid has higher pressure",
    description:
      "Expects pressure to rise where a fluid speeds up (the opposite of Bernoulli's principle for a horizontal flow).",
    category: "conceptual",
    units: [8],
  },
  // --- Procedural slips (set by the deterministic numeric checker) ------------------------------
  {
    id: "sign-error",
    label: "Sign error",
    description: "Right size, wrong direction or sign.",
    category: "procedural",
    units: [],
  },
  {
    id: "power-of-ten",
    label: "Off by a power of ten",
    description: "A unit-prefix or scientific-notation slip (cm vs m, g vs kg).",
    category: "procedural",
    units: [],
  },
  {
    id: "unit-missing",
    label: "Leaves out the unit",
    description: "Right number with no unit.",
    category: "procedural",
    units: [],
  },
  {
    id: "unit-wrong",
    label: "Uses the wrong unit",
    description: "A unit of the wrong kind (J for W) or one that names a different amount.",
    category: "procedural",
    units: [],
  },
  {
    id: "unit-conversion",
    label: "Unit conversion slip",
    description:
      "The number is right for a different unit (km/h written as m/s, or a conversion skipped).",
    category: "procedural",
    units: [],
  },
  {
    id: "significant-figures",
    label: "Significant figures",
    description: "Right value, wrong number of significant figures for the question.",
    category: "procedural",
    units: [],
  },
  {
    id: "algebra-error",
    label: "Algebra or arithmetic slip",
    description:
      "Right physics and setup, but an algebra, rearranging or calculator slip changed the result.",
    category: "procedural",
    units: [],
  },
  {
    id: "other",
    label: "Other misconception",
    description: "A misunderstanding not on this list; see the grader's note.",
    category: "conceptual",
    units: [],
  },
];

export const MISCONCEPTION_IDS: ReadonlySet<string> = new Set(MISCONCEPTION_TAGS.map((t) => t.id));

const BY_ID = new Map(MISCONCEPTION_TAGS.map((t) => [t.id, t]));

export function misconceptionTag(id: string): MisconceptionTag | undefined {
  return BY_ID.get(id);
}

/** Older answers stored free-text labels; these phrases still map onto tags. */
const LEGACY_ALIASES: Record<string, string> = {
  "confusing mass with weight": "mass-weight-confusion",
  "mass vs weight": "mass-weight-confusion",
  "heavier objects fall faster": "heavier-falls-faster",
  "velocity is in the direction of force": "force-implies-motion",
  "centrifugal force": "centrifugal-force",
};

const MAX_NOTES = 3;
const MAX_NOTE_LENGTH = 160;

export interface NormalisedMisconceptions {
  /** Known tag ids, unique, in the order given. Unknown entries collapse into one "other". */
  tags: string[];
  /** The grader's free-text descriptions for entries that matched no tag (for the "other" bucket). */
  notes: string[];
}

/**
 * Maps whatever the grader returned (tag ids, prefixed ids, or legacy free text) onto the tag
 * list. Anything unknown becomes a single "other" tag, with its text kept as a short note.
 */
export function normaliseMisconceptions(
  raw: readonly unknown[] | undefined,
): NormalisedMisconceptions {
  const tags: string[] = [];
  const notes: string[] = [];
  for (const entry of raw || []) {
    if (typeof entry !== "string") continue;
    const text = entry.trim();
    if (!text) continue;
    const slug = text
      .toLowerCase()
      .replace(/^(tag|misconception)\s*[:=]\s*/, "")
      .replace(/[`"'.]/g, "")
      .trim();
    const asId = slug.replace(/[\s_]+/g, "-");
    const id = MISCONCEPTION_IDS.has(asId) ? asId : LEGACY_ALIASES[slug];
    if (id) {
      if (!tags.includes(id)) tags.push(id);
      continue;
    }
    if (!tags.includes("other")) tags.push("other");
    if (notes.length < MAX_NOTES) notes.push(text.slice(0, MAX_NOTE_LENGTH));
  }
  return { tags, notes };
}

/** Compact list for the AI grading prompt: "id: label". Procedural tags the checker sets are left out. */
export function misconceptionPromptList(): string {
  const skip = new Set([
    "sign-error",
    "power-of-ten",
    "unit-missing",
    "unit-wrong",
    "unit-conversion",
    "significant-figures",
    "other",
  ]);
  return MISCONCEPTION_TAGS.filter((t) => !skip.has(t.id))
    .map((t) => `- ${t.id}: ${t.label}`)
    .join("\n");
}
