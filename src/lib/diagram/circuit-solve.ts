// The circuit a `circuit` diagram describes, and a solver for it. The drawing and the numbers come
// from the same parsed description, so an answer key can be recomputed from the picture.
//
// Pure: no DOM, no dependencies. Nodal analysis (modified, one current unknown per element) on
// ideal elements: a wire, a closed switch and an ammeter have zero resistance; an open switch and
// a voltmeter carry no current. A capacitor is open in the steady state and a wire at t = 0
// (uncharged); an inductor is the reverse.

import { type Cmd, type DgError, type Doc, parse } from "./parse";
import { braceSubscripts, plain } from "./svg";

export type ElementType =
  | "battery"
  | "resistor"
  | "capacitor"
  | "inductor"
  | "bulb"
  | "switch"
  | "ammeter"
  | "voltmeter"
  | "wire";

export interface CircuitElement {
  /** Unique name: the element's label if it has one (R_1), else type letter + number (R1). */
  id: string;
  type: ElementType;
  /** First node. For a battery this is the + terminal. */
  a: string;
  b: string;
  /** SI value: V for a battery, Ω for a resistor or bulb, F for a capacitor, H for an inductor. */
  value?: number;
  /** The value as drawn: "12 V". */
  valueText?: string;
  /** Name labels as written (label markup). */
  labels: string[];
  /** Battery internal resistance in Ω. */
  r?: number;
  rText?: string;
  /** Switch state; a switch with no state is open. */
  open?: boolean;
  /** A current arrow to draw beside the element; it points a -> b unless reverse. */
  arrow?: { label: string; reverse: boolean };
  line: number;
}

export interface Circuit {
  elements: CircuitElement[];
  /** Node names in the order they first appear. */
  nodes: string[];
  ground?: string;
  /** Nodes drawn with a dot and a label. */
  nodeLabels: Record<string, string>;
  /** Explicit grid positions (x right, y up), when the author placed the nodes. */
  positions: Record<string, [number, number]>;
  /** Series lines: the unnamed nodes between a chain's ends, in order. */
  chains: { from: string; to: string; mids: string[] }[];
  line: number;
}

const TYPE_WORDS: Record<string, ElementType> = {
  battery: "battery",
  bat: "battery",
  cell: "battery",
  source: "battery",
  emf: "battery",
  resistor: "resistor",
  res: "resistor",
  capacitor: "capacitor",
  cap: "capacitor",
  inductor: "inductor",
  ind: "inductor",
  coil: "inductor",
  bulb: "bulb",
  lamp: "bulb",
  switch: "switch",
  sw: "switch",
  ammeter: "ammeter",
  voltmeter: "voltmeter",
  wire: "wire",
};
/** One-letter forms, only as the first word of a line (in a series line R is a label). */
const TYPE_LETTERS: Record<string, ElementType> = {
  R: "resistor",
  C: "capacitor",
  L: "inductor",
  S: "switch",
  A: "ammeter",
  V: "voltmeter",
  W: "wire",
  B: "battery",
};
const ID_LETTER: Record<ElementType, string> = {
  battery: "V",
  resistor: "R",
  capacitor: "C",
  inductor: "L",
  bulb: "B",
  switch: "S",
  ammeter: "A",
  voltmeter: "VM",
  wire: "W",
};
const UNIT: Partial<Record<ElementType, string>> = {
  battery: "V",
  resistor: "Ω",
  bulb: "Ω",
  capacitor: "F",
  inductor: "H",
};
const PREFIX: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  μ: 1e-6,
  µ: 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
};
const UNIT_RE = /^(p|n|u|μ|µ|m|k|K|M|G)?(V|Ω|Ω|[Oo]hms?|F|H)$/;
const VALUE_RE = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(.*)$/;

type Value = { value: number; text: string; unit: string };

/** "12V", "4.7kΩ", "10uF", "3" -> SI value and the text to draw. Undefined when it isn't a value. */
function readValue(tok: string, dflt: string | undefined): Value | undefined {
  const m = tok.replace("−", "-").match(VALUE_RE);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  if (!m[2]) return { value: n, text: dflt ? `${m[1]} ${dflt}` : m[1], unit: dflt ?? "" };
  const u = m[2].match(UNIT_RE);
  if (!u) return undefined;
  const unit = /ohm/i.test(u[2]) || u[2] === "Ω" ? "Ω" : u[2];
  const prefix = u[1] === "u" || u[1] === "µ" ? "μ" : u[1] === "K" ? "k" : (u[1] ?? "");
  return { value: n * (u[1] ? PREFIX[u[1]] : 1), text: `${m[1]} ${prefix}${unit}`, unit };
}

