const { parseArgs: parseBackfillArgs, planClaims, describePlan: describeBackfill } = jest.requireActual('../tools/backfill-claims.cjs') as {
  parseArgs: (argv: string[]) => { project: string; apply: boolean; limit: number | null };
  planClaims: (existing: Record<string, unknown> | undefined, profile: Record<string, unknown> | undefined) => Record<string, unknown> | null;
  describePlan: (args: { project: string; apply: boolean; limit: number | null }, emulatorHost?: string) => string;
};

test('refuses to run without an explicit project id', () => {
  expect(() => parseBackfillArgs([])).toThrow(/--project/);
  expect(() => parseBackfillArgs(['--project', '--apply'])).toThrow(/--project/);
});
test('defaults to a dry run', () => {
  expect(parseBackfillArgs(['--project', 'demo-x'])).toEqual({ project: 'demo-x', apply: false, limit: null });
});
test('rejects unknown arguments and a bad limit', () => {
  expect(() => parseBackfillArgs(['--project', 'p', '--force'])).toThrow(/Unknown argument/);
  expect(() => parseBackfillArgs(['--project', 'p', '--limit', '0'])).toThrow(/--limit/);
});
test('plan names the target and says dry run until --apply', () => {
  expect(describeBackfill(parseBackfillArgs(['--project', 'demo-x']))).toContain('DRY RUN');
  expect(describeBackfill(parseBackfillArgs(['--project', 'demo-x']))).toContain('LIVE Firebase project "demo-x"');
  expect(describeBackfill(parseBackfillArgs(['--project', 'demo-x', '--apply']))).toContain('APPLY');
});
test('sets role and organizationId and preserves unrelated claims such as admin', () => {
  expect(planClaims({ admin: true }, { role: 'teacher', organizationId: 'org1' })).toEqual({ admin: true, role: 'teacher', organizationId: 'org1' });
});
test('returns null when claims already match', () => {
  expect(planClaims({ role: 'student' }, { role: 'student' })).toBeNull();
});
test('removes a stale organizationId and ignores unknown roles', () => {
  expect(planClaims({ role: 'student', organizationId: 'old' }, { role: 'student' })).toEqual({ role: 'student' });
  expect(planClaims(undefined, { role: 'superuser' })).toBeNull();
});

export {};
