import { readdirSync, readFileSync } from "fs";
import { join } from "path";

// RT-32 / M-011: every size="icon" Button must have an accessible name
// (aria-label, aria-labelledby, title, sr-only text or visible text).

function collectTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectTsx(full, out);
    else if (entry.name.endsWith(".tsx") && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

/** Returns the end index of the opening tag that starts at `start`, honouring {} and quotes. */
function openingTagEnd(source: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0 && source[i - 1] !== "=") return i;
  }
  return -1;
}

function unlabeledIconButtons(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const found: string[] = [];
  const re = /<Button\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const end = openingTagEnd(source, match.index + match[0].length);
    if (end < 0) continue;
    const open = source.slice(match.index, end + 1);
    if (open.endsWith("/>") || !/size="icon/.test(open)) continue;
    const close = source.indexOf("</Button>", end);
    const body = source.slice(end + 1, close);
    const named = /aria-label|aria-labelledby|sr-only|title=/.test(open + body);
    const visibleText = body.replace(/<[^>]+>/g, "").replace(/\{[^}]*\}/g, "").trim().length > 0;
    if (!named && !visibleText) {
      found.push(`${file}:${source.slice(0, match.index).split("\n").length}`);
    }
  }
  return found;
}

describe("icon-only buttons", () => {
  it("all size=\"icon\" Buttons in src have an accessible name", () => {
    const offenders = collectTsx(join(__dirname, "..")).flatMap(unlabeledIconButtons);
    expect(offenders).toEqual([]);
  });
});