const NODE_RE = /^\w+$/;

export function circuitFromDoc(doc: Doc, errs: DgError[]): Circuit {
  const c: Circuit = {
    elements: [],
    nodes: [],
    nodeLabels: {},
    positions: {},
    chains: [],
    line: doc.head.line,
  };
  const seen = (n: string) => {
    if (!c.nodes.includes(n)) c.nodes.push(n);
  };
  let auto = 0;
  const counts: Partial<Record<ElementType, number>> = {};
  const ids = new Set<string>();

  /** Tokens after the nodes of one element: value, open/closed, labels. */
  const build = (
    type: ElementType,
    a: string,
    b: string,
    toks: string[],
    cmd: Cmd,
    single: boolean,
  ): void => {
    const el: CircuitElement = { id: "", type, a, b, labels: [], line: cmd.line };
    if (single && cmd.text !== undefined) el.labels.push(braceSubscripts(cmd.text));
    for (let i = 0; i < toks.length; i++) {
      let t = toks[i];
      if (type === "switch" && (t === "open" || t === "closed")) {
        el.open = t === "open";
        continue;
      }
      // "12 V" written with a space
      if (/^[-+−]?[\d.]+$/.test(t) && toks[i + 1] && UNIT_RE.test(toks[i + 1])) t += toks[++i];
      const v = el.value === undefined && UNIT[type] ? readValue(t, UNIT[type]) : undefined;
      if (v) {
        if (v.unit !== UNIT[type])
          errs.push({
            line: cmd.line,
            msg: `a ${type}'s value is in ${UNIT[type]}, got "${t}"`,
          });
        el.value = v.value;
        el.valueText = v.text;
      } else el.labels.push(braceSubscripts(t));
    }
    if (type === "switch" && el.open === undefined) el.open = true;
    if (single) {
      for (const [k, v] of Object.entries(cmd.kv)) {
        if (k === "r" && type === "battery") {
          const r = readValue(v, "Ω");
          if (!r || r.unit !== "Ω" || r.value < 0)
            errs.push({ line: cmd.line, msg: `r= needs a resistance like r=0.5Ω, got "${v}"` });
          else {
            el.r = r.value;
            el.rText = r.text;
          }
        } else if (k === "i" || k === "ir")
          el.arrow = { label: braceSubscripts(v), reverse: k === "ir" };
        else if (k === "label") el.labels.push(braceSubscripts(v));
        else
          errs.push({
            line: cmd.line,
            msg: `${type} has no "${k}=" (use i=I_1 for a current arrow from the first node to the second, ir= for the other way${type === "battery" ? ", r=0.5Ω for internal resistance" : ""})`,
          });
      }
    }
    if (el.value !== undefined && el.value < 0 && type !== "battery")
      errs.push({ line: cmd.line, msg: `a ${type}'s value cannot be negative` });
    if (a === b)
      errs.push({
        line: cmd.line,
        msg: `both ends of this ${type} are on node ${a}; an element joins two different nodes`,
      });
    const n = (counts[type] = (counts[type] ?? 0) + 1);
    let id = el.labels[0] ? plain(el.labels[0]).trim() : "";
    if (!id || ids.has(id)) id = `${ID_LETTER[type]}${n}`;
    while (ids.has(id)) id += "'";
    ids.add(id);
    el.id = id;
    seen(a);
    seen(b);
    c.elements.push(el);
  };

  const nodesOf = (cmd: Cmd, what: string): [string, string] | undefined => {
    const [a, b] = cmd.args;
    const bad = [a, b].find((n) => n === undefined || !NODE_RE.test(n) || n in TYPE_WORDS);
    if (a === undefined || b === undefined || bad !== undefined) {
      errs.push({
        line: cmd.line,
        msg: `${what} needs its two nodes first, e.g. ${what} a b${bad !== undefined ? ` (got "${bad}")` : ""}`,
      });
      return undefined;
    }
    return [a, b];
  };

  for (const cmd of doc.cmds) {
    const op = cmd.op;
    const type = TYPE_WORDS[op.toLowerCase()] ?? TYPE_LETTERS[op];
    if (type) {
      const n = nodesOf(cmd, op);
      if (n) build(type, n[0], n[1], cmd.args.slice(2), cmd, true);
      continue;
    }
    switch (op) {
      case "series":
      case "parallel": {
        const n = nodesOf(cmd, op);
        if (!n) break;
        if (Object.keys(cmd.kv).length || cmd.text !== undefined)
          errs.push({
            line: cmd.line,
            msg: `${op} takes plain words only; put an element that needs a quoted label or an option (i= r=) on its own line`,
          });
        // split the rest into groups, each starting with an element word
        const groups: { type: ElementType; toks: string[] }[] = [];
        for (const t of cmd.args.slice(2)) {
          const ty = TYPE_WORDS[t.toLowerCase()];
          if (ty) groups.push({ type: ty, toks: [] });
          else if (!groups.length)
            errs.push({
              line: cmd.line,
              msg: `after the nodes, ${op} lists elements, each starting with its kind: ${op} a b resistor 4Ω R_1 resistor 6Ω R_2 (got "${t}")`,
            });
          else groups[groups.length - 1].toks.push(t);
        }
        if (!groups.length) {
          errs.push({ line: cmd.line, msg: `${op} lists no elements` });
          break;
        }
        const mids: string[] = [];
        groups.forEach((g, i) => {
          if (op === "parallel") build(g.type, n[0], n[1], g.toks, cmd, false);
          else {
            const from = i === 0 ? n[0] : `_${auto}`;
            const to = i === groups.length - 1 ? n[1] : `_${++auto}`;
            if (i < groups.length - 1) mids.push(to);
            build(g.type, from, to, g.toks, cmd, false);
          }
        });
        if (mids.length) c.chains.push({ from: n[0], to: n[1], mids });
        break;
      }
      case "ground":
      case "gnd": {
        const n = cmd.args[0];
        if (!n) errs.push({ line: cmd.line, msg: "ground needs a node, e.g. ground b" });
        else if (c.ground !== undefined && c.ground !== n)
          errs.push({
            line: cmd.line,
            msg: "only one ground is drawn; join grounded nodes with a wire",
          });
        else c.ground = n;
        break;
      }
      case "node":
      case "label": {
        const n = cmd.args[0];
        if (!n) errs.push({ line: cmd.line, msg: 'node needs a node name, e.g. node a "A"' });
        else c.nodeLabels[n] = braceSubscripts(cmd.text ?? cmd.args[1] ?? n);
        break;
      }
      case "at": {
        if (cmd.args.length < 2 || cmd.args.length % 2)
          errs.push({ line: cmd.line, msg: "at takes node x,y pairs, e.g. at a 0,0 b 2,0" });
        for (let i = 0; i + 1 < cmd.args.length; i += 2) {
          const m = cmd.args[i + 1].match(/^(-?[\d.]+),(-?[\d.]+)$/);
          if (!m)
            errs.push({
              line: cmd.line,
              msg: `expected a grid point like 2,1 after ${cmd.args[i]}, got "${cmd.args[i + 1]}"`,
            });
          else c.positions[cmd.args[i]] = [Number(m[1]), Number(m[2])];
        }
        break;
      }
      default:
        errs.push({
          line: cmd.line,
          msg: `circuit has no "${op}" (use battery resistor capacitor inductor bulb switch ammeter voltmeter wire, each followed by its two nodes; or series, parallel, ground, node, at)`,
        });
    }
  }
  for (const [what, names] of [
    ["ground", c.ground ? [c.ground] : []],
    ["node", Object.keys(c.nodeLabels)],
    ["at", Object.keys(c.positions)],
  ] as const)
    for (const n of names)
      if (!c.nodes.includes(n))
        errs.push({
          line: doc.cmds.find((d) => d.args.includes(n))?.line ?? doc.head.line,
          msg: `${what} names node "${n}", but no element is connected to it`,
        });
  return c;
}

