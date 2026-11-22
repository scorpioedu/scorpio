// Misconception tags shared by grading (Cloud Function + Next.js grade route), the content pipeline
// and the teacher insights report. Dependency-free so `functions/` compiles it on its own; the web
// app re-exports it from src/data/ap/misconceptions.ts.
//
// Wording is our own. The conceptual tags follow the well-known findings of physics education
// research on introductory mechanics (force/motion, Newton's third law, energy, momentum, rotation,
// oscillation and fluids); the procedural tags are the slips the deterministic numeric checker
// detects. `units` lists the AP Physics 1 units (see src/data/ap/physics1.json) where the idea
// usually shows up, so the report can group by unit even when a question has no AP tag.
//
// Unit numbers repeat between AP courses, so a tag's units only mean something with a course:
// `units` is AP Physics 1, `courseUnits` holds the other courses, and `misconceptionUnits(tag,
// course)` is the one place that reads them. The AP Physics 2 tags (thermodynamics, electricity,
// magnetism, optics, waves, modern physics) follow the same research tradition, in our own words.
// AP Physics C: Mechanics covers the ground of Physics 1 units 1-7 under the same unit numbers, so
// it reuses the mechanics tags and adds a few that only show up with calculus.
// AP Physics C: Electricity and Magnetism (units 8-13) covers the ground of Physics 2 units 10-12
// under its own unit numbers, so it reuses those electricity and magnetism tags (`SHARED_UNITS`
// says which unit maps to which) and adds the ones that only show up with calculus.

/** The AP courses Scorpio knows; src/data/ap has their units and topics (a test keeps them in step). */
export const AP_COURSE_KEYS = ["physics-1", "physics-2", "physics-c-mech", "physics-c-em"] as const;
export type ApCourseKey = (typeof AP_COURSE_KEYS)[number];
export const DEFAULT_AP_COURSE_KEY: ApCourseKey = "physics-1";
/** First and last unit number of each course. */
export const AP_COURSE_UNIT_RANGE: Record<ApCourseKey, readonly [number, number]> = {
  "physics-1": [1, 8],
  "physics-2": [9, 15],
  "physics-c-mech": [1, 7],
  "physics-c-em": [8, 13],
};

export function isApCourseKey(value: unknown): value is ApCourseKey {
  return typeof value === "string" && (AP_COURSE_KEYS as readonly string[]).includes(value);
}

/** The course a stored value names; anything else (including nothing) is AP Physics 1. */
export function apCourseKey(value: unknown): ApCourseKey {
  return isApCourseKey(value) ? value : DEFAULT_AP_COURSE_KEY;
}

/** The course to hand the AI grader: undefined for AP Physics 1, so its prompt stays as it was. */
export function nonDefaultApCourse(value: unknown): ApCourseKey | undefined {
  return isApCourseKey(value) && value !== DEFAULT_AP_COURSE_KEY ? value : undefined;
}

export function isUnitOfCourse(unit: unknown, course: ApCourseKey): unit is number {
  const [first, last] = AP_COURSE_UNIT_RANGE[course];
  return typeof unit === "number" && Number.isInteger(unit) && unit >= first && unit <= last;
}

export type MisconceptionCategory = "conceptual" | "procedural";

export interface MisconceptionTag {
  id: string;
  /** Teacher-facing, short: what the student seems to believe. */
  label: string;
  /** One sentence on what it looks like in student work and what is actually true. */
  description: string;
  category: MisconceptionCategory;
  /**
   * AP Physics 1 unit numbers (1–8) where this usually appears. Empty with no `courseUnits` means
   * any unit of any course (the procedural slips and "other").
   */
  units: number[];
  /** Units in the other AP courses. Read through `misconceptionUnits`, never directly. */
  courseUnits?: Partial<Record<ApCourseKey, number[]>>;
}

