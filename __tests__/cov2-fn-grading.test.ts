// Remaining branches of functions/src/grading.ts: missing profile/org/assignment data, roster-name fallbacks,
// non-Error failures, partial organization budget fields and trigger events with no payload.
// Same in-memory fakes as cov-functions-grading.test.ts; Gemini and Firestore are never contacted.
// stuck-submission sweep, with firebase-admin, Gemini and Firestore replaced by in-memory fakes.
const mockGenerate = jest.fn();
const mockState: { db?: unknown } = {};
jest.mock(require.resolve('../functions/node_modules/firebase-admin'), () => {
  const firestore = Object.assign(() => mockState.db, { FieldValue: { serverTimestamp: () => 'SERVER_TS' } });
  return { firestore, initializeApp: jest.fn() };
});
jest.mock(require.resolve('../functions/node_modules/firebase-functions/lib/logger/index.js'), () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
// Resolve like functions/src/grading.ts does (bare specifier, honours the package's "exports"), or the mock is missed.
jest.mock(require.resolve('@google/genai', { paths: [`${__dirname}/../functions`] }), () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({ models: { generateContent: (...a: unknown[]) => mockGenerate(...a) } })),
}));

import * as logger from '../functions/node_modules/firebase-functions/lib/logger/index.js';
import { onSubmissionCreated, onSubmissionUpdated } from '../functions/src/grading';

type Doc = Record<string, unknown>;

/** Dates read back carry toMillis() like Firestore Timestamps do. */
const shim = (v: unknown): unknown => {
  if (v instanceof Date) return Object.assign(new Date(v.getTime()), { toMillis: () => v.getTime() });
  return v;
};
const present = (d: Doc | undefined): Doc | undefined => (d ? Object.fromEntries(Object.entries(d).map(([k, v]) => [k, shim(v)])) : undefined);
const raw = (v: unknown) => (v instanceof Date ? v.getTime() : v);

class FakeDb {
  store = new Map<string, Doc>();
  failQueries: unknown = false;
  ghost = new Set<string>();
  failGet = new Set<string>();
  txCount = 0;
  seed(path: string, data: Doc) { this.store.set(path, data); }
  private snap(path: string) {
    const id = path.split('/')[1];
    const data = this.store.get(path);
    return { id, exists: data !== undefined || this.ghost.has(path), data: () => present(data), ref: this.docRef(path) };
  }
  docRef(path: string) {
    return {
      path,
      id: path.split('/')[1],
      get: async () => {
        if (this.failGet.has(path)) throw new Error(`read failed ${path}`);
        return this.snap(path);
      },
      update: async (u: Doc) => { this.store.set(path, { ...this.store.get(path), ...u }); },
      delete: async () => { this.store.delete(path); },
    };
  }
  collection(name: string) {
    const build = (filters: Array<[string, string, unknown]>, order: string | undefined, lim: number, after: string | undefined) => ({
      where: (f: string, op: string, v: unknown) => build([...filters, [f, op, v]], order, lim, after),
      orderBy: (f: string) => build(filters, f, lim, after),
      limit: (n: number) => build(filters, order, n, after),
      startAfter: (d: { id: string }) => build(filters, order, lim, d.id),
      get: async () => {
        if (this.failQueries) throw this.failQueries === true ? new Error('query failed') : this.failQueries;
        let entries = [...this.store.entries()].filter(([p]) => p.startsWith(`${name}/`));
        entries = entries.filter(([, d]) => filters.every(([f, op, v]) => (op === '==' ? raw(d[f]) === raw(v) : (raw(d[f]) as number) < (raw(v) as number))));
        if (order) entries.sort((a, b) => (raw(a[1][order]) as number) - (raw(b[1][order]) as number));
        if (after) entries = entries.slice(entries.findIndex(([p]) => p === `${name}/${after}`) + 1);
        entries = entries.slice(0, lim);
        const docs = entries.map(([p]) => this.snap(p));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    });
    return { doc: (id: string) => this.docRef(`${name}/${id}`), ...build([], undefined, Infinity, undefined) };
  }
  async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    this.txCount++;
    const writes: Array<() => void> = [];
    const tx = {
      get: async (ref: { get: () => Promise<unknown> }) => ref.get(),
      update: (ref: { path: string }, u: Doc) => writes.push(() => {
        if (!this.store.has(ref.path)) throw new Error(`update of missing ${ref.path}`);
        this.store.set(ref.path, { ...this.store.get(ref.path), ...u });
      }),
      set: (ref: { path: string }, d: Doc) => writes.push(() => { this.store.set(ref.path, d); }),
      create: (ref: { path: string }, d: Doc) => writes.push(() => {
        if (this.store.has(ref.path)) throw new Error(`already exists ${ref.path}`);
        this.store.set(ref.path, d);
      }),
      delete: (ref: { path: string }) => writes.push(() => { this.store.delete(ref.path); }),
    };
    const result = await fn(tx);
    writes.forEach(w => w());
    return result;
  }
}


