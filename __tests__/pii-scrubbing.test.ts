/**
 * RT-10 (C-008 / K-004 / B-004): one scrubber, applied inside callGeminiDirect to every AI entry point,
 * idempotent, harmless to academic content, and a log helper that never prints a full email.
 */
jest.mock('../src/lib/firebase-admin', () => ({ adminDb: {} }));
jest.mock('../functions/src/metering', () => ({
  reserveBudget: jest.fn(),
  settleBudget: jest.fn(),
  estimateMaximumCost: jest.fn(() => 0),
}));
import { billingContext, withScrubNames } from '../src/lib/billing-context';
import { model } from '../src/lib/ai/config';
import { scrubPII as srcScrub } from '../src/lib/ai/utils';
import { scrubPII, maskEmail } from '../functions/src/pii';
import { explainPhysicsConcept, helpSolveProblem } from '../src/lib/ai/tutor';
import { gradeResponse, synthesizeRubric } from '../src/lib/ai/grading';
import { generateStudentPortfolio, getNetworkLimitsHelp } from '../src/lib/ai/network';
import { getNotebookAssistantResponse } from '../src/lib/ai/notebook';
import { generateAssignmentQuestions, parseQuestionsFromText } from '../src/lib/ai/assignment';
import { getLandingChatbotResponse, getNavigationResponse } from '../src/lib/ai/chatbot';

describe('single implementation', () => {
  test('src re-exports the functions implementation', () => {
    expect(srcScrub).toBe(scrubPII);
  });
});

describe('scrubPII idempotence', () => {
  const dirty = 'Alice Johnson <alice.j@school.edu> 555-123-4567, ID: 1234567, 12 Oak Street, DOB: 01/02/2010, 2024-01-15, 4111 1111 1111 1111, SSN 123-45-6789';
  test.each([[[]], [['Alice Johnson']], [['Name', 'Date', 'Email', 'Alice']]])('twice equals once (names %j)', (names: string[]) => {
    const once = scrubPII(dirty, names);
    expect(scrubPII(once, names)).toBe(once);
  });
  test('a roster name equal to a placeholder word does not mangle placeholders', () => {
    const once = scrubPII('mail a@b.com', ['Email']);
    expect(once).toBe('mail [EMAIL]');
    expect(scrubPII(once, ['Email'])).toBe(once);
  });
});

describe('academic content is untouched', () => {
  test.each([
    'H2SO4 + 2NaOH -> Na2SO4 + 2H2O',
    'Balance C6H12O6 + 6O2 -> 6CO2 + 6H2O',
    'g = 9.81 m/s^2, c = 2.998e8 m/s, h = 6.626e-34 J s',
    'Solve x^2 + 3x - 4 = 0 and f(x) = 2x + 1; 5 - 3 - 2 = 0',
    'N_A = 6.02214076e23 and pi is about 3.14159',
    'Use 3.5 m/s, 12 N and 200 J; the answer is 0.0025 or 1,000,000',
    'See https://en.wikipedia.org/wiki/Isaac_Newton and http://example.org/a?b=1',
    'The Apollo 11 landing was on July 20, 1969; Newton was born in 1643.',
    'The Treaty of Versailles was signed in 1919 (June 28).',
    '1. What is 2+2?\nA) 3\nB) 4\nC) 5\nCorrect: B',
    'The $E=mc^2$ derivation; $$\\int_0^1 x\\,dx = \\tfrac12$$',
  ])('%s', (text) => {
    expect(scrubPII(text, [])).toBe(text);
  });

  test('Scorpio published support address is kept, any other address is not', () => {
    expect(scrubPII('contact rushil@scorpioedu.org', [])).toBe('contact rushil@scorpioedu.org');
    expect(scrubPII('contact kid@scorpioedu.org', [])).toBe('contact [EMAIL]');
  });
});

describe('maskEmail', () => {
  test('keeps first character and domain only', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('j***@example.com');
  });
  test.each([undefined, null, '', 'nope', '@x.com', 'a@', 42])('non-address %p is fully redacted', (v) => {
    expect(maskEmail(v)).toBe('[redacted]');
  });
});

// --- every AI entry point: an email and a roster name in any prompt never reach the provider ---

const EMAIL = 'zed.quill@school.edu';
const NAME = 'Zed Quill';
const ROSTER = [NAME, 'Mira Okafor'];
const TAINT = `I am ${NAME}, write to ${EMAIL}. Mira Okafor too.`;