/** Parse a `circuit` diagram source into the circuit it describes. */
export function parseCircuit(src: string): { circuit?: Circuit; errors: DgError[] } {
  const { doc, errors } = parse(src);
  if (!doc) return { errors };
  if (doc.kind !== "circuit")
    return { errors: [{ line: doc.head.line, msg: `not a circuit diagram ("${doc.kind}")` }] };
  const circuit = circuitFromDoc(doc, errors);
  return errors.length ? { errors } : { circuit, errors };
}

// ---------------------------------------------------------------------------------------------

export interface SolveOptions {
  /**
   * "steady" (default): long after any switching; capacitors are open, inductors are wires.
   * "t0": the instant after switching with nothing stored; capacitors are wires, inductors open.
   */
  at?: "steady" | "t0";
  /** The node at 0 V. Default: the diagram's ground, else the first battery's − terminal. */
  ground?: string;
  /**
   * Switch states to use instead of the drawn ones: "closed" or "open" for all of them, or a state
   * per switch id.
   */
  switches?: "closed" | "open" | Record<string, "closed" | "open">;
}

export interface ElementResult {
  id: string;
  type: ElementType;
  /** Amperes through the element, positive from its first node (a) to its second (b). */
  current: number;
  /** Volts, V(a) − V(b). For a battery this is the terminal voltage. NaN if not determined. */
  voltage: number;
  /** The way conventional current actually flows through the element (from === to when it is zero). */
  from: string;
  to: string;
  /** Watts absorbed (voltage × current); negative for a battery that is delivering energy. */
  power: number;
}

