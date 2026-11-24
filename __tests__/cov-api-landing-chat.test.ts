import { NextRequest } from 'next/server';

type Doc = Record<string, unknown> | undefined;
const mockDocs = new Map<string, Doc>();
const mockTxSets: Array<{ path: string; data: Record<string, unknown> }> = [];
let mockTxThrows = false;
let mockOrgThrows = false;

jest.mock('../src/lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        path: `${name}/${id}`,
        get: async () => {
          if (name === 'organizations' && mockOrgThrows) throw new Error('org read failed');
          return { exists: mockDocs.has(`${name}/${id}`), data: () => mockDocs.get(`${name}/${id}`) };
        },
      }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      if (mockTxThrows) throw new Error('tx failed');
      return fn({
        get: async (ref: { path: string }) => ({ exists: mockDocs.has(ref.path), data: () => mockDocs.get(ref.path) }),
        set: (ref: { path: string }, data: Record<string, unknown>) => { mockTxSets.push({ path: ref.path, data }); },
      });
    },
  },
}));

const mockGenerate = jest.fn();
jest.mock('../src/lib/ai/config', () => {
  const { AiBudgetError } = jest.requireActual('../src/lib/ai/errors');
  return { AiBudgetError, model: { generateContent: (...a: unknown[]) => mockGenerate(...a) } };
});
const mockCheckRateLimit = jest.fn();
jest.mock('../src/lib/rate-limit', () => ({ checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a) }));

import { AiBudgetError, AiProviderError } from '../src/lib/ai/errors';
import { POST } from '../src/app/api/chat/landing/route';
import { VISITOR_COOKIE, issueVisitorToken, hashIp } from '../src/lib/landing-visitor';

const SECRET = 'test-only-landing-cookie-secret-0123456789';
const env = { ...process.env };
const day = () => new Date().toISOString().slice(0, 10);

const call = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new NextRequest('https://scorpio.test/api/chat/landing', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }));
const setCookie = (res: Response) => res.headers.get('set-cookie') ?? '';

