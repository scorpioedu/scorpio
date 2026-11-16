/**
 * RT-10: teacher-authored assignment text (generate / parse / rubric) only loses emails and supplied
 * names; student-authored paths (tutor, grading, portfolio, notebook) keep the full scrub.
 */
jest.mock('../src/lib/firebase-admin', () => ({ adminDb: {} }));
jest.mock('../functions/src/metering', () => ({
  reserveBudget: jest.fn(),
  settleBudget: jest.fn(),
  estimateMaximumCost: jest.fn(() => 0),
}));
import { billingContext, withScrubNames } from '../src/lib/billing-context';
import { explainPhysicsConcept, helpSolveProblem } from '../src/lib/ai/tutor';
import { gradeResponse, synthesizeRubric } from '../src/lib/ai/grading';
import { generateStudentPortfolio } from '../src/lib/ai/network';
import { getNotebookAssistantResponse } from '../src/lib/ai/notebook';
import { generateAssignmentQuestions, parseQuestionsFromText } from '../src/lib/ai/assignment';

const EMAIL = 'zed.quill@school.edu';
const ACADEMIC = 'pi = 3.14159265358979, due 2024-01-15, balance H2SO4 + 2NaOH -> Na2SO4 + 2H2O, list 300 200 1000 N, 01/15/2024';
const WITH_EMAIL = `${ACADEMIC} contact ${EMAIL}`;

const okBody = { candidates: [{ content: { parts: [{ text: '{"score":5,"questions":[]}' }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } };
let bodies: string[] = [];
beforeAll(() => { process.env.GEMINI_API_KEY = 'test-key-not-real'; });
beforeEach(() => {
  bodies = [];
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(global, 'fetch').mockImplementation((async (_u: unknown, init: { body: string }) => {
    bodies.push(init.body);
    return { ok: true, status: 200, json: async () => okBody } as unknown as Response;
  }) as typeof fetch);
});
afterEach(() => jest.restoreAllMocks());

const run = async (fn: () => Promise<unknown>, names: string[] = []) => {
  await billingContext.run({ type: 'research', organizationId: '' }, () => withScrubNames(names, fn)).catch(() => undefined);
};
const text = () => bodies.join('\n');

const expectAcademicIntact = () => {
  expect(text()).toContain('3.14159265358979');
  expect(text()).toContain('2024-01-15');
  expect(text()).toContain('H2SO4 + 2NaOH -> Na2SO4 + 2H2O');
  expect(text()).toContain('300 200 1000 N');
  expect(text()).toContain('01/15/2024');
  expect(text()).not.toContain(EMAIL);
  expect(text()).toContain('[EMAIL]');
};

describe('teacher-authored paths: contact scrub only', () => {
  test('generateAssignmentQuestions', async () => {
    await run(() => generateAssignmentQuestions(WITH_EMAIL, 2, 'easy', 'mixed', WITH_EMAIL));
    expectAcademicIntact();
  });
  test('parseQuestionsFromText', async () => {
    await run(() => parseQuestionsFromText(`1. ${WITH_EMAIL} What is asked here exactly?\n2. ${ACADEMIC} A second long question?`));
    expectAcademicIntact();
  });
  test('synthesizeRubric', async () => {
    await run(() => synthesizeRubric(WITH_EMAIL, ACADEMIC));
    expectAcademicIntact();
  });
  test('supplied roster names are still masked', async () => {
    await run(() => synthesizeRubric(`Zed Quill ${WITH_EMAIL}`, 'x'), ['Zed Quill']);
    expect(text()).not.toContain('Zed');
    expect(text()).toContain('3.14159265358979');
  });
});

describe('student-authored paths: full scrub', () => {
  test.each([
    ['tutor.explainPhysicsConcept', () => explainPhysicsConcept(ACADEMIC, [], 'FULL')],
    ['tutor.helpSolveProblem', () => helpSolveProblem(ACADEMIC, [], 'STRICT_CONCISE', ACADEMIC)],
    ['grading.gradeResponse', () => gradeResponse(ACADEMIC, ACADEMIC, ACADEMIC)],
    ['notebook', () => getNotebookAssistantResponse([{ role: 'user', content: ACADEMIC }], ACADEMIC)],
    ['portfolio', () => generateStudentPortfolio('anonymized', [{ role: 'user', content: ACADEMIC }])],
  ] as Array<[string, () => Promise<unknown>]>)('%s still masks dates and long digit runs', async (_n, fn) => {
    await run(fn);
    expect(bodies.length).toBeGreaterThan(0);
    expect(text()).not.toContain('2024-01-15');
    expect(text()).not.toContain('3.14159265358979');
  });
});
