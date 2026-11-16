// RT-17 (C-009, G-007): no route handler may build a response body from a caught error. Details are logged
// server-side and the body carries generic text (see src/lib/api-errors.ts `errorResponse`).
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const API_ROOT = join(__dirname, '..', 'src', 'app', 'api');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === 'route.ts' ? [full] : [];
  });
}

/** Source text of every `X.json(...)` call, found by balancing parentheses. */
function jsonCalls(source: string): string[] {
  const calls: string[] = [];
  const start = /\b(?:NextResponse|Response)\.json\(/g;
  for (let m = start.exec(source); m; m = start.exec(source)) {
    let depth = 1;
    let i = start.lastIndex;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') depth--;
    }
    calls.push(source.slice(m.index, i));
  }
  return calls;
}

function caughtNames(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/catch\s*\(\s*(\w+)/g)) names.add(m[1]);
  return [...names];
}

/** Reasons a response body is built from an error or an upstream payload. */
function leaks(source: string): string[] {
  const found: string[] = [];
  const names = caughtNames(source);
  for (const call of jsonCalls(source)) {
    for (const name of names) {
      if (new RegExp(`\\b${name}\\s*\\??\\.\\s*(message|stack|body|rawText|cause|name)\\b`).test(call)) found.push(`${name}.<property> in ${call.slice(0, 80)}`);
      if (new RegExp(`String\\(\\s*${name}\\b`).test(call)) found.push(`String(${name}) in ${call.slice(0, 80)}`);
      if (new RegExp(`\\$\\{\\s*${name}\\b`).test(call)) found.push(`\${${name}} in ${call.slice(0, 80)}`);
    }
    if (/\.stack\b/.test(call)) found.push(`.stack in ${call.slice(0, 80)}`);
    if (/\bdetails\s*:/.test(call)) found.push(`details: key in ${call.slice(0, 80)}`);
  }
  return found;
}

describe('route handlers do not return caught error text', () => {
  const files = routeFiles(API_ROOT);

  it('finds the route handlers', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  test.each(files.map(f => [f.slice(API_ROOT.length + 1), f]))('%s', (_rel, file) => {
    expect(leaks(readFileSync(file, 'utf8'))).toEqual([]);
  });
});

describe('the detector itself', () => {
  it('flags the patterns that leaked before RT-17', () => {
    const samples = [
      `try {} catch (error: any) { return NextResponse.json({ error: error.message }, { status: 500 }); }`,
      `try {} catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'x' }); }`,
      `try {} catch (err) { return NextResponse.json({ error: 'x', stack: err?.stack }); }`,
      `try {} catch (polarError) { return NextResponse.json({ details: polarError.body }); }`,
      `try {} catch (e) { return Response.json({ error: String(e) }); }`,
      `try {} catch (e) { return NextResponse.json({ error: \`failed: \${e}\` }); }`,
      `return Response.json({ error: 'upstream', details: text }, { status: 502 });`,
    ];
    for (const sample of samples) expect(leaks(sample)).not.toEqual([]);
  });

  it('accepts generic bodies', () => {
    expect(leaks(`try {} catch (error) { return errorResponse(error, 'x'); }`)).toEqual([]);
    expect(leaks(`try {} catch (e) { console.error(e.message); return NextResponse.json({ error: 'Internal server error' }, { status: 500 }); }`)).toEqual([]);
  });
});
