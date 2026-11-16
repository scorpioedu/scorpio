/**
 * Branch coverage for callGeminiDirect / model.startChat in src/lib/ai/config.ts.
 * fetch and the metering functions are mocked; no real service is contacted.
 */
const mockReserve = jest.fn();
const mockSettle = jest.fn();
jest.mock('../src/lib/firebase-admin', () => ({ adminDb: { kind: 'db' } }));
jest.mock('../functions/src/metering', () => ({
  reserveBudget: (...a: unknown[]) => mockReserve(...a),
  settleBudget: (...a: unknown[]) => mockSettle(...a),
  estimateMaximumCost: jest.fn(() => 42),
}));

import { model } from '../src/lib/ai/config';
import { billingContext } from '../src/lib/billing-context';
import { AiBudgetError, AiInputError, AiProviderError } from '../src/lib/ai/errors';

const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const goodBody = { candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4, thoughtsTokenCount: 5 } };

const ENV = ['GEMINI_API_KEY', 'NEXT_PUBLIC_APP_URL'] as const;
const saved: Record<string, string | undefined> = {};
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  mockReserve.mockReset().mockResolvedValue('res-1');
  mockSettle.mockReset().mockResolvedValue(undefined);
  ENV.forEach(k => { saved[k] = process.env[k]; });
  process.env.GEMINI_API_KEY = 'test-key-not-real';
  delete process.env.NEXT_PUBLIC_APP_URL;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse(goodBody));
});
afterEach(() => {
  ENV.forEach(k => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  jest.restoreAllMocks();
});

const inOrg = <T>(fn: () => Promise<T>, extra: Partial<{ type: string; userId: string; scrubNames: string[] }> = {}) =>
  billingContext.run({ type: 'grading', organizationId: 'org1', userId: 'u1', ...extra }, fn);
const asResearch = <T>(fn: () => Promise<T>) => billingContext.run({ type: 'research', organizationId: '' }, fn);
const body = () => JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);

describe('request construction', () => {
  it('rejects when the server key is not configured', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(asResearch(() => model.generateContent('hi'))).rejects.toThrow('Set the server-only GEMINI_API_KEY');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('turns string entries in contents into text parts and keeps content objects', async () => {
    await asResearch(() => model.generateContent({ contents: ['plain', { role: 'user', parts: [{ text: 'obj' }] }] }));
    expect(body().contents).toEqual([{ parts: [{ text: 'plain' }] }, { role: 'user', parts: [{ text: 'obj' }] }]);
  });

  it('uses req.prompt when there are no contents', async () => {
    await asResearch(() => model.generateContent({ prompt: 'from prompt' }));
    expect(body().contents).toEqual([{ parts: [{ text: 'from prompt' }] }]);
  });

  it('sends empty contents when neither contents nor prompt are given', async () => {
    await asResearch(() => model.generateContent({}));
    expect(body().contents).toEqual([]);
  });

  it('treats a null request like an empty options object', async () => {
    await asResearch(() => model.generateContent(null as never));
    const sent = body();
    expect(sent.contents).toEqual([]);
    expect(sent.generationConfig.maxOutputTokens).toBe(2048);
    expect('systemInstruction' in sent).toBe(false);
  });

  it('wraps a bare string request as a single text part', async () => {
    await asResearch(() => model.generateContent('bare'));
    expect(body().contents).toEqual([{ parts: [{ text: 'bare' }] }]);
  });

  it('defaults to 2048 output tokens and the stock safety settings', async () => {
    await asResearch(() => model.generateContent('x'));
    expect(body().generationConfig).toMatchObject({ temperature: 0.7, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } });
    expect(body().safetySettings).toHaveLength(4);
  });

  it('caps requested output tokens at 8192 and honours caller temperature and safety settings', async () => {
    const safety = [{ category: 'X', threshold: 'Y' }];
    await asResearch(() => model.generateContent({ contents: ['x'], generationConfig: { maxOutputTokens: 99999, temperature: 0.1 }, safetySettings: safety }));
    expect(body().generationConfig).toMatchObject({ maxOutputTokens: 8192, temperature: 0.1 });
    expect(body().safetySettings).toEqual(safety);
  });

  it('keeps a smaller requested token budget', async () => {
    await asResearch(() => model.generateContent({ contents: ['x'], generationConfig: { maxOutputTokens: 100 } }));
    expect(body().generationConfig.maxOutputTokens).toBe(100);
  });

  it('sends the APP_URL as Referer when set and the default otherwise', async () => {
    await asResearch(() => model.generateContent('x'));
    expect((fetchSpy.mock.calls[0][1] as { headers: Record<string, string> }).headers.Referer).toBe('https://scorpioedu.org');
    fetchSpy.mockClear();
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.test';
    await asResearch(() => model.generateContent('x'));
    expect((fetchSpy.mock.calls[0][1] as { headers: Record<string, string> }).headers.Referer).toBe('https://example.test');
  });
});