export interface CircuitSolution {
  ok: boolean;
  /** Why the circuit could not be solved (empty when ok). */
  errors: string[];
  at: "steady" | "t0";
  ground: string;
  /** Volts at each node relative to ground. NaN for a node with no conducting path to ground. */
  potentials: Record<string, number>;
  /** Nodes whose potential is not fixed by the circuit (cut off by open elements). */
  floating: string[];
  /** Per element, by id. */
  elements: Record<string, ElementResult>;
  /** When the circuit has exactly one battery: what it delivers. */
  source?: { id: string; emf: number; current: number; terminalVoltage: number };
  /**
   * Equivalent resistance of everything outside the single battery (terminal voltage ÷ current),
   * in Ω. Infinity when no current flows. Undefined unless there is exactly one battery.
   */
  req?: number;
  /**
   * For a circuit with exactly one capacitor or exactly one inductor: the Thevenin resistance the
   * element sees (batteries replaced by their internal resistance) and the time constant, R·C or
   * L/R, in seconds. They use the switch states in force, so pass switches for the state after
   * switching.
   */
  rth?: number;
  tau?: number;
}

type Branch = { el: CircuitElement; R: number; E: number };

function switchOpen(el: CircuitElement, o: SolveOptions): boolean {
  const s = o.switches;
  if (s === "closed") return false;
  if (s === "open") return true;
  if (s && el.id in s) return s[el.id] === "open";
  return el.open !== false;
}

/** Each element as a branch V(a) − V(b) − R·i = E, or nothing when it carries no current. */
function branches(c: Circuit, o: SolveOptions, errors: string[], dead = false): Branch[] {
  const at = o.at ?? "steady";
  const out: Branch[] = [];
  for (const el of c.elements) {
    switch (el.type) {
      case "battery":
        if (el.value === undefined) errors.push(`battery ${el.id} has no EMF value`);
        out.push({ el, R: el.r ?? 0, E: dead ? 0 : (el.value ?? 0) });
        break;
      case "resistor":
      case "bulb":
        if (el.value === undefined) errors.push(`${el.type} ${el.id} has no resistance value`);
        out.push({ el, R: el.value ?? 1, E: 0 });
        break;
      case "wire":
      case "ammeter":
        out.push({ el, R: 0, E: 0 });
        break;
      case "switch":
        if (!switchOpen(el, o)) out.push({ el, R: 0, E: 0 });
        break;
      case "capacitor":
        if (at === "t0") out.push({ el, R: 0, E: 0 });
        break;
      case "inductor":
        if (at === "steady") out.push({ el, R: 0, E: 0 });
        break;
      case "voltmeter":
        break;
    }
  }
  return out;
}

/** Gaussian elimination with partial pivoting. Returns undefined for a singular system. */
function solveLinear(A: number[][], b: number[]): number[] | undefined {
  const n = b.length;
  const scale = Math.max(1e-300, ...A.flat().map(Math.abs));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12 * scale) return undefined;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col];
      if (!f) continue;
      for (let k = col; k < n; k++) A[r][k] -= f * A[col][k];
      b[r] -= f * b[col];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return x;
}