const okBody = { candidates: [{ content: { parts: [{ text: '{"score":5,"feedback":"ok","reasoning":"r","questions":[]}' }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } };
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

/** Runs as a roster-aware route would: names in the billing context, errors from the stub model ignored. */
const run = async (fn: () => Promise<unknown>) => {
  await billingContext.run({ type: 'research', organizationId: '' }, () => withScrubNames(ROSTER, fn)).catch(() => undefined);
};
const expectClean = () => {
  expect(bodies.length).toBeGreaterThan(0);
  for (const b of bodies) {
    expect(b).not.toContain(EMAIL);
    expect(b).not.toContain('Zed');
    expect(b).not.toContain('Quill');
    expect(b).not.toContain('Okafor');
  }
};

const entries: Array<[string, () => Promise<unknown>]> = [
  ['tutor.explainPhysicsConcept', () => explainPhysicsConcept(TAINT, [{ role: 'user', content: TAINT }], 'FULL')],
  ['tutor.helpSolveProblem', () => helpSolveProblem(TAINT, [{ role: 'user', content: TAINT }], 'STRICT_CONCISE', TAINT)],
  ['grading.gradeResponse', () => gradeResponse(TAINT, TAINT, TAINT)],
  ['grading.synthesizeRubric', () => synthesizeRubric(TAINT, TAINT)],
  ['network.getNetworkLimitsHelp', () => getNetworkLimitsHelp(TAINT, [{ role: 'user', content: TAINT }], { orgName: TAINT, planId: 'free', aiBudgetLimit: 1, aiUsageCurrent: 0 } as unknown as Parameters<typeof getNetworkLimitsHelp>[2])],
  ['network.generateStudentPortfolio', () => generateStudentPortfolio('anonymized', [{ role: 'user', content: TAINT }])],
  ['notebook.getNotebookAssistantResponse', () => getNotebookAssistantResponse([{ role: 'user', content: TAINT }, { role: 'assistant', content: TAINT }, { role: 'user', content: TAINT }], TAINT)],
  ['assignment.generateAssignmentQuestions (api/ai/generate)', () => generateAssignmentQuestions(TAINT, 2, 'easy', 'mixed', TAINT)],
  ['assignment.parseQuestionsFromText (api/ai/parse)', () => parseQuestionsFromText(`1. ${TAINT} What is the answer here?\n2. ${TAINT} And a second long question?`)],
  ['chatbot.getNavigationResponse (api/chat)', () => getNavigationResponse(TAINT, 'student', TAINT, 'SYS')],
  ['chatbot.getLandingChatbotResponse', () => getLandingChatbotResponse(TAINT, 'SYS')],
  ['landing route shape (contents parts)', () => model.generateContent({ contents: [{ parts: [{ text: `SYS\n\nVisitor question: ${TAINT}` }] }] })],
  ['bare string request', () => model.generateContent(TAINT)],
  ['prompt request', () => model.generateContent({ prompt: TAINT })],
  ['string entries in contents', () => model.generateContent({ contents: [TAINT] })],
  ['systemInstruction string', () => model.generateContent({ systemInstruction: TAINT, contents: [{ parts: [{ text: 'x' }] }] })],
  ['systemInstruction parts object', () => model.generateContent({ systemInstruction: { parts: [{ text: TAINT }] }, contents: [{ parts: [{ text: 'x' }] }] })],
  ['startChat history and message', async () => model.startChat({ history: [{ role: 'user', parts: [{ text: TAINT }] }] }).sendMessage(TAINT)],
];

describe('no email or roster name reaches the provider', () => {
  test.each(entries)('%s', async (_n, fn) => {
    await run(fn);
    expectClean();
  });

  test('without supplied names only pattern PII is masked and names pass (no roster, no guessing)', async () => {
    await billingContext.run({ type: 'research', organizationId: '' }, () => model.generateContent(TAINT));
    expect(bodies[0]).not.toContain(EMAIL);
    expect(bodies[0]).toContain('Zed Quill');
  });

  test('a system instruction with no PII or roster match is sent unchanged', async () => {
    await billingContext.run({ type: 'research', organizationId: '' }, () =>
      withScrubNames(ROSTER, () => model.generateContent({ systemInstruction: 'Follow the rules strictly.', contents: [{ parts: [{ text: 'hi' }] }] })));
    expect(JSON.parse(bodies[0]).systemInstruction).toEqual({ parts: [{ text: 'Follow the rules strictly.' }] });
  });

  test('non-text parts pass through untouched', async () => {
    const part = { inlineData: { mimeType: 'image/png', data: 'AAAA' } };
    await billingContext.run({ type: 'research', organizationId: '' }, () => model.generateContent({ contents: [{ parts: [part, { text: EMAIL }] }] }));
    const sent = JSON.parse(bodies[0]);
    expect(sent.contents[0].parts).toEqual([part, { text: '[EMAIL]' }]);
  });
});