type Runnable = { run: (event: unknown) => Promise<unknown> };
const run = (fn: unknown, event: unknown) => (fn as Runnable).run(event);

const modelReply = (score: number, extra: Record<string, unknown> = {}) => ({
  text: JSON.stringify({ score, student_feedback: `fb${score}`, technical_reasoning: `why${score}`, ...extra }),
  usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 50 },
});

let db: FakeDb;

const seedBase = (opts: { questions?: Doc[]; assignment?: Doc; student?: Doc; org?: Doc; key?: Doc; answers?: Doc[] } = {}) => {
  db.seed('users/stu', { role: 'student', organizationId: 'org1', teacherId: 't1', displayName: 'Zed Quux', ...opts.student });
  db.seed('users/peer', { role: 'student', teacherId: 't1', name: 'Peggy Sue' });
  db.seed('organizations/org1', { subscriptionStatus: 'active', aiBudgetLimit: 100, aiUsageCurrent: 0, aiUsageReserved: 0, ...opts.org });
  db.seed('assignments/a1', { gradingType: 'ai', questions: opts.questions ?? [], ...opts.assignment });
  if (opts.key) db.seed('assignment_keys/a1', opts.key);
  db.seed('submissions/s1', { status: 'submitted', graded: false, assignmentId: 'a1', studentId: 'stu', answers: opts.answers ?? [] });
};

const grade = () => run(onSubmissionCreated, { params: { submissionId: 's1' }, data: { data: () => db.store.get('submissions/s1') } });
const sub = () => db.store.get('submissions/s1') as Doc;
const answersOf = () => sub().answers as Doc[];

beforeEach(() => {
  db = new FakeDb();
  mockState.db = db;
  mockGenerate.mockReset();
  (logger.error as jest.Mock).mockClear();
});

const mc = { id: 'q1', text: 'pick', type: 'multiple-choice', correctAnswer: 'A' };
const mcAnswers = [{ questionId: 'q1', answer: 'A' }];
const promptSent = () => mockGenerate.mock.calls[0][0].contents[0].parts[0].text as string;

describe('organization resolution', () => {
  test('a missing student profile ends grading without touching the submission', async () => {
    seedBase();
    db.store.delete('users/stu');
    await grade();
    expect(sub()).toMatchObject({ status: 'submitted', graded: false });
    expect(logger.error).toHaveBeenCalledWith('No organization found for grading budget', { submissionId: 's1' });
  });

  test('a student whose teacher profile is missing has no organization and is left alone', async () => {
    seedBase({ student: { organizationId: undefined, teacherId: 'ghost-teacher' } });
    await grade();
    expect(sub()).toMatchObject({ status: 'submitted', graded: false });
    expect(logger.error).toHaveBeenCalledWith('No organization found for grading budget', { submissionId: 's1' });
  });

  test('a student with neither an organization nor a teacher is left alone', async () => {
    seedBase({ student: { organizationId: undefined, teacherId: undefined } });
    await grade();
    expect(sub()).toMatchObject({ status: 'submitted', graded: false });
  });

  test('only students inherit the teacher organization', async () => {
    seedBase({ student: { role: 'teacher', organizationId: undefined, teacherId: 't1' } });
    db.seed('users/t1', { role: 'teacher', organizationId: 'org1' });
    await grade();
    expect(sub()).toMatchObject({ status: 'submitted', graded: false });
  });
});

describe('roster name resolution', () => {
  test('a classmate or the student stored under "name" is masked, and a roster entry with no name is ignored', async () => {
    seedBase({
      student: { displayName: undefined, name: 'Quinn Zeta' },
      questions: [{ id: 'q1', text: 'Describe a trip', type: 'text' }],
      answers: [{ questionId: 'q1', answer: 'Quinn Zeta and Peggy Sue travelled' }],
    });
    db.seed('users/nameless', { role: 'student', teacherId: 't1' });
    mockGenerate.mockResolvedValue(modelReply(6));
    await grade();
    expect(promptSent()).not.toMatch(/Quinn|Zeta|Peggy/);
    expect(sub()).toMatchObject({ graded: true });
  });

  test('a student with no name at all is graded without adding a name to the roster', async () => {
    seedBase({ student: { displayName: undefined, name: undefined }, questions: [mc], answers: mcAnswers });
    await grade();
    expect(sub()).toMatchObject({ graded: true, score: 100 });
  });

  test('a non-Error failure while reading the roster is logged and grading continues', async () => {
    seedBase({ questions: [mc], answers: mcAnswers });
    db.failQueries = 'roster offline';
    await grade();
    expect(logger.error).toHaveBeenCalledWith('Error resolving student names', { submissionId: 's1', error: 'roster offline' });
    expect(sub()).toMatchObject({ graded: true, score: 100 });
  });
});

