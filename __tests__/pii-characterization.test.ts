/**
 * RT-10 characterization: pins exactly which text reaches the provider for every AI entry point
 * that scrubs PII today (tutor, grading, network portfolio, notebook chat), plus the entry points
 * that do not scrub yet. Snapshots in __snapshots__ were recorded BEFORE scrubbing was centralised;
 * the scrubbed-caller snapshots must never change.
 */
jest.mock('../src/lib/firebase-admin', () => ({ adminDb: {} }));
jest.mock('../functions/src/metering', () => ({
  reserveBudget: jest.fn(),
  settleBudget: jest.fn(),
  estimateMaximumCost: jest.fn(() => 0),
}));
import { billingContext } from '../src/lib/billing-context';
import { explainPhysicsConcept, helpSolveProblem } from '../src/lib/ai/tutor';
import { gradeResponse, synthesizeRubric } from '../src/lib/ai/grading';
import { generateStudentPortfolio, getNetworkLimitsHelp } from '../src/lib/ai/network';
import { getNotebookAssistantResponse } from '../src/lib/ai/notebook';
import { generateAssignmentQuestions, parseQuestionsFromText } from '../src/lib/ai/assignment';
import { getLandingChatbotResponse, getNavigationResponse } from '../src/lib/ai/chatbot';
import { scrubPII } from '../src/lib/ai/utils';

const ROSTER = ['Alice Johnson', 'Bob Lee'];
const DIRTY = 'Hi, I am Alice Johnson (alice.j@school.edu, 555-123-4567). Bob Lee sat next to me. Is v = 3.5 m/s?';
const HISTORY = [
  { role: 'user' as const, content: 'My email is alice.j@school.edu' },
  { role: 'assistant' as const, content: 'Please do not share that, Alice.' },
  { role: 'user' as const, content: 'ok, Bob Lee says call 555-123-4567' },
];

const okBody = { candidates: [{ content: { parts: [{ text: '{"score":5,"feedback":"ok","reasoning":"r","questions":[]}' }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } };
let bodies: Array<{ systemInstruction?: unknown; contents: unknown }> = [];
beforeAll(() => { process.env.GEMINI_API_KEY = 'test-key-not-real'; });
beforeEach(() => {
  bodies = [];
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(global, 'fetch').mockImplementation((async (_u: unknown, init: { body: string }) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => okBody } as unknown as Response;
  }) as typeof fetch);
});
afterEach(() => jest.restoreAllMocks());

const inCtx = <T,>(fn: () => Promise<T>) => billingContext.run({ type: 'research', organizationId: '' }, fn).catch(() => undefined);
/** Only the text the provider sees, in order. */
const outgoing = () => JSON.parse(
  JSON.stringify(bodies.map(b => ({ systemInstruction: b.systemInstruction, contents: b.contents })))
    // The grader wraps untrusted text in per-request random tags; pin everything but the nonce.
    .replace(/(question|rubric|submission)-[0-9a-f]{12}/g, '$1-NONCE'),
);

describe('scrubbed entry points: exact outgoing text', () => {
  test('tutor: explainPhysicsConcept', async () => {
    await inCtx(() => explainPhysicsConcept(DIRTY, HISTORY, 'FULL', ROSTER));
    expect(outgoing()).toMatchSnapshot();
  });
  test('tutor: helpSolveProblem with assignment context', async () => {
    await inCtx(() => helpSolveProblem(DIRTY, HISTORY, 'STRICT_CONCISE', 'Q1 for Alice Johnson: contact bob@x.org', ROSTER));
    expect(outgoing()).toMatchSnapshot();
  });
  test('grading: gradeResponse', async () => {
    await inCtx(() => gradeResponse('Explain energy for Bob Lee', DIRTY, 'Key: mention bob@x.org and Alice', ROSTER));
    expect(outgoing()).toMatchSnapshot();
  });
  test('network: generateStudentPortfolio', async () => {
    await inCtx(() => generateStudentPortfolio('Alice Johnson', HISTORY));
    expect(outgoing()).toMatchSnapshot();
  });
  test('notebook chat as the route calls it (route pre-scrubs with the display name)', async () => {
    const name = ['Alice Johnson'];
    const msgs = [{ role: 'user' as const, content: DIRTY }, { role: 'assistant' as const, content: 'Sure Alice' }, { role: 'user' as const, content: 'mail alice.j@school.edu' }];
    await inCtx(() => getNotebookAssistantResponse(msgs.map(m => ({ ...m, content: scrubPII(m.content, name) })), scrubPII('Notes by Alice Johnson 555-123-4567', name)));
    expect(outgoing()).toMatchSnapshot();
  });
});

describe('entry points with no scrubbing today: exact outgoing text', () => {
  test('network limits help, synthesizeRubric, chatbot, assignment', async () => {
    const ctx = { orgName: 'Org', planId: 'free', aiBudgetLimit: 100, aiUsageCurrent: 10 } as unknown as Parameters<typeof getNetworkLimitsHelp>[2];
    await inCtx(() => getNetworkLimitsHelp('How much?', [], ctx));
    await inCtx(() => synthesizeRubric('What is KE?', 'energy'));
    await inCtx(() => getLandingChatbotResponse('hello', 'SYS'));
    await inCtx(() => getNavigationResponse('where?', 'student', 'features', 'SYS'));
    await inCtx(() => generateAssignmentQuestions('Energy', 2, 'easy', 'mixed', 'Objectives'));
    await inCtx(() => parseQuestionsFromText('1. What is the formula for water? H2O\n2. Compute 6.02e23 / 2.5 for a mole'));
    expect(outgoing()).toMatchSnapshot();
  });
});
