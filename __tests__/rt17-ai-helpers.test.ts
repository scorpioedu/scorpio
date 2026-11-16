// RT-17 (F-003): AI helpers throw typed errors instead of returning failure text as model output, so the
// tutor/rubric/navigation routes can answer with a non-2xx status and nothing is stored as an assistant message.
jest.mock('../src/lib/firebase-admin', () => ({ adminDb: {} }));
jest.mock('../functions/src/metering', () => ({
  reserveBudget: jest.fn(),
  settleBudget: jest.fn(),
  estimateMaximumCost: jest.fn(() => 0),
}));
import { billingContext } from '../src/lib/billing-context';
import { explainPhysicsConcept, helpSolveProblem } from '../src/lib/ai/tutor';
import { synthesizeRubric } from '../src/lib/ai/grading';
import { getNavigationResponse } from '../src/lib/ai/chatbot';
import { AiProviderError } from '../src/lib/ai/errors';
import { model } from '../src/lib/ai/config';

const inCtx = <T>(fn: () => Promise<T>) => billingContext.run({ type: 'research', organizationId: '' }, fn);
const okBody = { candidates: [{ content: { parts: [{ text: 'Torque is force times lever arm.' }] } }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4 } };
const respond = (status: number, payload: unknown) => jest.spyOn(global, 'fetch').mockResolvedValue({
  ok: status < 300, status, json: async () => payload, text: async () => JSON.stringify(payload),
} as unknown as Response);

beforeAll(() => { process.env.GEMINI_API_KEY = 'test-key-not-real'; });
beforeEach(() => { jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());

describe('characterization: successful calls keep their shape', () => {
  it('explainPhysicsConcept returns text and usage', async () => {
    respond(200, okBody);
    expect(await inCtx(() => explainPhysicsConcept('torque'))).toEqual({
      text: 'Torque is force times lever arm.', usage: { inputTokens: 3, outputTokens: 4 },
    });
  });
  it('helpSolveProblem, synthesizeRubric and getNavigationResponse return text', async () => {
    respond(200, okBody);
    expect((await inCtx(() => helpSolveProblem('q'))).text).toContain('Torque');
    expect((await inCtx(() => synthesizeRubric('q', 't'))).text).toContain('Torque');
    expect((await inCtx(() => getNavigationResponse('where', 'student', 'f', 'SYS'))).text).toContain('Torque');
  });
});

describe('red: provider failures throw instead of becoming text', () => {
  const helpers: Array<[string, () => Promise<unknown>]> = [
    ['explainPhysicsConcept', () => explainPhysicsConcept('torque')],
    ['helpSolveProblem', () => helpSolveProblem('torque')],
    ['synthesizeRubric', () => synthesizeRubric('q', 't')],
    ['getNavigationResponse', () => getNavigationResponse('where', 'student', 'f', 'SYS')],
  ];
  test.each(helpers)('%s rejects with AiProviderError on a provider 500', async (_name, call) => {
    respond(500, { error: { message: 'internal GEMINI detail' } });
    await expect(inCtx(call)).rejects.toBeInstanceOf(AiProviderError);
  });
  test.each(helpers)('%s rejects with AiProviderError on a network failure', async (_name, call) => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    await expect(inCtx(call)).rejects.toBeInstanceOf(AiProviderError);
  });
  it('the AiProviderError message never carries the upstream body', async () => {
    respond(500, { error: { message: 'internal GEMINI detail' } });
    const err = await inCtx(() => explainPhysicsConcept('torque')).catch((e: unknown) => e as Error);
    expect((err as Error).message).not.toContain('GEMINI detail');
  });
  it('an unreadable provider body is an AiProviderError', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } } as unknown as Response);
    await expect(inCtx(() => model.generateContent('x'))).rejects.toBeInstanceOf(AiProviderError);
  });
});
