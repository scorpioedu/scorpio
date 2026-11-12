// RT-17 / K-005: Cloud Functions log through firebase-functions/logger (structured, severity-aware), not console.*.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', 'functions', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('functions/src logging', () => {
  test.each(sourceFiles(SRC).map(f => [f.slice(SRC.length + 1), f]))('%s has no console.* calls', (_rel, file) => {
    const code = readFileSync(file, 'utf8').split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/\bconsole\.(log|info|warn|error|debug)\(/);
  });
});
