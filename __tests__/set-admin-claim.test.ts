const { parseArgs, describePlan } = jest.requireActual('../tools/set-admin-claim.cjs') as {
  parseArgs: (argv: string[]) => { project: string; uids: string[]; apply: boolean; revoke: boolean };
  describePlan: (args: { project: string; uids: string[]; apply: boolean; revoke: boolean }, emulatorHost?: string) => string;
};

test('refuses to run without an explicit project id', () => {
  expect(() => parseArgs(['--uid', 'u1'])).toThrow(/--project/);
  expect(() => parseArgs(['--project', '--uid', 'u1'])).toThrow(/--project/);
});
test('refuses to run without a uid', () => {
  expect(() => parseArgs(['--project', 'demo-x'])).toThrow(/--uid/);
});
test('rejects unknown arguments', () => {
  expect(() => parseArgs(['--project', 'p', '--uid', 'u', '--force'])).toThrow(/Unknown argument/);
});
test('defaults to a dry run and splits comma separated uids', () => {
  const args = parseArgs(['--project', 'demo-x', '--uid', 'a, b', '--uid', 'c']);
  expect(args).toEqual({ project: 'demo-x', uids: ['a', 'b', 'c'], apply: false, revoke: false });
});
test('plan names the project, the users and the mode before anything is written', () => {
  const plan = describePlan(parseArgs(['--project', 'demo-x', '--uid', 'a']));
  expect(plan).toContain('LIVE Firebase project "demo-x"');
  expect(plan).toContain('- a');
  expect(plan).toContain('DRY RUN');
});
test('plan says EMULATOR when the emulator host is set', () => {
  expect(describePlan(parseArgs(['--project', 'demo-x', '--uid', 'a', '--apply']), '127.0.0.1:19099')).toContain('Auth EMULATOR');
});
