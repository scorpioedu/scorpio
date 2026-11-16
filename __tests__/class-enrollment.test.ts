/**
 * RT-19 / E-007: findClassByCode resolves a join code to a class, its teacher and the teacher's organization.
 * Enrollment trusts this result, so every rejection path must return null (never a partial class).
 */
type Doc = Record<string, unknown>;
let courses: Array<{ id: string; data: Doc }>;
let users: Record<string, Doc | undefined>;
let queriedCodes: string[];
let userReads: string[];

function makeQuery(code: string) {
  queriedCodes.push(code);
  return { _code: code };
}
const runQuery = async (q: { _code: string }) => ({
  docs: courses.filter(c => c.data.code === q._code).slice(0, 1).map(c => ({ id: c.id, data: () => c.data })),
});

jest.mock('../src/lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => name === 'courses'
      ? { where: (_f: string, _op: string, value: string) => ({ limit: () => ({ ...makeQuery(value), get: () => runQuery({ _code: value }) }) }) }
      : { doc: (id: string) => ({ _id: id, get: async () => { userReads.push(id); return { data: () => users[id] }; } }) },
  },
}));

import { findClassByCode } from '../src/lib/class-enrollment';

beforeEach(() => {
  queriedCodes = []; userReads = [];
  courses = [{ id: 'c1', data: { code: 'PHYS101', name: 'Physics', teacherId: 't1' } }];
  users = { t1: { role: 'teacher', organizationId: 'org1' } };
});

describe('findClassByCode', () => {
  test('resolves a valid code to the class, teacher and organization', async () => {
    expect(await findClassByCode('PHYS101')).toEqual({ courseId: 'c1', name: 'Physics', teacherId: 't1', organizationId: 'org1' });
  });

  test('surrounding whitespace is trimmed', async () => {
    expect((await findClassByCode('  PHYS101\n'))?.courseId).toBe('c1');
    expect(queriedCodes).toEqual(['PHYS101']);
  });

  test('exact match is tried first, then the upper-cased code', async () => {
    expect((await findClassByCode('phys101'))?.courseId).toBe('c1');
    expect(queriedCodes).toEqual(['phys101', 'PHYS101']);
  });

  test('an exact match does not trigger the second query', async () => {
    await findClassByCode('PHYS101');
    expect(queriedCodes).toEqual(['PHYS101']);
  });

  test('an already upper-case unknown code is queried once', async () => {
    expect(await findClassByCode('NOPE')).toBeNull();
    expect(queriedCodes).toEqual(['NOPE']);
  });

  test('unknown code -> null and no teacher lookup', async () => {
    expect(await findClassByCode('zzz')).toBeNull();
    expect(userReads).toEqual([]);
  });

  test.each([
    ['undefined', undefined], ['a number', 123], ['an object', {}], ['an empty string', ''], ['whitespace', '   '],
    ['a code with a slash', 'a/b'], ['a code over 128 characters', 'A'.repeat(129)],
  ])('%s -> null without querying', async (_name, code) => {
    expect(await findClassByCode(code)).toBeNull();
    expect(queriedCodes).toEqual([]);
  });

  test('a code of exactly 128 characters is queried', async () => {
    await findClassByCode('A'.repeat(128));
    expect(queriedCodes).toEqual(['A'.repeat(128)]);
  });

  test('the length limit applies to the raw input, before trimming', async () => {
    expect(await findClassByCode(` ${'A'.repeat(128)}`)).toBeNull();
    expect(queriedCodes).toEqual([]);
  });

  describe('teacher validation', () => {
    test.each([
      ['a missing teacherId', { code: 'PHYS101' }],
      ['an empty teacherId', { code: 'PHYS101', teacherId: '' }],
      ['a non-string teacherId', { code: 'PHYS101', teacherId: 5 }],
      ['a teacherId with a slash', { code: 'PHYS101', teacherId: 'a/b' }],
    ])('course with %s -> null and no user read', async (_name, data) => {
      courses = [{ id: 'c1', data }];
      expect(await findClassByCode('PHYS101')).toBeNull();
      expect(userReads).toEqual([]);
    });

    test('teacher document missing -> null', async () => {
      users.t1 = undefined;
      expect(await findClassByCode('PHYS101')).toBeNull();
    });

    test('owner is not a teacher -> null', async () => {
      users.t1 = { role: 'student', organizationId: 'org1' };
      expect(await findClassByCode('PHYS101')).toBeNull();
    });

    test.each([['missing', undefined], ['empty', ''], ['not a string', 7]])('teacher organization %s -> null', async (_name, organizationId) => {
      users.t1 = { role: 'teacher', organizationId };
      expect(await findClassByCode('PHYS101')).toBeNull();
    });
  });

  test('a class without a string name falls back to "Class"', async () => {
    courses = [{ id: 'c1', data: { code: 'PHYS101', teacherId: 't1' } }];
    expect((await findClassByCode('PHYS101'))?.name).toBe('Class');
    courses = [{ id: 'c1', data: { code: 'PHYS101', teacherId: 't1', name: 42 } }];
    expect((await findClassByCode('PHYS101'))?.name).toBe('Class');
  });

  test('with a transaction, both the class query and the teacher read go through it', async () => {
    const calls: string[] = [];
    const tx = {
      get: async (target: { _code?: string; _id?: string }) => {
        if (target._code !== undefined) { calls.push(`query:${target._code}`); return runQuery(target as { _code: string }); }
        calls.push(`doc:${target._id}`);
        return { data: () => users[target._id as string] };
      },
    };
    const result = await findClassByCode('PHYS101', tx as never);
    expect(result).toEqual({ courseId: 'c1', name: 'Physics', teacherId: 't1', organizationId: 'org1' });
    expect(calls).toEqual(['query:PHYS101', 'doc:t1']);
    expect(userReads).toEqual([]);
  });
});