export const MISCONCEPTION_TAGS: readonly MisconceptionTag[] = [
  // --- Unit 1: kinematics ---------------------------------------------------------------------
  {
    id: "velocity-acceleration-confusion",
    label: "Treats velocity and acceleration as the same thing",
    description:
      "Assumes a fast object has a large acceleration, or that zero velocity means zero acceleration (e.g. at the top of a throw, where a = g), or that steady speed round a circle means no acceleration.",
    category: "conceptual",
    units: [1, 2, 5],
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
      "Uses total path length where the change in position is needed (for average velocity, or for the work done by a force), or ignores direction for displacement and velocity.",
    category: "conceptual",
    units: [1, 3],
  },
  {
    id: "graph-as-picture",
    label: "Reads a motion graph as a picture of the path",
    description:
      "Treats a position-time or velocity-time graph as the shape of the motion, or reads the graph's height where its slope or the area under it is needed (work from a force-position graph, impulse from a force-time graph).",
    category: "conceptual",
    units: [1, 3, 4, 7],
    courseUnits: { "physics-2": [14] },
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
  {
    id: "relative-velocity-confusion",
    label: "Combines velocities between frames wrongly",
    description:
      "Adds or subtracts speeds without their directions when changing frames (two cars closing head-on), treats the ground's frame as the only true one, or expects every observer to see the same path.",
    category: "conceptual",
    units: [1],
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
      "Believes a moving object needs a net force to keep moving at constant velocity, or that zero net force (or zero net torque) means the object is at rest (Newton's first law not applied).",
    category: "conceptual",
    units: [2, 5],
  },
  {
    id: "impetus-force",
    label: "Adds a 'force of motion' that stays with the object",
    description:
      "Draws a force from the throw or push acting after contact has ended, e.g. a forward force on a ball in flight, or a force that throws passengers forward when a bus brakes.",
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
    courseUnits: { "physics-2": [10, 12], "physics-c-em": [8, 12] },
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
    id: "tension-equals-weight",
    label: "Sets the tension equal to the hanging weight",
    description:
      "Takes T = mg for a hanging object that is accelerating (a block falling on a pulley, a lift cable), when the tension is less than mg while it speeds up downward and more while it speeds up upward.",
    category: "conceptual",
    units: [2, 5],
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
    label: "Adds vectors as numbers",
    description:
      "Adds the magnitudes of forces, displacements or velocities regardless of direction, or skips components when they act at an angle.",
    category: "procedural",
    units: [1, 2],
  },
  {
    id: "system-boundary",
    label: "Includes internal forces or leaves out external ones",
    description:
      "Counts forces between parts of the chosen system as external, or forgets an external force when applying Newton's laws or conservation (a pivot's force during a collision with a pivoted rod).",
    category: "conceptual",
    units: [2, 4, 6],
  },
  {
    id: "centre-of-mass-at-midpoint",
    label: "Puts the centre of mass at the geometric middle",
    description:
      "Places the centre of mass halfway between two objects, at the middle of a rod whose density varies, or insists it lies inside the material, instead of weighting each position by the mass there.",
    category: "conceptual",
    units: [2],
  },
  {
    id: "spring-force-misread",
    label: "Uses the spring's length, or a fixed direction, in Hooke's law",
    description:
      "Puts the spring's length into F = kΔx instead of its stretch or compression from the relaxed length, or reads the minus sign in F = −kx as a fixed direction rather than opposite to the displacement.",
    category: "conceptual",
    units: [2, 3, 7],
  },
  // --- Unit 3: work, energy and power ---------------------------------------------------------
  {
    id: "energy-force-confusion",
    label: "Uses force and energy interchangeably",
    description:
      "Treats energy, force and power as the same idea, e.g. 'the ball runs out of force', or reads a torque in N·m as an amount of energy in joules.",
    category: "conceptual",
    units: [3, 6],
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
    courseUnits: { "physics-2": [9, 10, 11], "physics-c-em": [9, 10, 11, 13] },
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
    courseUnits: { "physics-2": [11] },
  },
  {
    id: "energy-scaled-linearly",
    label: "Scales energy in step with speed, amplitude or voltage",
    description:
      "Doubles the energy when the speed, amplitude, charge or voltage doubles, missing the square in ½mv², ½kx², ½CV² or q²/2C, or doubles the speed when the kinetic energy doubles.",
    category: "conceptual",
    units: [3, 6, 7],
    courseUnits: { "physics-2": [10], "physics-c-em": [9, 10, 13] },
  },
  {
    id: "energy-given-direction",
    label: "Gives kinetic or spring energy a direction or a negative value",
    description:
      "Makes the kinetic energy of an object moving the negative way negative (so two carts moving apart cancel), or a compressed spring's energy negative, when both depend on a square and are never negative.",
    category: "conceptual",
    units: [3, 7],
  },
  {
    id: "potential-energy-of-one-object",
    label: "Gives potential energy to a single object",
    description:
      "Says the ball (or the charge) has potential energy the way it has mass, instead of the energy belonging to the system of interacting objects, the ball and the Earth together.",
    category: "conceptual",
    units: [3, 6],
    courseUnits: { "physics-2": [10], "physics-c-em": [9] },
  },
  {
    id: "conservative-force-confusion",
    label: "Mixes up conservative and nonconservative forces",
    description:
      "Gives friction a potential energy, or thinks the work done by gravity, a spring or an electric field depends on the path taken between two points (a steeper slide giving a faster finish).",
    category: "conceptual",
    units: [3],
    courseUnits: { "physics-2": [10], "physics-c-em": [9] },
  },
  {
    id: "average-for-instantaneous",
    label: "Uses an average rate where an instantaneous one is asked",
    description:
      "Divides a total change by the total time (Δx/Δt, W/t, ΔQ/Δt) for the rate at one instant, when the rate is changing and the slope or derivative at that instant is needed.",
    category: "conceptual",
    units: [1, 3],
    courseUnits: { "physics-c-em": [11, 13] },
  },
  // --- Unit 4: linear momentum -----------------------------------------------------------------
  {
    id: "momentum-kinetic-energy-confusion",
    label: "Treats momentum and kinetic energy as interchangeable",
    description:
      "Assumes kinetic energy is conserved whenever momentum is (or whenever angular momentum is, for a skater pulling in her arms), or uses mv² and mv (or p and K for a particle) interchangeably.",
    category: "conceptual",
    units: [4, 6],
    courseUnits: { "physics-2": [15] },
  },
  {
    id: "momentum-not-vector",
    label: "Ignores the direction of momentum",
    description:
      "Adds momentum (or angular momentum) magnitudes when they point opposite ways, or misses the sign change in a bounce (a ball, or a gas molecule striking a wall).",
    category: "conceptual",
    units: [4, 6],
    courseUnits: { "physics-2": [9] },
  },
  {
    id: "impulse-force-confusion",
    label: "Confuses impulse with force",
    description:
      "Thinks a longer stopping time means a larger impulse or a larger force (airbags, catching an egg).",
    category: "conceptual",
    units: [4],
  },
  {
    id: "momentum-mass-or-velocity-alone",
    label: "Judges momentum by mass or by velocity alone",
    description:
      "Says the heavier (or the faster) object has more momentum, or conserves velocity where momentum is conserved, instead of comparing the products mv.",
    category: "conceptual",
    units: [4],
  },
  {
    id: "elastic-inelastic-confusion",
    label: "Misjudges whether a collision is elastic",
    description:
      "Thinks perfectly inelastic means the objects stop dead, or that any collision in which the objects bounce apart is elastic, instead of judging by whether they stick together and whether kinetic energy is conserved.",
    category: "conceptual",
    units: [4],
  },
  // --- Units 5 and 6: rotation -----------------------------------------------------------------
  {
    id: "torque-ignores-lever-arm",
    label: "Ignores the lever arm or angle in torque",
    description:
      "Treats torque as just the force (or a kind of force that adds to forces), uses the full distance when the force is not perpendicular, or gives a torque to a force aimed through the axis.",
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
    courseUnits: { "physics-c-mech": [5, 6, 7] },
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
    id: "rotation-axis-ignored",
    label: "Forgets that torque and angular momentum depend on the axis",
    description:
      "Treats a torque or an angular momentum as fixed whatever point it is taken about, mixes axes in one equation, or says an object moving in a straight line has no angular momentum.",
    category: "conceptual",
    units: [5, 6],
  },
  {
    id: "pulley-tensions-equal",
    label: "Gives a pulley with mass the same tension on both sides",
    description:
      "Uses one tension on both sides of a pulley that has rotational inertia, when a net torque, (T1 − T2)R = Iα, is needed to change its rotation.",
    category: "conceptual",
    units: [5],
  },
  {
    id: "parallel-axis-misused",
    label: "Uses the wrong axis for rotational inertia",
    description:
      "Uses the centre-of-mass rotational inertia about an axis that does not pass through the centre of mass, puts all the mass at the centre of mass (I = Md²), or applies I = I1 + Md² between two axes neither of which passes through the centre of mass.",
    category: "conceptual",
    units: [5, 6],
    courseUnits: { "physics-c-mech": [5, 6, 7] },
  },
  {
    id: "angle-not-in-radians",
    label: "Uses degrees or revolutions where radians are needed",
    description:
      "Puts an angle in degrees or revolutions, or a rate in rev/s, into s = rθ, v = ωr, W = τθ or x = A cos ωt, which hold only in radians.",
    category: "procedural",
    units: [5, 6, 7],
    courseUnits: { "physics-c-em": [12, 13] },
  },
  {
    id: "angular-momentum-not-conserved",
    label: "Misses conservation of angular momentum",
    description:
      "Expects angular speed to stay the same when rotational inertia changes (skater pulling in arms) with no external torque.",
    category: "conceptual",
    units: [6],
  },
  {
    id: "orbit-speed-confusion",
    label: "Thinks a higher orbit is a faster one",
    description:
      "Expects a satellite in a higher circular orbit to move faster because it has more energy, gives an elliptical orbit a constant speed, mixes up orbital and escape speed (√(GM/r) and √(2GM/r)), or makes either depend on the satellite's mass.",
    category: "conceptual",
    units: [2, 6],
  },
  // --- Unit 7: oscillations ---------------------------------------------------------------------
  {
    id: "period-depends-on-amplitude",
    label: "Thinks the period depends on amplitude",
    description:
      "Expects a bigger swing or stretch to change the period of a simple harmonic oscillator, or more starting charge to change an LC circuit's frequency.",
    category: "conceptual",
    units: [7],
    courseUnits: { "physics-c-em": [13] },
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
  {
    id: "period-frequency-confusion",
    label: "Mixes up period, frequency and angular frequency",
    description:
      "Uses f where T = 1/f is needed (or the reverse), or ω where f is meant (ω = 2πf, in rad/s), so the answer is inverted or off by a factor of 2π.",
    category: "conceptual",
    units: [5, 7],
    courseUnits: { "physics-2": [14], "physics-c-em": [13] },
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
      "Treats pressure as a force with one direction (pushing only downward, from weight, in a liquid or a gas), or expects fluid pressure to depend on container shape rather than depth.",
    category: "conceptual",
    units: [8],
    courseUnits: { "physics-2": [9] },
  },
  {
    id: "faster-fluid-higher-pressure",
    label: "Thinks faster fluid has higher pressure",
    description:
      "Expects pressure to rise where a fluid speeds up (the opposite of Bernoulli's principle for a horizontal flow).",
    category: "conceptual",
    units: [8],
  },
  {
    id: "density-mass-confusion",
    label: "Confuses density with mass",
    description:
      "Thinks a bigger piece of a material is denser, that the denser object is always the heavier one, or that heavy objects sink and light ones float, instead of comparing mass per volume with the fluid's.",
    category: "conceptual",
    units: [8],
  },
  {
    id: "buoyancy-left-out",
    label: "Leaves the buoyant force out",
    description:
      "Thinks a sinking object, or one resting on the bottom, feels no buoyant force, or leaves buoyancy out of the net force on a submerged object (a tethered float, a scale reading).",
    category: "conceptual",
    units: [8],
  },
  {
    id: "gauge-absolute-pressure-confusion",
    label: "Mixes up gauge and absolute pressure",
    description:
      "Uses ρgh alone where the absolute pressure is needed (or adds atmospheric pressure where the difference is), including in the ideal gas law, which needs absolute pressure.",
    category: "conceptual",
    units: [8],
    courseUnits: { "physics-2": [9] },
  },
  {
    id: "flow-rate-speed-confusion",
    label: "Confuses volume flow rate with flow speed",
    description:
      "Expects fluid to flow faster through a wider pipe or a bigger hole, or treats speed as the amount of fluid per second, instead of the flow rate Av being the same along a pipe.",
    category: "conceptual",
    units: [8],
  },
  // --- Mostly AP Physics C: Mechanics (calculus-based; a few reach Physics 1 too) ---------------
  {
    id: "constant-acceleration-assumed",
    label: "Uses constant-acceleration equations when acceleration changes",
    description:
      "Applies v = v0 + at or x = ½at² (or F·d, F·t, τθ, ω = αt with a single value) when the acceleration, force or torque varies with time or position (a spring, an oscillator), and the area under a graph or an integral is needed.",
    category: "conceptual",
    units: [2, 3, 7],
    courseUnits: { "physics-c-mech": [1, 2, 3, 4, 5, 6, 7] },
  },
  {
    id: "derivative-integral-confusion",
    label: "Mixes up slope and area (derivative and integral)",
    description:
      "Differentiates where an integral is needed or the reverse, for example taking the slope of a force-position graph for work or the area under a position-time graph for velocity.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-c-mech": [1, 3, 4, 5, 6], "physics-c-em": [9, 11, 13] },
  },
  {
    id: "rolling-ignores-rotation",
    label: "Treats a rolling object as if it only slides",
    description:
      "Leaves the rotation out of an object's energy or angular momentum (v = √(2gh) at the bottom of a ramp, no kinetic energy for a wheel whose centre stays put, L = MvR with no spin term), or ignores the spin-up when a sliding ball starts to roll.",
    category: "conceptual",
    units: [6],
  },
  {
    id: "initial-conditions-ignored",
    label: "Leaves out the initial conditions",
    description:
      "Drops the starting value when integrating (v = ∫a dt with no v0, x with no x0), or writes x = A cos ωt whatever the oscillator's position and velocity at t = 0.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-c-mech": [1, 2, 7] },
  },
  // --- AP Physics 2, Unit 9: thermodynamics ------------------------------------------------------
  {
    id: "heat-temperature-confusion",
    label: "Treats heat and temperature as the same thing",
    description:
      "Says an object 'contains heat', or that the hotter object always has more thermal energy, instead of separating temperature from energy transferred or stored.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [9] },
  },
  {
    id: "cold-as-substance",
    label: "Thinks cold flows into objects",
    description:
      "Describes cooling as 'cold' moving in rather than energy leaving the warmer object.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [9] },
  },
  {
    id: "celsius-as-absolute",
    label: "Uses Celsius where kelvin is needed",
    description:
      "Treats the Celsius scale as proportional (doubling 20 °C to 40 °C 'doubles the temperature') in gas-law or radiation ratios.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [9, 15] },
  },
  {
    id: "gas-variable-in-isolation",
    label: "Changes one gas variable and forgets the others",
    description:
      "Applies P ∝ 1/V or P ∝ T without checking that the remaining quantities (T, V or the amount of gas) stay fixed.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [9] },
  },
  {
    id: "molecular-speed-same-at-same-temperature",
    label: "Thinks all gas molecules have the same speed at one temperature",
    description:
      "Misses that temperature sets the average kinetic energy, so lighter molecules move faster on average and speeds are spread out.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [9] },
  },
  {
    id: "thermal-work-sign",
    label: "Gets the sign of work or heating wrong in the first law",
    description:
      "Mixes up work done on the gas and by the gas, or gives a compression negative work on the gas, so ΔU comes out with the wrong sign or size.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [9] },
  },
  {
    id: "isothermal-adiabatic-confusion",
    label: "Thinks constant temperature means no heating",
    description:
      "Confuses isothermal (ΔU = 0, energy still flows as heat) with adiabatic (Q = 0, temperature changes).",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [9] },
  },
  {
    id: "heat-work-as-state",
    label: "Treats heat or work as a property of the gas's state",
    description:
      "Expects the same Q or W for every process between two states, or speaks of the heat or work a gas has, when only the internal energy is fixed by the state and Q and W depend on the path.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [9] },
  },
  {
    id: "specific-heat-ignored",
    label: "Expects the same temperature change for the same heating",
    description:
      "Ignores mass or specific heat, for example taking the final temperature of a mixture as the plain average of the two starting temperatures.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [9] },
  },
  {
    id: "conduction-rate-factors",
    label: "Misjudges what sets the rate of energy flow",
    description:
      "Thinks a thicker layer conducts faster, that good conductors 'are colder', or that conductivity and specific heat measure the same thing, instead of rate depending on conductivity, area, temperature difference and thickness.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [9] },
  },
  {
    id: "entropy-never-decreases-locally",
    label: "Thinks no object's entropy can ever decrease",
    description:
      "Applies the second law to one object rather than to the object and its surroundings together.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [9] },
  },
  {
    id: "engine-converts-all-heat",
    label: "Thinks an engine can turn all the heat it takes in into work",
    description:
      "Ignores the energy that must be exhausted to the cold reservoir, or computes efficiency from Celsius temperatures or from Q_cold/Q_hot.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [9] },
  },
  // --- AP Physics 2, Unit 10: electric force, field and potential --------------------------------
  {
    id: "inverse-square-misapplied",
    label: "Uses the wrong distance dependence",
    description:
      "Treats electric force or field as falling off as 1/r, or potential and potential energy as 1/r², for example halving the force when the distance doubles; or gives a long wire's magnetic field a 1/r² fall-off.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [10, 12], "physics-c-em": [8, 9, 12] },
  },
  {
    id: "charging-moves-positive-charge",
    label: "Thinks positive charges move or charge is created when charging",
    description:
      "Explains charging by protons moving between solids, or says rubbing or induction creates new charge instead of moving electrons and conserving the total.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [10], "physics-c-em": [8, 10] },
  },
  {
    id: "induction-grounding-misread",
    label: "Misreads charging by induction or grounding",
    description:
      "Expects an object charged by induction to end with the rod's own sign, or a grounded conductor to be left neutral even beside a charged object, when grounding fixes the potential, not the charge.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [10], "physics-c-em": [8, 10] },
  },
  {
    id: "charge-shared-equally",
    label: "Splits charge equally between conductors that touch",
    description:
      "Shares charge evenly between connected conductors of different sizes, instead of letting it flow until they are at the same potential (equal shares only for identical conductors).",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [10], "physics-c-em": [8, 10] },
  },
  {
    id: "neutral-means-no-charge",
    label: "Thinks a neutral object has no charges and feels no electric force",
    description: "Misses polarization: a charged object attracts a neutral conductor or insulator.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [10], "physics-c-em": [8] },
  },
  {
    id: "field-force-confusion",
    label: "Confuses electric field with electric force",
    description:
      "Thinks the field at a point depends on the test charge placed there, or that a larger charge in the same field feels the same force.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [10], "physics-c-em": [8] },
  },
  {
    id: "field-line-as-trajectory",
    label: "Thinks a charge moves along a field line",
    description:
      "Expects a released charge to follow the field line through its starting point, when the line gives the direction of the force (and acceleration), not of the velocity.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [10], "physics-c-em": [8] },
  },
  {
    id: "field-direction-ignores-sign",
    label: "Ignores the sign of the charge for direction",
    description:
      "Sends a negative charge along the field (electrons drifting from high to low potential in a wire), or points the field toward positive charges.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [10, 11, 12], "physics-c-em": [8, 9, 11, 12] },
  },
  {
    id: "field-potential-zero-together",
    label: "Ties the field's size to the potential's value",
    description:
      "Assumes E = 0 implies V = 0 or the reverse (for example midway between equal or opposite charges), or that a high potential means a strong field, instead of the field being how potential changes with position.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [10], "physics-c-em": [9] },
  },
  {
    id: "potential-energy-potential-confusion",
    label: "Mixes up potential and potential energy",
    description:
      "Uses V where U = qV is needed, or ignores the sign of the charge when deciding whether potential energy rises or falls.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [10], "physics-c-em": [9] },
  },
  {
    id: "vector-scalar-superposition",
    label: "Adds fields as numbers or potentials as vectors",
    description:
      "Adds field magnitudes without directions, or cancels potentials from like charges as if they pointed opposite ways.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [10, 12], "physics-c-em": [8, 9, 12] },
  },
  {
    id: "conductor-interior-field",
    label: "Thinks there is a field or excess charge inside a conductor in equilibrium",
    description:
      "Puts excess charge throughout the volume, or a non-zero field inside, instead of charge on the surface and the whole conductor at one potential; or expects an ungrounded shell to hide a charge in its cavity from the outside.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [10], "physics-c-em": [10] },
  },
  {
    id: "capacitor-wrong-quantity-fixed",
    label: "Holds the wrong capacitor quantity fixed",
    description:
      "Keeps charge constant while the battery stays connected, or voltage constant after it is disconnected, when plates move or a dielectric goes in.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [10, 11], "physics-c-em": [10, 11] },
  },
  {
    id: "capacitance-depends-on-charge",
    label: "Thinks capacitance or inductance changes with charge or current",
    description:
      "Reads C = Q/V as saying more charge means more capacitance (or L = NΦ/I as saying more current means less inductance), rather than both being set by geometry and the material.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [10, 11], "physics-c-em": [10, 11, 13] },
  },
  {
    id: "capacitor-net-charge",
    label: "Thinks a charged capacitor carries a net charge",
    description:
      "Says a capacitor charged to Q holds a net charge Q, instead of +Q on one plate and −Q on the other, moved from one plate to the other.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [10, 11], "physics-c-em": [10, 11] },
  },
  {
    id: "capacitor-energy-qv",
    label: "Takes a capacitor's stored energy as QV",
    description:
      "Uses QV, the energy the battery supplies, for the energy stored (it is ½QV), or expects the stored energy to stay the same when charge is shared between capacitors, missing what is dissipated in the wires.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [10, 11], "physics-c-em": [10, 11] },
  },
  // --- AP Physics 2, Unit 11: electric circuits --------------------------------------------------
  {
    id: "current-used-up",
    label: "Thinks current is used up in a circuit",
    description:
      "Expects less current after a bulb or resistor than before it, instead of energy being transferred while charge is conserved.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [11] },
  },
  {
    id: "battery-constant-current",
    label: "Treats a battery as a source of constant current",
    description:
      "Assumes the battery delivers the same current whatever is connected, rather than holding (nearly) the same potential difference.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [11] },
  },
  {
    id: "sequential-circuit-reasoning",
    label: "Reasons about a circuit one element at a time",
    description:
      "Thinks a change only affects elements 'downstream' of it, instead of the whole circuit adjusting together.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [11] },
  },
  {
    id: "series-parallel-confusion",
    label: "Mixes up series and parallel rules",
    description:
      "Adds resistances in parallel, splits voltage between parallel branches, or gives series elements different currents; or combines springs, capacitors or a partly filled dielectric with the wrong rule.",
    category: "conceptual",
    units: [2, 7],
    courseUnits: { "physics-2": [11], "physics-c-em": [10, 11] },
  },
  {
    id: "voltage-current-confusion",
    label: "Uses voltage and current interchangeably",
    description:
      "Says voltage 'flows through' an element, or that zero current must mean zero potential difference (an open switch).",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [11] },
  },
  {
    id: "resistance-brightness-rule",
    label: "Uses one rule for resistance and brightness",
    description:
      "Says the larger resistor is always brighter (or always dimmer) without asking whether the current or the voltage is shared.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [11] },
  },
  {
    id: "terminal-voltage-equals-emf",
    label: "Ignores internal resistance",
    description: "Takes the terminal voltage as the emf whatever current the battery supplies.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [11] },
  },
  {
    id: "loop-rule-sign",
    label: "Gets potential rises and drops wrong around a loop",
    description:
      "Gives a resistor crossed against the current a drop, or a battery crossed from + to − a rise, or adds emfs that oppose each other.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [11] },
  },
  {
    id: "junction-rule-ignored",
    label: "Does not conserve current at a junction",
    description:
      "Lets the currents entering and leaving a junction differ, or gives every branch the full current.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [11] },
  },
  {
    id: "current-split-wrong",
    label: "Splits current between parallel branches wrongly",
    description:
      "Divides the current equally between parallel branches whatever their resistance, or sends more of it through the larger resistance, instead of each branch carrying ΔV/R.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [11] },
  },
  {
    id: "short-circuit-ignored",
    label: "Misses a short circuit",
    description:
      "Keeps current flowing through an element that a wire of negligible resistance connects across, instead of the current taking the wire and the element carrying none.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [11] },
  },
  {
    id: "rated-power-fixed",
    label: "Thinks a bulb always uses its rated power",
    description:
      "Treats a bulb's or heater's rated power as fixed whatever it is connected to, instead of the power depending on the potential difference across it (P = ΔV²/R).",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [11] },
  },
  {
    id: "resistivity-resistance-confusion",
    label: "Mixes up resistivity and resistance",
    description:
      "Thinks resistivity depends on the wire's length or thickness, or scales resistance with the diameter rather than the cross-sectional area in R = ρL/A.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [11] },
  },
  {
    id: "capacitor-steady-current",
    label: "Gets the capacitor's limiting behaviour backwards",
    description:
      "Thinks a fully charged capacitor still passes current, or that an uncharged one blocks it at the instant a switch closes.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [11] },
  },
  {
    id: "rc-linear-change",
    label: "Expects a capacitor to charge at a steady rate",
    description:
      "Treats charging or discharging as linear, or takes one time constant as the time to charge fully.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [11] },
  },
  // --- AP Physics 2, Unit 12: magnetism and electromagnetism -------------------------------------
  {
    id: "magnetic-poles-as-charges",
    label: "Treats magnetic poles like electric charges",
    description:
      "Says a north pole attracts negative charges, that a charge at rest feels a magnetic force, that a pole can be isolated by cutting a magnet, or that field lines start on the north pole and end on the south pole.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [12], "physics-c-em": [12] },
  },
  {
    id: "magnetic-force-along-field",
    label: "Points the magnetic force along the field or the velocity",
    description:
      "Misses that the force on a moving charge or a current is perpendicular to both the field and the motion, and zero for motion along the field.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [12], "physics-c-em": [12, 13] },
  },
  {
    id: "magnetic-force-does-work",
    label: "Thinks a magnetic field speeds charges up",
    description:
      "Expects the magnetic force to change a particle's speed or kinetic energy rather than only its direction.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [12], "physics-c-em": [12] },
  },
  {
    id: "wire-field-not-circular",
    label: "Gets the field of a current-carrying wire wrong",
    description:
      "Draws the field pointing along the wire or straight toward or away from it, or says parallel currents repel by analogy with like charges.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [12], "physics-c-em": [12] },
  },
  {
    id: "induction-needs-change",
    label: "Thinks a magnetic field alone induces an emf",
    description:
      "Expects a current whenever a field passes through a loop (a strong steady field, a magnet at rest) instead of only when the flux changes.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [12], "physics-c-em": [13] },
  },
  {
    id: "lenz-opposes-field",
    label: "Thinks the induced field always opposes the applied field",
    description:
      "Applies Lenz's law to the field itself rather than to the change in flux, so a decreasing flux gets the wrong current direction.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [12], "physics-c-em": [13] },
  },
  {
    id: "flux-ignores-orientation",
    label: "Ignores area or orientation in flux",
    description:
      "Uses the field alone for flux, keeps the flux unchanged when the loop tilts or its area changes, or measures the angle from the surface or the loop's plane instead of from its normal (in electric or magnetic flux, or the torque on a current loop).",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [12], "physics-c-em": [8, 12, 13] },
  },
  // --- AP Physics 2, Unit 13: geometric optics ---------------------------------------------------
  {
    id: "plane-mirror-image-location",
    label: "Misplaces the image in a plane mirror",
    description:
      "Puts the image on the mirror's surface, or thinks moving back shows more of yourself or changes the image's size.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [13] },
  },
  {
    id: "real-virtual-image-confusion",
    label: "Mixes up real and virtual images",
    description:
      "Says a virtual image can be projected on a screen, that real images are upright, or calls any image behind a lens virtual.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [13] },
  },
  {
    id: "optics-sign-convention",
    label: "Gets a sign wrong in the mirror or lens equation",
    description:
      "Uses a positive focal length for a diverging lens or convex mirror, or a positive image distance for a virtual image.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [13] },
  },
  {
    id: "focal-length-equals-radius",
    label: "Puts a mirror's focal point at its centre of curvature",
    description:
      "Takes f = R for a curved mirror, when parallel rays meet halfway out, at f = R/2, and rays through the centre of curvature come straight back.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [13] },
  },
  {
    id: "partial-lens-partial-image",
    label: "Thinks covering part of a lens removes part of the image",
    description:
      "Expects half the image to vanish, rather than the whole image getting dimmer, because every part of the lens forms the whole image.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [13] },
  },
  {
    id: "refraction-wrong-way",
    label: "Bends the ray the wrong way at a boundary",
    description:
      "Bends light away from the normal on entering the slower medium, or applies Snell's law (or the law of reflection) with the indices swapped or with angles measured from the surface.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [13] },
  },
  {
    id: "frequency-changes-in-medium",
    label: "Thinks frequency changes when a wave enters a new medium",
    description:
      "Changes the frequency (or keeps the wavelength) across a boundary, instead of the frequency staying fixed while speed and wavelength change.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [13, 14] },
  },
  {
    id: "total-internal-reflection-direction",
    label: "Expects total internal reflection going into the slower medium",
    description:
      "Looks for a critical angle for light passing from low index to high index, or inverts the ratio in sin θc = n2/n1.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [13] },
  },
  // --- AP Physics 2, Unit 14: waves, sound and physical optics -----------------------------------
  {
    id: "wave-speed-depends-on-source",
    label: "Thinks frequency or amplitude sets the wave's speed",
    description:
      "Expects a faster wave from a higher frequency, a bigger amplitude or a harder flick, rather than the speed being set by the medium.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [14] },
  },
  {
    id: "wave-carries-matter",
    label: "Thinks the medium travels with the wave",
    description:
      "Says particles of the string, water or air move along with the wave instead of oscillating about fixed positions.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [14] },
  },
  {
    id: "amplitude-frequency-confusion",
    label: "Confuses amplitude with frequency or wavelength",
    description:
      "Links loudness to pitch or brightness to colour, or reads amplitude off a graph as wavelength or period.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [14] },
  },
  {
    id: "boundary-phase-change",
    label: "Gets the phase change at a boundary wrong",
    description:
      "Inverts a pulse at a free end (or not at a fixed end), or misses the half-wavelength shift when light reflects from a higher-index medium in thin films.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [14] },
  },
  {
    id: "superposition-not-temporary",
    label: "Thinks waves that meet change each other permanently",
    description:
      "Says pulses bounce off or destroy each other, rather than adding while they overlap and then continuing unchanged.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [14] },
  },
  {
    id: "doppler-depends-on-distance",
    label: "Ties the Doppler shift to distance",
    description:
      "Expects the observed frequency to keep rising as a source gets closer, instead of depending on the relative velocity.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [14] },
  },
  {
    id: "standing-wave-harmonics",
    label: "Assigns the wrong harmonics or wavelengths to a standing wave",
    description:
      "Uses λ = L for every fundamental, gives a pipe closed at one end even harmonics, or counts nodes as antinodes.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [14] },
  },
  {
    id: "interference-condition-swapped",
    label: "Swaps the conditions for bright and dark",
    description:
      "Puts maxima at half-integer path differences, or forgets how a phase change on reflection moves the conditions.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [14] },
  },
  {
    id: "slit-width-pattern-width",
    label: "Expects a narrower slit to give a narrower pattern",
    description:
      "Reasons geometrically (shadow of the slit) so closing a slit or spacing narrows the pattern, when it spreads the pattern out.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [14] },
  },
  {
    id: "light-speed-varies-in-vacuum",
    label: "Thinks different kinds of light travel at different speeds in vacuum",
    description:
      "Gives radio waves, visible light or gamma rays different speeds in vacuum, or says electromagnetic waves need a medium.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [14] },
  },
  // --- AP Physics 2, Unit 15: modern physics -----------------------------------------------------
  {
    id: "intensity-sets-photon-energy",
    label: "Thinks brighter light means more energetic photons",
    description:
      "Expects intense light below the threshold frequency to eject electrons, or electron energy to rise with intensity rather than frequency.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [15] },
  },
  {
    id: "work-function-ignored",
    label: "Gives the freed electron all of the photon's energy",
    description:
      "Leaves out the work function (or binding energy), so the electron's kinetic energy comes out as hf rather than hf − φ and any frequency seems able to free it.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [15] },
  },
  {
    id: "photon-energy-is-level-energy",
    label: "Sets a photon's energy equal to one level's energy",
    description:
      "Uses the energy of a level rather than the difference between two levels, or lets an atom absorb a photon of any energy.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [15] },
  },
  {
    id: "emission-absorption-confusion",
    label: "Mixes up emission and absorption",
    description:
      "Has an atom emit a photon while moving up a level, or expects absorption lines at wavelengths the atom cannot emit.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [15] },
  },
  {
    id: "matter-wave-misread",
    label: "Misreads the de Broglie wavelength",
    description:
      "Expects a faster or heavier particle to have a longer wavelength, or treats the wave as the particle's path.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [15] },
  },
  {
    id: "blackbody-peak-wrong-way",
    label: "Shifts the blackbody peak the wrong way or scales power linearly",
    description:
      "Says a hotter object peaks at a longer wavelength, or that doubling the temperature doubles the power radiated.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [15] },
  },
  {
    id: "photon-slows-when-losing-energy",
    label: "Thinks a photon that loses energy slows down",
    description:
      "Has a scattered photon travel slower (or get a shorter wavelength) rather than keep speed c with a longer wavelength.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [15] },
  },
  {
    id: "mass-conserved-in-nuclear-reactions",
    label: "Treats mass as conserved in nuclear reactions",
    description:
      "Ignores the mass difference that appears as energy, or expects products to be more massive when energy is released.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [15] },
  },
  {
    id: "nucleon-charge-bookkeeping",
    label: "Does not conserve nucleon number or charge in a decay",
    description:
      "Changes mass number in beta decay, changes atomic number by the wrong amount in alpha decay, or lets gamma emission change the nuclide.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [15] },
  },
  {
    id: "half-life-linear",
    label: "Treats radioactive decay as linear",
    description:
      "Says a sample is gone after two half-lives, or that half-life changes with the amount of material.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-2": [15] },
  },
  // --- AP Physics C: Electricity and Magnetism only (calculus-based) ------------------------------
  {
    id: "gauss-law-without-symmetry",
    label: "Uses Gauss's law where there is no symmetry to use",
    description:
      "Pulls E out of the flux integral for a surface where the field is not constant in size or not perpendicular to it (a finite rod, a cube around a point charge), or picks a Gaussian surface that does not match the charge's symmetry.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-c-em": [8] },
  },
  {
    id: "flux-field-confusion",
    label: "Confuses a flux or circulation with the field",
    description:
      "Concludes that the field is zero on a closed surface because the net flux is zero (or zero along a path that encloses no current), or that charges outside the surface add to its net flux; the flux or circulation counts only what is enclosed, while the field comes from every source.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-c-em": [8, 12] },
  },
  {
    id: "enclosed-charge-or-current-wrong",
    label: "Uses the total charge or current instead of what is enclosed",
    description:
      "Puts the whole charge of a sphere or cylinder into Gauss's law for a point inside it, or the whole current of a thick wire into Ampère's law for a path inside it, instead of the part the surface or path encloses.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-c-em": [8, 12] },
  },
  {
    id: "distribution-as-point-charge",
    label: "Treats spread-out charge as a point charge",
    description:
      "Replaces a rod, ring or arc of charge with a point charge at its centre, or adds the sizes of the field contributions without taking components, instead of integrating over the distribution.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-c-em": [8, 9] },
  },
  {
    id: "potential-gradient-sign",
    label: "Gets the sign or direction wrong between field and potential",
    description:
      "Drops the minus sign in E = −dV/dr or ΔV = −∫E·dr, so the field points toward higher potential or the potential rises along the field.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-c-em": [9] },
  },
  {
    id: "dielectric-misapplied",
    label: "Applies a dielectric the wrong way",
    description:
      "Divides the capacitance by the dielectric constant instead of multiplying, or expects the dielectric to strengthen the field between isolated plates when it weakens it.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-c-em": [10] },
  },
  {
    id: "plate-field-misused",
    label: "Uses the wrong field for one capacitor plate",
    description:
      "Uses σ/2ε0, the field of one sheet, for the field between two plates, or the full field σ/ε0 between them for the force one plate exerts on the other, when each plate feels only the other plate's field.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-c-em": [8, 10] },
  },
  {
    id: "nonuniform-treated-as-uniform",
    label: "Treats a varying field, density or current as constant",
    description:
      "Takes a field, charge or current density, distance or force that changes with position, time or speed out of an integral, or multiplies by one value of it (the value at the centre, at the start or at the end), instead of integrating.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-c-em": [8, 9, 10, 11, 12, 13] },
  },
  {
    id: "time-constant-misread",
    label: "Misreads the time constant of an RC or LR circuit",
    description:
      "Uses RC for an inductor circuit or inverts L/R, expects more resistance to slow an LR circuit the way it slows an RC circuit (it shortens L/R), or leaves out part of the resistance or capacitance that sets the time constant.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-c-em": [11, 13] },
  },
  {
    id: "ampere-law-without-symmetry",
    label: "Uses Ampère's law where there is no symmetry to use",
    description:
      "Pulls B out of the path integral for a short wire segment or a single loop, where the field is not constant along any simple path and the Biot-Savart law is needed.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-c-em": [12] },
  },
  {
    id: "emf-from-flux-not-rate",
    label: "Ties the induced emf to the flux instead of its rate of change",
    description:
      "Expects the largest emf when the flux is largest, or uses Φ/t for a flux that does not change steadily, instead of the derivative dΦ/dt at that instant (zero where the flux peaks).",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-c-em": [13] },
  },
  {
    id: "inductor-opposes-current",
    label: "Thinks an inductor opposes current rather than a change in current",
    description:
      "Gives an inductor a potential difference for a steady current, or gets the sign of ε = −L dI/dt wrong, so the inductor helps a current grow or fights one that is already steady.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-c-em": [13] },
  },
  {
    id: "inductor-limits-swapped",
    label: "Gets the inductor's limiting behaviour backwards",
    description:
      "Treats an inductor as a plain wire at the instant a switch closes, or as a break in the circuit after a long time, or lets its current jump when a switch opens.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-c-em": [13] },
  },
  {
    id: "lc-charge-current-in-phase",
    label: "Thinks charge and current peak together in an LC circuit",
    description:
      "Puts the largest current at the moment the capacitor is fully charged, when the current is zero there and largest as the capacitor passes through zero charge; or lets the oscillation's energy drain away with no resistance.",
    category: "conceptual",
    units: [],
    courseUnits: { "physics-c-em": [13] },
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

/** The units a tag lists for a course itself: `units` for AP Physics 1, `courseUnits` otherwise. */
function ownUnits(tag: MisconceptionTag, course: ApCourseKey): number[] {
  return (course === DEFAULT_AP_COURSE_KEY ? tag.units : tag.courseUnits?.[course]) ?? [];
}

/**
 * Courses that cover the ground of another course: a tag with no units of its own in the course
 * takes the other course's, renumbered. A unit that is not listed does not carry over. A tag's own
 * `courseUnits` entry always wins, which is how a tag is narrowed to the units it really fits.
 */
const SHARED_UNITS: Partial<
  Record<ApCourseKey, { from: ApCourseKey; units: Readonly<Record<number, readonly number[]>> }>
> = {
  // C: Mechanics units 1-7 match AP Physics 1 units 1-7 (unit 8, fluids, is not in the course).
  "physics-c-mech": {
    from: "physics-1",
    units: { 1: [1], 2: [2], 3: [3], 4: [4], 5: [5], 6: [6], 7: [7] },
  },
  // C: E&M splits Physics 2's unit 10 (charge, field, potential, capacitors) over its units 8-10
  // and unit 12 (magnetism, induction) over 12-13; the circuits unit is 11 in both. Thermodynamics
  // (9), optics, waves and modern physics (13-15) do not carry over.
  "physics-c-em": {
    from: "physics-2",
    units: { 10: [8, 9, 10], 11: [11], 12: [12, 13] },
  },
};

/**
 * The units of one course where a tag usually shows up. `[]` means any unit (procedural slips and
 * "other"); `null` means the tag does not belong to that course at all.
 */
export function misconceptionUnits(
  tag: MisconceptionTag,
  course: ApCourseKey = DEFAULT_AP_COURSE_KEY,
): number[] | null {
  if (!tag.units.length && !tag.courseUnits) return [];
  const own = ownUnits(tag, course);
  if (own.length) return own;
  // No units of its own in this course: the tag may come with the ground another course covers.
  const shared = SHARED_UNITS[course];
  if (!shared) return null;
  const mapped = new Set(ownUnits(tag, shared.from).flatMap((u) => shared.units[u] ?? []));
  return mapped.size ? [...mapped].sort((a, b) => a - b) : null;
}

/** Every tag a course uses, including the any-unit ones. */
export function misconceptionsForCourse(
  course: ApCourseKey = DEFAULT_AP_COURSE_KEY,
): MisconceptionTag[] {
  return MISCONCEPTION_TAGS.filter((t) => misconceptionUnits(t, course) !== null);
}

/** Tags that fit a unit of a course: the ones mapped to it, plus the any-unit ones. */
export function misconceptionsForUnit(
  unit: number,
  course: ApCourseKey = DEFAULT_AP_COURSE_KEY,
): MisconceptionTag[] {
  return MISCONCEPTION_TAGS.filter((t) => {
    const units = misconceptionUnits(t, course);
    return units !== null && (!units.length || units.includes(unit));
  });
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

/**
 * Compact list for the AI grading prompt: "id: label", for the tags of one course. Procedural tags
 * the checker sets are left out.
 */
export function misconceptionPromptList(course: ApCourseKey = DEFAULT_AP_COURSE_KEY): string {
  const skip = new Set([
    "sign-error",
    "power-of-ten",
    "unit-missing",
    "unit-wrong",
    "unit-conversion",
    "significant-figures",
    "other",
  ]);
  return MISCONCEPTION_TAGS.filter((t) => !skip.has(t.id) && misconceptionUnits(t, course) !== null)
    .map((t) => `- ${t.id}: ${t.label}`)
    .join("\n");
}