function components(nodes: string[], edges: [string, string][]): Map<string, number> {
  const parent = new Map(nodes.map((n) => [n, n]));
  const find = (n: string): string => {
    let r = n;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(n, r);
    return r;
  };
  for (const [a, b] of edges) parent.set(find(a), find(b));
  const ids = new Map<string, number>();
  const out = new Map<string, number>();
  for (const n of nodes) {
    const r = find(n);
    if (!ids.has(r)) ids.set(r, ids.size);
    out.set(n, ids.get(r)!);
  }
  return out;
}

/** Solve a parsed circuit. See SolveOptions for the capacitor / inductor / switch conventions. */
export function solveCircuit(c: Circuit, opts: SolveOptions = {}): CircuitSolution {
  const at = opts.at ?? "steady";
  const errors: string[] = [];
  const firstBattery = c.elements.find((e) => e.type === "battery");
  const ground = opts.ground ?? c.ground ?? firstBattery?.b ?? c.nodes[0] ?? "";
  const fail = (): CircuitSolution => ({
    ok: false,
    errors,
    at,
    ground,
    potentials: {},
    floating: [],
    elements: {},
  });
  if (!c.elements.length) errors.push("the circuit has no elements");
  else if (!c.nodes.includes(ground)) errors.push(`ground node "${ground}" is not in the circuit`);
  const br = branches(c, opts, errors);
  if (errors.length) return fail();

  // A loop of zero-resistance branches is either a short (EMFs don't cancel) or leaves the split
  // of current between its paths undetermined. Track V(node) − V(root) through such branches.
  {
    const parent = new Map(c.nodes.map((n) => [n, n]));
    const off = new Map(c.nodes.map((n) => [n, 0])); // V(n) − V(parent)
    const find = (n: string): [string, number] => {
      let r = n,
        d = 0;
      while (parent.get(r) !== r) {
        d += off.get(r)!;
        r = parent.get(r)!;
      }
      return [r, d];
    };
    for (const b of br) {
      if (b.R !== 0) continue;
      const [ra, da] = find(b.el.a),
        [rb, db] = find(b.el.b);
      if (ra !== rb) {
        // V(a) − V(b) = E  =>  V(ra) − V(rb) = E − da + db
        parent.set(ra, rb);
        off.set(ra, b.E - da + db);
      } else if (Math.abs(da - db - b.E) > 1e-9) {
        const bat = b.el.type === "battery" ? b.el : firstBattery;
        errors.push(
          `short circuit: ${bat ? `battery ${bat.id}` : b.el.id} is connected across zero resistance, so the current is unbounded`,
        );
      } else
        errors.push(
          `the current through ${b.el.id} is not determined: it is in a loop of zero-resistance elements`,
        );
    }
    if (errors.length) return fail();
  }

  const comp = components(
    c.nodes,
    br.map((b) => [b.el.a, b.el.b]),
  );
  const groundComp = comp.get(ground)!;
  const local = new Map<string, number>(); // potential relative to the component's reference
  const current = new Map<string, number>();
  const nComp = Math.max(...comp.values()) + 1;
  for (let k = 0; k < nComp; k++) {
    const nodes = c.nodes.filter((n) => comp.get(n) === k);
    const ref = k === groundComp ? ground : nodes[0];
    const mine = br.filter((b) => comp.get(b.el.a) === k);
    const unknownNodes = nodes.filter((n) => n !== ref);
    const idx = new Map(unknownNodes.map((n, i) => [n, i]));
    const N = unknownNodes.length + mine.length;
    const A = Array.from({ length: N }, () => new Array<number>(N).fill(0));
    const rhs = new Array<number>(N).fill(0);
    mine.forEach((b, j) => {
      const col = unknownNodes.length + j;
      const ia = idx.get(b.el.a),
        ib = idx.get(b.el.b);
      // Kirchhoff's current law: the branch current leaves a and enters b
      if (ia !== undefined) A[ia][col] += 1;
      if (ib !== undefined) A[ib][col] -= 1;
      // branch law: V(a) − V(b) − R·i = E
      if (ia !== undefined) A[col][ia] += 1;
      if (ib !== undefined) A[col][ib] -= 1;
      A[col][col] -= b.R;
      rhs[col] = b.E;
    });
    const x = N ? solveLinear(A, rhs) : [];
    if (!x) {
      errors.push("the circuit's equations have no single solution (check for shorted sources)");
      return fail();
    }
    local.set(ref, 0);
    unknownNodes.forEach((n, i) => local.set(n, x[i]));
    mine.forEach((b, j) => current.set(b.el.id, x[unknownNodes.length + j]));
  }

  const clean = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v);
  const potentials: Record<string, number> = {};
  const floating: string[] = [];
  for (const n of c.nodes) {
    if (comp.get(n) === groundComp) potentials[n] = clean(local.get(n)!);
    else {
      potentials[n] = NaN;
      floating.push(n);
    }
  }
  const elements: Record<string, ElementResult> = {};
  for (const el of c.elements) {
    const i = clean(current.get(el.id) ?? 0);
    const v = comp.get(el.a) === comp.get(el.b) ? clean(local.get(el.a)! - local.get(el.b)!) : NaN;
    elements[el.id] = {
      id: el.id,
      type: el.type,
      current: i,
      voltage: v,
      from: i < 0 ? el.b : el.a,
      to: i > 0 ? el.b : i < 0 ? el.a : el.a,
      power: clean(v * i) || 0,
    };
  }
  const sol: CircuitSolution = { ok: true, errors, at, ground, potentials, floating, elements };

  const batteries = c.elements.filter((e) => e.type === "battery");
  if (batteries.length === 1) {
    const b = batteries[0],
      r = elements[b.id];
    const out = clean(-r.current); // leaving the + terminal
    sol.source = { id: b.id, emf: b.value!, current: out, terminalVoltage: r.voltage };
    sol.req = out === 0 ? Infinity : r.voltage / out;
  }
  const reactive = c.elements.filter((e) => e.type === "capacitor" || e.type === "inductor");
  if (reactive.length === 1) {
    const x = reactive[0];
    const rth = theveninResistance(c, x, opts);
    if (rth !== undefined) {
      sol.rth = rth;
      if (x.value !== undefined)
        sol.tau = x.type === "capacitor" ? rth * x.value : rth === 0 ? Infinity : x.value / rth;
    }
  }
  return sol;
}