beforeEach(() => {
  mockDocs.clear();
  mockTxSets.length = 0;
  mockTxThrows = false;
  mockOrgThrows = false;
  process.env.LANDING_ORG_ID = 'landing-org';
  process.env.LANDING_VISITOR_COOKIE_SECRET = SECRET;
  delete process.env.LANDING_DAILY_CAP;
  mockGenerate.mockReset().mockResolvedValue({ response: Promise.resolve({ text: () => 'hello visitor' }) });
  mockCheckRateLimit.mockReset().mockResolvedValue({ allowed: true });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { process.env = { ...env }; jest.restoreAllMocks(); });

describe('POST /api/chat/landing validation and configuration', () => {
  test.each([[{}], [{ message: 5 }], [{ message: 'x'.repeat(4001) }]])('400 for an invalid message (%#)', async b => {
    const res = await call(b);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing required fields');
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('a 4000 character message is accepted', async () => {
    expect((await call({ message: 'x'.repeat(4000) })).status).toBe(200);
  });

  test.each(['LANDING_ORG_ID', 'LANDING_VISITOR_COOKIE_SECRET'])('503 with Retry-After and no model call when %s is missing', async name => {
    delete process.env[name];
    const res = await call({ message: 'hi' });
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('300');
    expect(await res.json()).toMatchObject({ unavailable: true });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('a signing secret shorter than 16 characters counts as missing', async () => {
    process.env.LANDING_VISITOR_COOKIE_SECRET = 'short';
    expect((await call({ message: 'hi' })).status).toBe(503);
  });

  test('a malformed JSON body is a 400', async () => {
    const res = await call('{oops');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });
});

describe('POST /api/chat/landing visitor identity and counters', () => {
  test('a new visitor gets an httpOnly signed cookie and counters are written', async () => {
    const res = await call({ message: 'hi' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'hello visitor', remaining: 9 });
    const cookie = setCookie(res);
    expect(cookie).toContain(`${VISITOR_COOKIE}=`);
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
    const paths = mockTxSets.map(s => s.path);
    expect(paths).toHaveLength(2);
    expect(paths[0]).toMatch(/^landing_visitors\/c_[a-f0-9]{32}$/);
    expect(paths[1]).toBe(`landing_daily/${day()}`);
    expect(mockTxSets[0].data).toMatchObject({ messageCount: 1 });
    expect(mockTxSets[0].data).toHaveProperty('firstMessageAt');
    expect(mockTxSets[1].data).toMatchObject({ count: 1 });
  });

  test('a valid visitor cookie is reused: no new cookie, counter increments, no firstMessageAt', async () => {
    const { id, token } = issueVisitorToken(SECRET);
    mockDocs.set(`landing_visitors/c_${id}`, { messageCount: 3 });
    const res = await call({ message: 'hi' }, { cookie: `${VISITOR_COOKIE}=${token}` });
    expect(await res.json()).toMatchObject({ remaining: 6 });
    expect(setCookie(res)).toBe('');
    expect(mockTxSets[0].path).toBe(`landing_visitors/c_${id}`);
    expect(mockTxSets[0].data).toMatchObject({ messageCount: 4 });
    expect(mockTxSets[0].data).not.toHaveProperty('firstMessageAt');
  });

  test('a tampered cookie is replaced by a fresh identity', async () => {
    const { id } = issueVisitorToken(SECRET);
    const res = await call({ message: 'hi' }, { cookie: `${VISITOR_COOKIE}=${id}.forgedsignature` });
    expect(setCookie(res)).toContain(`${VISITOR_COOKIE}=`);
    expect(mockTxSets[0].path).not.toBe(`landing_visitors/c_${id}`);
  });

  test('with a trusted IP header the per-IP counter and rate limit are applied using only the hash', async () => {
    const res = await call({ message: 'hi' }, { 'x-vercel-forwarded-for': '203.0.113.7, 10.0.0.1' });
    expect(res.status).toBe(200);
    const ipKey = hashIp('203.0.113.7', SECRET);
    expect(mockTxSets.map(s => s.path)).toContain(`landing_visitors/ip_${ipKey}_${day()}`);
    expect(JSON.stringify(mockTxSets)).not.toContain('203.0.113.7');
    expect(mockCheckRateLimit.mock.calls[0].slice(1)).toEqual([`ip_${ipKey}`, 'landing', { windowMs: 60000, maxRequests: 5 }]);
  });

  test('without an IP header the rate limiter is skipped', async () => {
    await call({ message: 'hi' });
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  test('429 from the IP rate limiter carries Retry-After and the new-visitor cookie, and skips the model', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, error: 'Too many requests', retryAfterSeconds: 42 });
    const res = await call({ message: 'hi' }, { 'x-real-ip': '198.51.100.4' });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(await res.json()).toEqual({ error: 'Too many requests' });
    expect(setCookie(res)).toContain(VISITOR_COOKIE);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockTxSets).toHaveLength(0);
  });

  test('429 without Retry-After when the limiter gives no delay', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, error: 'Too many requests' });
    const res = await call({ message: 'hi' }, { 'x-real-ip': '198.51.100.4' });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeNull();
  });
});

