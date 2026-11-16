export {};
// Extra branch coverage for the pure helpers of tools/backfill-claims.cjs and tools/set-admin-claim.cjs.
// (main() of both scripts only runs under `require.main === module` and uses a dynamic import(), neither of
// which works inside Jest's CommonJS sandbox, so it is exercised by the scripts' dry-run, not here.)
const backfill = jest.requireActual('../tools/backfill-claims.cjs') as {
  parseArgs: (argv: string[]) => { project: string; apply: boolean; limit: number | null };
  planClaims: (existing: Record<string, unknown> | undefined | null, profile: Record<string, unknown> | undefined | null) => Record<string, unknown> | null;
  describePlan: (args: { project: string; apply: boolean; limit: number | null }, emulatorHost?: string) => string;
};
const setAdmin = jest.requireActual('../tools/set-admin-claim.cjs') as {
  parseArgs: (argv: string[]) => { project: string; uids: string[]; apply: boolean; revoke: boolean };
  describePlan: (args: { project: string; uids: string[]; apply: boolean; revoke: boolean }, emulatorHost?: string) => string;
};

describe('backfill-claims parseArgs', () => {
  it('parses --apply and a numeric --limit', () => {
    expect(backfill.parseArgs(['--project', 'p', '--apply', '--limit', '50'])).toEqual({ project: 'p', apply: true, limit: 50 });
  });
  it('rejects a --limit with no value, a non-integer and a negative value', () => {
    expect(() => backfill.parseArgs(['--project', 'p', '--limit'])).toThrow(/positive integer/);
    expect(() => backfill.parseArgs(['--project', 'p', '--limit', '2.5'])).toThrow(/positive integer/);
    expect(() => backfill.parseArgs(['--project', 'p', '--limit', '-3'])).toThrow(/positive integer/);
  });
  it('does not swallow a following flag as the --limit value', () => {
    expect(() => backfill.parseArgs(['--project', 'p', '--limit', '--apply'])).toThrow(/positive integer/);
  });
});

describe('backfill-claims describePlan', () => {
  it('names the emulator and the user limit when both are given', () => {
    const plan = backfill.describePlan({ project: 'demo-x', apply: false, limit: 25 }, 'localhost:9099');
    expect(plan).toContain('Auth EMULATOR at localhost:9099');
    expect(plan).not.toContain('LIVE Firebase project');
    expect(plan).toContain('(first 25 users)');
  });
  it('omits the limit text when no limit is set', () => {
    expect(backfill.describePlan({ project: 'demo-x', apply: true, limit: null })).not.toContain('first');
  });
});

describe('backfill-claims planClaims', () => {
  it('treats missing existing claims and a missing profile as nothing to change', () => {
    expect(backfill.planClaims(undefined, undefined)).toBeNull();
    expect(backfill.planClaims(null, null)).toBeNull();
  });
  it('drops stale managed claims when the profile is gone but keeps unrelated ones', () => {
    expect(backfill.planClaims({ admin: true, role: 'teacher', organizationId: 'o' }, undefined)).toEqual({ admin: true });
  });
  it('ignores an empty or non-string organizationId', () => {
    expect(backfill.planClaims(undefined, { role: 'teacher', organizationId: '' })).toEqual({ role: 'teacher' });
    expect(backfill.planClaims(undefined, { role: 'teacher', organizationId: 42 })).toEqual({ role: 'teacher' });
  });
  it('adds only an organizationId when the role is not teacher or student', () => {
    expect(backfill.planClaims({}, { role: 'admin', organizationId: 'org9' })).toEqual({ organizationId: 'org9' });
  });
});

describe('set-admin-claim parseArgs', () => {
  it('parses --revoke and --apply', () => {
    expect(setAdmin.parseArgs(['--project', 'p', '--uid', 'u1', '--revoke', '--apply'])).toEqual({ project: 'p', uids: ['u1'], apply: true, revoke: true });
  });
  it('treats a --uid with no value as no uid', () => {
    expect(() => setAdmin.parseArgs(['--project', 'p', '--uid'])).toThrow(/--uid/);
    expect(() => setAdmin.parseArgs(['--project', 'p', '--uid', '--apply'])).toThrow(/--uid/);
  });
  it('drops blank entries in a comma separated uid list', () => {
    expect(setAdmin.parseArgs(['--project', 'p', '--uid', 'a,, ,b']).uids).toEqual(['a', 'b']);
  });
});

describe('set-admin-claim describePlan', () => {
  const base = { project: 'demo-x', uids: ['a', 'b'], apply: true, revoke: false };
  it('describes a grant', () => {
    const plan = setAdmin.describePlan(base);
    expect(plan).toContain('SET custom claim admin=true on 2 user(s)');
    expect(plan).toContain('APPLY');
  });
  it('describes a revoke', () => {
    const plan = setAdmin.describePlan({ ...base, revoke: true, apply: false });
    expect(plan).toContain('REMOVE custom claim admin=(removed) on 2 user(s)');
    expect(plan).toContain('DRY RUN');
  });
});