describe('PII scrubbing', () => {
  const MAIL = 'kid@school.edu';
  const PHONE = '555-123-4567';

  it('masks emails only at the default contact level', async () => {
    await asResearch(() => model.generateContent({ contents: [{ parts: [{ text: `${MAIL} ${PHONE}` }] }] }));
    expect(body().contents[0].parts[0].text).toBe(`[EMAIL] ${PHONE}`);
  });

  it('also masks phone numbers at the full level', async () => {
    await asResearch(() => model.generateContent({ scrubLevel: 'full', contents: [{ parts: [{ text: `${MAIL} ${PHONE}` }] }] }));
    expect(body().contents[0].parts[0].text).toBe('[EMAIL] [PHONE]');
  });

  it('masks names supplied through the billing context', async () => {
    await inOrg(() => model.generateContent({ contents: [{ parts: [{ text: 'Zebediah asked' }] }] }), { scrubNames: ['Zebediah'] });
    expect(body().contents[0].parts[0].text).not.toContain('Zebediah');
  });

  it('passes non-text parts, null parts and null contents through unchanged', async () => {
    const inline = { inlineData: { mimeType: 'image/png', data: 'AAA' } };
    await asResearch(() => model.generateContent({ contents: [{ parts: [inline, null as never, { text: 5 as never }] }, null as never] }));
    expect(body().contents).toEqual([{ parts: [inline, null, { text: 5 }] }, null]);
  });

  it('leaves contents without a parts array untouched', async () => {
    await asResearch(() => model.generateContent({ contents: [{ role: 'user' } as never] }));
    expect(body().contents).toEqual([{ role: 'user' }]);
  });

  it('scrubs an object systemInstruction and a string one', async () => {
    await asResearch(() => model.generateContent({ contents: ['x'], systemInstruction: { parts: [{ text: `mail ${MAIL}` }] } }));
    expect(body().systemInstruction).toEqual({ parts: [{ text: 'mail [EMAIL]' }] });
    fetchSpy.mockClear();
    await asResearch(() => model.generateContent({ contents: ['x'], systemInstruction: `mail ${MAIL}` }));
    expect(body().systemInstruction).toEqual({ parts: [{ text: 'mail [EMAIL]' }] });
  });
});

describe('gating and budget', () => {
  it('requires an organization unless the call is a research call', async () => {
    await expect(model.generateContent('x')).rejects.toThrow('An authenticated network is required for AI');
    await expect(billingContext.run({ type: 'grading', organizationId: '' }, () => model.generateContent('x')))
      .rejects.toThrow('An authenticated network is required for AI');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects oversized conversations before any budget is reserved', async () => {
    const big = 'lorem ipsum '.repeat(9100);
    await expect(inOrg(() => model.generateContent(big))).rejects.toBeInstanceOf(AiInputError);
    expect(mockReserve).not.toHaveBeenCalled();
  });

  it('reserves with the org, type, user and estimated cost, and settles actual usage', async () => {
    const res = await inOrg(() => model.generateContent('x'));
    expect(mockReserve).toHaveBeenCalledWith({ kind: 'db' }, 'org1', 'grading', 'u1', 42);
    expect(mockSettle).toHaveBeenCalledWith({ kind: 'db' }, 'res-1', 3, 9);
    const r = await res.response;
    expect(r.text()).toBe('ab');
    expect(r.usageMetadata).toEqual(goodBody.usageMetadata);
  });

  it('settles zero counts when usage metadata omits them', async () => {
    fetchSpy.mockResolvedValue(okResponse({ candidates: [], usageMetadata: {} }));
    await inOrg(() => model.generateContent('x'));
    expect(mockSettle).toHaveBeenCalledWith({ kind: 'db' }, 'res-1', 0, 0);
  });

  it('wraps a refused reservation in AiBudgetError with the detail', async () => {
    mockReserve.mockRejectedValue(new Error('cap reached'));
    const err = await inOrg(() => model.generateContent('x')).catch(e => e);
    expect(err).toBeInstanceOf(AiBudgetError);
    expect(err.message).toBe('cap reached');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stringifies a non-Error reservation failure', async () => {
    mockReserve.mockRejectedValue('plain string');
    const err = await inOrg(() => model.generateContent('x')).catch(e => e);
    expect(err).toBeInstanceOf(AiBudgetError);
    expect(err.message).toBe('plain string');
  });

  it('lets an exempt research call proceed uncapped when its reservation fails', async () => {
    mockReserve.mockRejectedValue(new Error('no budget doc'));
    const res = await billingContext.run({ type: 'research', organizationId: 'orgR' }, () => model.generateContent('x'));
    expect((await res.response).text()).toBe('ab');
    expect(console.error).toHaveBeenCalledWith('[AI] research reservation skipped (exempt type, proceeding uncapped):', 'no budget doc');
    expect(mockSettle).not.toHaveBeenCalled();
  });
});