describe('POST /api/chat/landing admission limits', () => {
  test('429 limitReached once the visitor used 10 messages; nothing is incremented', async () => {
    const { id, token } = issueVisitorToken(SECRET);
    mockDocs.set(`landing_visitors/c_${id}`, { messageCount: 10 });
    const res = await call({ message: 'hi' }, { cookie: `${VISITOR_COOKIE}=${token}` });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ limitReached: true });
    expect(mockTxSets).toHaveLength(0);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('the 10th message is allowed and reports 0 remaining', async () => {
    const { id, token } = issueVisitorToken(SECRET);
    mockDocs.set(`landing_visitors/c_${id}`, { messageCount: 9 });
    const res = await call({ message: 'hi' }, { cookie: `${VISITOR_COOKIE}=${token}` });
    expect(await res.json()).toMatchObject({ remaining: 0 });
  });

  test('429 when the same IP exhausted its daily ceiling', async () => {
    mockDocs.set(`landing_visitors/ip_${hashIp('198.51.100.4', SECRET)}_${day()}`, { messageCount: 30 });
    const res = await call({ message: 'hi' }, { 'x-real-ip': '198.51.100.4' });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ limitReached: true });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('503 daily capacity message when the global cap is reached (default cap 2000)', async () => {
    mockDocs.set(`landing_daily/${day()}`, { count: 2000 });
    const res = await call({ message: 'hi' });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/daily capacity/);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('LANDING_DAILY_CAP overrides the default; invalid values fall back to it', async () => {
    process.env.LANDING_DAILY_CAP = '5';
    mockDocs.set(`landing_daily/${day()}`, { count: 5 });
    expect((await call({ message: 'hi' })).status).toBe(503);
    process.env.LANDING_DAILY_CAP = 'abc';
    expect((await call({ message: 'hi' })).status).toBe(200);
    process.env.LANDING_DAILY_CAP = '-3';
    expect((await call({ message: 'hi' })).status).toBe(200);
  });

  test('fails closed with 503 when the counter transaction errors', async () => {
    mockTxThrows = true;
    const res = await call({ message: 'hi' });
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('300');
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe('POST /api/chat/landing model call', () => {
  test('sends the system prompt, visitor question and an output cap', async () => {
    await call({ message: 'What is Scorpio?' });
    const request = mockGenerate.mock.calls[0][0];
    expect(request.contents[0].parts[0].text).toContain('Visitor question: What is Scorpio?');
    expect(request.contents[0].parts[0].text).toContain('Raise');
    expect(request.generationConfig.maxOutputTokens).toBe(512);
  });

  test('a landing budget refusal is a 503 unavailable, not an error leak', async () => {
    mockGenerate.mockRejectedValue(new AiBudgetError('org budget detail'));
    const res = await call({ message: 'hi' });
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.unavailable).toBe(true);
    expect(JSON.stringify(json)).not.toContain('org budget detail');
  });

  test('a provider error maps through the shared error response', async () => {
    mockGenerate.mockRejectedValue(new AiProviderError('upstream secret'));
    const res = await call({ message: 'hi' });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(await res.json())).not.toContain('upstream secret');
  });

  test('an unexpected error is a generic 500', async () => {
    mockGenerate.mockRejectedValue(new Error('weird'));
    const res = await call({ message: 'hi' });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Internal server error');
  });
});

describe('POST /api/chat/landing budget alert', () => {
  const warned = () => (console.warn as jest.Mock).mock.calls.map(c => String(c[0]));

  test('warns at 80 percent usage including reserved spend', async () => {
    mockDocs.set('organizations/landing-org', { aiBudgetLimit: 100, aiUsageCurrent: 70, aiUsageMonth: new Date().toISOString().slice(0, 7), aiUsageReserved: 10 });
    const res = await call({ message: 'hi' });
    expect(res.status).toBe(200);
    expect(warned().some(m => m.includes('past 80%') && m.includes('80%'))).toBe(true);
  });

  test('stays quiet below the threshold, with no limit, or with no org document', async () => {
    mockDocs.set('organizations/landing-org', { aiBudgetLimit: 100, aiUsageCurrent: 10 });
    await call({ message: 'hi' });
    mockDocs.set('organizations/landing-org', { aiUsageCurrent: 999 });
    await call({ message: 'hi' });
    mockDocs.delete('organizations/landing-org');
    await call({ message: 'hi' });
    expect(warned()).toEqual([]);
  });

  test('an alert-check failure is logged and never fails the visitor response', async () => {
    mockOrgThrows = true;
    const res = await call({ message: 'hi' });
    expect(res.status).toBe(200);
    expect((console.error as jest.Mock).mock.calls.some(c => String(c[0]).includes('budget alert check failed'))).toBe(true);
  });
});