/**
 * Resistance seen from the terminals of `x` with every battery replaced by its internal
 * resistance: join nodes that zero-resistance branches connect, then inject 1 A at one terminal,
 * take it out at the other and read the voltage.
 */
function theveninResistance(c: Circuit, x: CircuitElement, opts: SolveOptions): number | undefined {
  const errs: string[] = [];
  // steady/t0 does not matter here: x is the only capacitor or inductor and it is taken out
  const br = branches({ ...c, elements: c.elements.filter((e) => e !== x) }, opts, errs, true);
  if (errs.length) return undefined;
  const sup = components(
    c.nodes,
    br.filter((b) => b.R === 0).map((b) => [b.el.a, b.el.b]),
  );
  const a = sup.get(x.a)!,
    b = sup.get(x.b)!;
  if (a === b) return 0;
  const res = br.filter((q) => q.R !== 0 && sup.get(q.el.a) !== sup.get(q.el.b));
  const supNodes = [...new Set(sup.values())].map(String);
  const conn = components(
    supNodes,
    res.map((q) => [String(sup.get(q.el.a)), String(sup.get(q.el.b))]),
  );
  if (conn.get(String(a)) !== conn.get(String(b))) return Infinity;
  const mine = supNodes.filter((n) => conn.get(n) === conn.get(String(a)) && n !== String(b));
  const idx = new Map(mine.map((n, i) => [n, i]));
  const G = Array.from({ length: mine.length }, () => new Array<number>(mine.length).fill(0));
  const I = new Array<number>(mine.length).fill(0);
  for (const q of res) {
    const i = idx.get(String(sup.get(q.el.a))),
      j = idx.get(String(sup.get(q.el.b)));
    const g = 1 / q.R;
    if (i !== undefined) G[i][i] += g;
    if (j !== undefined) G[j][j] += g;
    if (i !== undefined && j !== undefined) {
      G[i][j] -= g;
      G[j][i] -= g;
    }
  }
  I[idx.get(String(a))!] = 1;
  const v = solveLinear(G, I);
  return v ? v[idx.get(String(a))!] : undefined;
}
