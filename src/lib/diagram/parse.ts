// Line-based diagram language. One generic parser; each diagram kind
// (plot, fbd, scene) decides which commands it accepts.
//
//   <kind> [args] [key=value] ["label"]      first non-blank line
//   <cmd>  [args] [key=value] ["label"]      one command per line
//   # comment
//
// Tokens: bare words, key=value, "quoted strings". Values may be quoted:
// x="t (s)". A bare word may contain anything except spaces and quotes.

export type Cmd = {
  op: string;
  args: string[]; // bare positional tokens
  kv: Record<string, string>; // key=value options
  text?: string; // first quoted string, if any
  line: number; // 1-based, for error messages
};

export type Doc = { kind: string; head: Cmd; cmds: Cmd[] };
/**
 * kind (warnings only): "physics" = the picture says something false (a live tutor drops it),
 * "readability" = true but hard to read, "markup" = a label drawn as plain text.
 */
export type DgError = { line: number; msg: string; kind?: "physics" | "readability" | "markup" };

const TOKEN = /(\w+)=("([^"]*)"|\S+)|"([^"]*)"|(\S+)/g;

export function parse(src: string): { doc?: Doc; errors: DgError[] } {
  const errors: DgError[] = [];
  const cmds: Cmd[] = [];
  src.split(/\r?\n/).forEach((raw, i) => {
    const line = stripComment(raw).trim();
    if (!line || line.startsWith("```")) return; // models often wrap the source in its own ```dg fence
    const cmd: Cmd = { op: "", args: [], kv: {}, line: i + 1 };
    for (const m0 of line.matchAll(TOKEN)) {
      const m = unwrap(m0);
      if (m[1] !== undefined) cmd.kv[m[1]] = m[3] ?? m[2];
      else if (m[4] !== undefined) cmd.text ??= m[4];
      else if (!cmd.op) cmd.op = m[5];
      else cmd.args.push(m[5]);
    }
    if (!cmd.op) errors.push({ line: i + 1, msg: "line has no command" });
    else cmds.push(cmd);
  });
  const head = cmds.shift();
  if (!head) return { errors: [{ line: 1, msg: "empty diagram" }, ...errors] };
  return { doc: { kind: head.op, head, cmds }, errors };
}

// Models copy the cheat sheet's "optional" marks: "[w=1 h=1]" or "(flip)".
// Strip a wrapping bracket/paren from a token, but never touch x=t[s] or cos(8*t).
const OPT = /^[[(]?([A-Za-z]\w*(?:=[^\s()[\]]*)?)[\])]?$/;
function unwrap(m: RegExpMatchArray): RegExpMatchArray {
  const tok = m[0];
  if (m[4] !== undefined || !/^[[(]|[\])]$/.test(tok) || /^\w+=\w*[[(]/.test(tok)) return m;
  const inner = tok.match(OPT)?.[1];
  if (!inner || inner === tok) return m;
  return [...inner.matchAll(TOKEN)][0];
}

function stripComment(s: string): string {
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') inQ = !inQ;
    else if (s[i] === "#" && !inQ) return s.slice(0, i);
  }
  return s;
}

// ---- small value helpers shared by the renderers ----

export function num(s: string | undefined, line: number, errs: DgError[], what = "number"): number {
  const n = Number(s);
  if (s === undefined || s === "" || !Number.isFinite(n)) {
    errs.push({ line, msg: `expected ${what}, got ${s === undefined ? "nothing" : `"${s}"`}` });
    return 0;
  }
  return n;
}

/** "a..b" -> [a, b] */
export function range(s: string | undefined, line: number, errs: DgError[]): [number, number] {
  const m = s?.match(/^(-?[\d.]+)\.\.(-?[\d.]+)$/);
  if (!m) {
    errs.push({ line, msg: `expected range like 0..10, got "${s ?? ""}"` });
    return [0, 1];
  }
  return [Number(m[1]), Number(m[2])];
}

/** "x,y" -> [x, y] */
export function pair(s: string | undefined, line: number, errs: DgError[]): [number, number] {
  const m = s?.match(/^(-?[\d.]+(?:e-?\d+)?),(-?[\d.]+(?:e-?\d+)?)$/);
  if (!m) {
    errs.push({ line, msg: `expected point like 2,3, got "${s ?? ""}"` });
    return [0, 0];
  }
  return [Number(m[1]), Number(m[2])];
}

/** Direction words are cheaper to read than angles and harder to get wrong. */
const DIRS: Record<string, number> = {
  right: 0,
  up: 90,
  left: 180,
  down: 270,
  r: 0,
  u: 90,
  l: 180,
  d: 270,
};
export function angle(s: string | undefined, line: number, errs: DgError[]): number {
  if (s !== undefined && s in DIRS) return DIRS[s];
  return num(s, line, errs, "angle in degrees or up/down/left/right");
}