describe('assignment and organization documents', () => {
  test('an assignment document that exists but has no data is skipped', async () => {
    seedBase();
    db.store.delete('assignments/a1');
    db.ghost.add('assignments/a1');
    await grade();
    expect(sub()).toMatchObject({ status: 'submitted', graded: false });
  });

  test('an organization with no budget limit is treated as having no budget', async () => {
    seedBase({ org: { aiBudgetLimit: undefined }, questions: [mc], answers: mcAnswers });
    await grade();
    expect(sub()).toMatchObject({ status: 'pending_review', gradingError: 'AI budget unavailable', graded: false });
  });

  test('a trialing organization with a limit and no usage recorded yet may be graded', async () => {
    seedBase({ org: { subscriptionStatus: 'trialing', aiBudgetLimit: 50, aiUsageCurrent: undefined }, questions: [mc], answers: mcAnswers });
    await grade();
    expect(sub()).toMatchObject({ graded: true, status: 'graded', score: 100 });
  });

  test('an assignment with no questions field grades to zero with the answers carried through', async () => {
    seedBase({ answers: [{ questionId: 'q1', answer: 'orphan' }] });
    delete (db.store.get('assignments/a1') as Doc).questions;
    await grade();
    expect(sub()).toMatchObject({ graded: true, score: 0, totalPoints: 0, answers: [{ questionId: 'q1', answer: 'orphan' }] });
  });

  test('an answer key without an answers map leaves the question correct answer in force', async () => {
    seedBase({ questions: [mc], key: { rubric: 'unused for multiple choice' }, answers: mcAnswers });
    await grade();
    expect(answersOf()[0]).toMatchObject({ score: 10, feedback: 'Correct!' });
  });
});

describe('model failures', () => {
  test('a non-Error rejection from the model is logged as a string and routes to review', async () => {
    seedBase({
      questions: [{ id: 'q1', text: 'Explain why the sky appears blue during the day', type: 'text' }],
      answers: [{ questionId: 'q1', answer: 'Rayleigh scattering' }],
    });
    mockGenerate.mockRejectedValue('quota exceeded');
    await grade();
    expect(logger.error).toHaveBeenCalledWith('Error in gradeResponseAI', { error: 'quota exceeded' });
    expect(sub()).toMatchObject({ status: 'pending_review', graded: false, gradingError: 'AI grading unavailable; teacher review required' });
  });

  test('a reply missing token counts is settled as zero usage and grading still completes', async () => {
    seedBase({
      questions: [{ id: 'q1', text: 'Explain why the sky appears blue during the day', type: 'text' }],
      answers: [{ questionId: 'q1', answer: 'Rayleigh scattering' }],
    });
    mockGenerate.mockResolvedValue({ text: modelReply(8).text, usageMetadata: {} });
    await grade();
    expect(sub()).toMatchObject({ graded: true, score: 80 });
    const org = db.store.get('organizations/org1') as Doc;
    expect(org.aiUsageCurrent).toBe(0);
    expect(org.aiUsageReserved).toBe(0);
  });
});

describe('trigger events without a payload', () => {
  test('onSubmissionCreated ignores an event with no document snapshot', async () => {
    seedBase({ questions: [mc], answers: mcAnswers });
    await run(onSubmissionCreated, { params: { submissionId: 's1' }, data: undefined });
    expect(sub()).toMatchObject({ status: 'submitted', graded: false });
  });

  test('onSubmissionUpdated ignores an event with no snapshots', async () => {
    seedBase({ questions: [mc], answers: mcAnswers });
    await run(onSubmissionUpdated, { params: { submissionId: 's1' }, data: undefined });
    expect(sub()).toMatchObject({ status: 'submitted', graded: false });
  });

  test('onSubmissionUpdated grades a submission that had no previous state', async () => {
    seedBase({ questions: [mc], answers: mcAnswers });
    await run(onSubmissionUpdated, {
      params: { submissionId: 's1' },
      data: { before: { data: () => undefined }, after: { data: () => ({ status: 'submitted', graded: false }) } },
    });
    expect(sub()).toMatchObject({ graded: true, score: 100 });
  });
});