describe('provider failures', () => {
  it('maps a fetch failure to AiProviderError and settles the input estimate', async () => {
    fetchSpy.mockRejectedValue(new Error('socket hang up'));
    const err = await inOrg(() => model.generateContent('abcdefgh')).catch(e => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.message).toBe('AI provider request failed: socket hang up');
    const inputBytes = Buffer.byteLength((fetchSpy.mock.calls[0][1] as { body: string }).body);
    expect(mockSettle).toHaveBeenCalledWith({ kind: 'db' }, 'res-1', Math.ceil(inputBytes / 4), 0);
  });

  it('reports "unknown" when a non-object is thrown by fetch', async () => {
    fetchSpy.mockRejectedValue('boom');
    const err = await asResearch(() => model.generateContent('x')).catch(e => e);
    expect(err.message).toBe('AI provider request failed: unknown');
  });

  it('logs and still throws AiProviderError when settling after a fetch failure also fails', async () => {
    fetchSpy.mockRejectedValue(new Error('down'));
    mockSettle.mockRejectedValue(new Error('settle down'));
    const err = await inOrg(() => model.generateContent('x')).catch(e => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(console.error).toHaveBeenCalledWith('[AI] failed to settle reservation after provider failure:', 'settle down');
  });

  it('logs a non-Error settle failure as-is', async () => {
    fetchSpy.mockRejectedValue(new Error('down'));
    mockSettle.mockRejectedValue('oops');
    await inOrg(() => model.generateContent('x')).catch(() => undefined);
    expect(console.error).toHaveBeenCalledWith('[AI] failed to settle reservation after provider failure:', 'oops');
  });

  it('releases the hold with zero cost on a non-2xx status', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 503 } as unknown as Response);
    const err = await inOrg(() => model.generateContent('x')).catch(e => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.message).toBe('AI provider returned 503');
    expect(mockSettle).toHaveBeenCalledWith({ kind: 'db' }, 'res-1', 0, 0);
  });

  it('does not settle on a non-2xx status when no reservation exists', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
    await expect(asResearch(() => model.generateContent('x'))).rejects.toThrow('AI provider returned 500');
    expect(mockSettle).not.toHaveBeenCalled();
  });

  it('maps an unreadable body to AiProviderError and settles the estimate', async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } } as unknown as Response);
    const err = await inOrg(() => model.generateContent('x')).catch(e => e);
    expect(err.message).toBe('AI provider returned an unreadable body: bad json');
    expect(mockSettle).toHaveBeenCalledTimes(1);
  });

  it('warns and settles the estimate when usageMetadata is missing on a reserved call', async () => {
    fetchSpy.mockResolvedValue(okResponse({ candidates: [{ content: { parts: [{ text: 'z' }] } }] }));
    const res = await inOrg(() => model.generateContent('x'));
    expect(console.warn).toHaveBeenCalledWith('[AI] provider returned no usageMetadata; settling with the input-size estimate');
    expect(mockSettle).toHaveBeenCalledTimes(1);
    expect((await res.response).usageMetadata).toEqual({ promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 });
  });

  it('does not warn about missing usage on an unreserved call and returns empty text and candidates', async () => {
    fetchSpy.mockResolvedValue(okResponse({}));
    const res = await asResearch(() => model.generateContent('x'));
    const r = await res.response;
    expect(console.warn).not.toHaveBeenCalled();
    expect(r.text()).toBe('');
    expect(r.candidates).toEqual([]);
  });
});

describe('startChat', () => {
  const reply = (text: string) => okResponse({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } });

  it('starts with an empty history when no options are given and records both turns', async () => {
    fetchSpy.mockResolvedValue(reply('answer'));
    const chat = model.startChat();
    await asResearch(() => chat.sendMessage('question'));
    expect(body().contents).toEqual([{ role: 'user', parts: [{ text: 'question' }] }]);
    expect(await chat.getHistory()).toEqual([
      { role: 'user', parts: [{ text: 'question' }] },
      { role: 'model', parts: [{ text: 'answer' }] },
    ]);
  });

  it('prepends seeded history, accepts a content object and forwards the chat options', async () => {
    fetchSpy.mockResolvedValue(reply('ok'));
    const safety = [{ category: 'C', threshold: 'T' }];
    const seed = [{ role: 'user', parts: [{ text: 'earlier' }] }];
    const chat = model.startChat({ history: seed, generationConfig: { temperature: 0.3 }, safetySettings: safety, scrubLevel: 'full' });
    await asResearch(() => chat.sendMessage({ role: 'user', parts: [{ text: 'call 555-123-4567' }] }));
    expect(body().contents).toEqual([seed[0], { role: 'user', parts: [{ text: 'call [PHONE]' }] }]);
    expect(body().generationConfig.temperature).toBe(0.3);
    expect(body().safetySettings).toEqual(safety);
    expect(seed).toHaveLength(1);
  });

  it('does not record a turn when the call fails', async () => {
    fetchSpy.mockRejectedValue(new Error('down'));
    const chat = model.startChat();
    await expect(asResearch(() => chat.sendMessage('q'))).rejects.toBeInstanceOf(AiProviderError);
    expect(await chat.getHistory()).toEqual([]);
  });
});
