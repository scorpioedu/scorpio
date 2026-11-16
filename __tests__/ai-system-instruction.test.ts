jest.mock('../src/lib/firebase-admin', () => ({ adminDb: {} }));
jest.mock('../functions/src/metering', () => ({
  reserveBudget: jest.fn(),
  settleBudget: jest.fn(),
  estimateMaximumCost: jest.fn(() => 0),
}));
import { model } from '../src/lib/ai/config';
import { billingContext } from '../src/lib/billing-context';

const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
beforeAll(() => { process.env.GEMINI_API_KEY = 'test-key-not-real'; });
afterEach(() => jest.restoreAllMocks());

const send = (request: Parameters<typeof model.generateContent>[0]) => billingContext.run({ type: 'research', organizationId: '' }, () => model.generateContent(request));
const sentPayload = (spy: jest.SpyInstance) => JSON.parse((spy.mock.calls[0][1] as { body: string }).body);

describe('callGeminiDirect systemInstruction', () => {
  test('a string systemInstruction is sent as a system-instruction part', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }));
    await send({ systemInstruction: 'Be strict.', contents: [{ role: 'user', parts: [{ text: 'hello' }] }] });
    expect(sentPayload(spy).systemInstruction).toEqual({ parts: [{ text: 'Be strict.' }] });
  });

  test('requests without one send no systemInstruction field', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }));
    await send('hello');
    expect('systemInstruction' in sentPayload(spy)).toBe(false);
  });
});
