import { NextRequest } from 'next/server';

type Doc = Record<string, unknown> | undefined;
const mockDocs = new Map<string, Doc>();
const mockTxSets: Array<{ path: string; data: Record<string, unknown> }> = [];
let mockTxThrowValue: unknown;
let mockOrgThrowValue: unknown;

jest.mock('../src/lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        path: `${name}/${id}`,
        get: async () => {
          if (name === 'organizations' && mockOrgThrowValue !== undefined) throw mockOrgThrowValue;
          return { exists: mockDocs.has(`${name}/${id}`), data: () => mockDocs.get(`${name}/${id}`) };
        },
      }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      if (mockTxThrowValue !== undefined) throw mockTxThrowValue;
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

import { POST } from '../src/app/api/chat/landing/route';
import { VISITOR_COOKIE, issueVisitorToken, hashIp } from '../src/lib/landing-visitor';

const SECRET = 'test-only-landing-cookie-secret-0123456789';
const env = { ...process.env };
const day = () => new Date().toISOString().slice(0, 10);
const IP = '203.0.113.7';

const call = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new NextRequest('https://scorpio.test/api/chat/landing', { method: 'POST', headers, body: JSON.stringify(body) }));
const visitorHeaders = () => {
  const { id, token } = issueVisitorToken(SECRET);
  return { id, headers: { cookie: `${VISITOR_COOKIE}=${token}`, 'x-vercel-forwarded-for': IP } };
};

beforeEach(() => {
  mockDocs.clear();
  mockTxSets.length = 0;
  mockTxThrowValue = undefined;
  mockOrgThrowValue = undefined;
  process.env.LANDING_ORG_ID = 'landing-org';
  process.env.LANDING_VISITOR_COOKIE_SECRET = SECRET;
  delete process.env.LANDING_DAILY_CAP;
  mockGenerate.mockReset().mockResolvedValue({ response: Promise.resolve({ text: () => 'hello visitor' }) });
  mockCheckRateLimit.mockReset().mockResolvedValue({ allowed: true });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { process.env = { ...env }; jest.restoreAllMocks(); });

describe('landing counters tolerate documents without data', () => {
  test('counter documents that exist but carry no data are treated as zero', async () => {
    const { id, headers } = visitorHeaders();
    const ipKey = hashIp(IP, SECRET);
    mockDocs.set(`landing_visitors/c_${id}`, undefined);
    mockDocs.set(`landing_visitors/ip_${ipKey}_${day()}`, undefined);
    mockDocs.set(`landing_daily/${day()}`, undefined);
    const res = await call({ message: 'hi' }, headers);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'hello visitor', remaining: 9 });
    expect(mockTxSets.find(s => s.path === `landing_visitors/c_${id}`)?.data).toMatchObject({ messageCount: 1 });
    expect(mockTxSets.find(s => s.path === `landing_visitors/ip_${ipKey}_${day()}`)?.data).toMatchObject({ messageCount: 1 });
    expect(mockTxSets.find(s => s.path === `landing_daily/${day()}`)?.data).toMatchObject({ count: 1 });
  });

  test('counter documents lacking their count field are also treated as zero', async () => {
    const { id, headers } = visitorHeaders();
    mockDocs.set(`landing_visitors/c_${id}`, {});
    mockDocs.set(`landing_daily/${day()}`, {});
    const res = await call({ message: 'hi' }, headers);
    expect((await res.json()).remaining).toBe(9);
    expect(mockTxSets.find(s => s.path === `landing_daily/${day()}`)?.data).toMatchObject({ count: 1 });
  });

  test('an existing IP counter at the daily IP ceiling is refused with 429 and no model call', async () => {
    const { headers } = visitorHeaders();
    mockDocs.set(`landing_visitors/ip_${hashIp(IP, SECRET)}_${day()}`, { messageCount: 30 });
    const res = await call({ message: 'hi' }, headers);
    expect(res.status).toBe(429);
    expect((await res.json()).limitReached).toBe(true);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockTxSets).toEqual([]);
  });
});

describe('landing budget alert', () => {
  const warned = () => (console.warn as jest.Mock).mock.calls.map(c => String(c[0]));

  test('counts reserved spend alone when no current usage is recorded', async () => {
    mockDocs.set('organizations/landing-org', { aiBudgetLimit: 100, aiUsageReserved: 90 });
    await call({ message: 'hi' });
    expect(warned().some(m => m.includes('90% used'))).toBe(true);
  });

  test('counts current usage alone when nothing is reserved', async () => {
    mockDocs.set('organizations/landing-org', { aiBudgetLimit: 100, aiUsageCurrent: 80, aiUsageMonth: new Date().toISOString().slice(0, 7) });
    await call({ message: 'hi' });
    expect(warned().some(m => m.includes('80% used'))).toBe(true);
  });

  test('stays silent when no spend is recorded at all', async () => {
    mockDocs.set('organizations/landing-org', { aiBudgetLimit: 100 });
    const res = await call({ message: 'hi' });
    expect(res.status).toBe(200);
    expect(warned()).toEqual([]);
  });

  test('a non-Error failure reading the organization is logged raw and does not fail the request', async () => {
    mockOrgThrowValue = 'org read exploded';
    const res = await call({ message: 'hi' });
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith('[Landing Chat] budget alert check failed:', 'org read exploded');
  });
});

describe('landing counter transaction failure', () => {
  test('a non-Error transaction failure is logged raw and the request is refused with 503', async () => {
    mockTxThrowValue = 'tx exploded';
    const res = await call({ message: 'hi' });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ unavailable: true });
    expect(console.error).toHaveBeenCalledWith('[Landing Chat] counter transaction failed; refusing request:', 'tx exploded');
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
