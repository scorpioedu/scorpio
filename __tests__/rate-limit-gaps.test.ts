/**
 * RT-19 / E-008: gaps left by rate-limit.test.ts and rate-limit-routes.test.ts, found by mutation testing
 * src/lib/rate-limit.ts: message wording, the write options, the unavailable-database result and the
 * 429 response bodies of enforceRateLimit.
 */
import { NextRequest } from 'next/server';
import { createFakeDb, type FakeDb } from '../tests/helpers/fake-rate-limit-db';

let fake: FakeDb | null;
jest.mock('../src/lib/firebase-admin', () => ({
  get adminDb() { return fake; },
}));
import { checkRateLimit, enforceRateLimit } from '../src/lib/rate-limit';
import { RATE_LIMITS } from '../src/lib/rate-limit-config';

const req = (headers: Record<string, string> = {}) => new NextRequest('https://scorpio.test/api/x', { method: 'POST', headers });

beforeEach(() => {
  fake = createFakeDb();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-01T10:00:00Z'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('checkRateLimit without a database', () => {
  test('is a closed, unavailable result so callers can choose to fail open', async () => {
    fake = null;
    expect(await checkRateLimit(req(), 'u1', 'k', { windowMs: 1000, maxRequests: 1 })).toEqual({
      allowed: false, error: 'Database not initialized', unavailable: true,
    });
  });
});

describe('checkRateLimit blocked message', () => {
  const block = async (windowMs: number) => {
    const cfg = { windowMs, maxRequests: 1 };
    await checkRateLimit(req(), 'u1', 'k', cfg);
    return checkRateLimit(req(), 'u1', 'k', cfg);
  };
  test('a one-minute window is reported in minutes', async () => {
    expect((await block(60_000)).error).toBe('Rate limit exceeded. Max 1 requests per 1 minutes.');
  });
  test('a five-minute window is reported in minutes', async () => {
    expect((await block(300_000)).error).toBe('Rate limit exceeded. Max 1 requests per 5 minutes.');
  });
  test('a window shorter than half a minute is reported in milliseconds', async () => {
    expect((await block(20_000)).error).toBe('Rate limit exceeded. Max 1 requests per 20000 ms.');
  });
  test('a blocked result is not flagged unavailable', async () => {
    expect((await block(60_000)).unavailable).toBeUndefined();
  });
});

describe('checkRateLimit storage', () => {
  test('anonymous callers without a trusted IP share the "unknown-ip" bucket', async () => {
    await checkRateLimit(req(), null, 'k', { windowMs: 1000, maxRequests: 5 });
    expect([...fake!.docs.keys()]).toEqual(['rate_limits/k_ip_unknown-ip']);
  });

  test('bucket documents are written with merge: true', async () => {
    const sets: Array<[unknown, unknown, unknown]> = [];
    fake = {
      ...createFakeDb(),
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
        get: async () => ({ exists: false, data: () => undefined }),
        set: (...args: [unknown, unknown, unknown]) => { sets.push(args); },
      }),
    } as FakeDb;
    await checkRateLimit(req(), 'u1', 'k', { windowMs: 1000, maxRequests: 5 });
    expect(sets).toHaveLength(1);
    expect(sets[0][2]).toEqual({ merge: true });
  });

  test('the stored bucket has count, windowStart and expiresAt = windowStart + windowMs', async () => {
    await checkRateLimit(req(), 'u1', 'k', { windowMs: 60_000, maxRequests: 5 });
    const doc = fake!.docs.get('rate_limits/k_u1')!;
    expect(doc.count).toBe(1);
    expect(doc.windowStart).toBe(Date.now());
    expect((doc.expiresAt as Date).getTime()).toBe(Date.now() + 60_000);
  });

  test('a database failure is logged with the identifier', async () => {
    fake!.failWith = new Error('boom');
    await checkRateLimit(req(), 'u1', 'k', { windowMs: 1000, maxRequests: 5 });
    expect(console.error).toHaveBeenCalledWith('Error in checkRateLimit for u1:', expect.any(Error));
  });
});

describe('checkRateLimit window with fake timers', () => {
  const cfg = { windowMs: 60_000, maxRequests: 2 };
  test('count carries over inside the window and restarts from 1 after it', async () => {
    await checkRateLimit(req(), 'u1', 'k', cfg);
    jest.advanceTimersByTime(30_000);
    await checkRateLimit(req(), 'u1', 'k', cfg);
    expect(fake!.docs.get('rate_limits/k_u1')!.count).toBe(2);
    jest.advanceTimersByTime(30_001);
    expect((await checkRateLimit(req(), 'u1', 'k', cfg)).allowed).toBe(true);
    expect(fake!.docs.get('rate_limits/k_u1')).toMatchObject({ count: 1, windowStart: Date.now() });
  });
  test('retryAfterSeconds rounds up and is never below 1', async () => {
    await checkRateLimit(req(), 'u1', 'k', { windowMs: 60_000, maxRequests: 1 });
    jest.advanceTimersByTime(59_999);
    expect(await checkRateLimit(req(), 'u1', 'k', { windowMs: 60_000, maxRequests: 1 })).toMatchObject({ retryAfterSeconds: 1 });
    jest.advanceTimersByTime(1);
    // The window has not yet passed at exactly windowMs, and the remaining time is 0 -> clamped to 1.
    expect(await checkRateLimit(req(), 'u1', 'k', { windowMs: 60_000, maxRequests: 1 })).toMatchObject({ allowed: false, retryAfterSeconds: 1 });
  });
});

describe('enforceRateLimit responses', () => {
  const IP = { 'x-vercel-forwarded-for': '203.0.113.9' };
  test('returns null while within the limit', async () => {
    expect(await enforceRateLimit(req(IP), 'chat', 'u1')).toBeNull();
  });
  test('429 body carries the limiter message and Retry-After', async () => {
    const policy = RATE_LIMITS.write;
    fake!.docs.set('rate_limits/write_u1', { count: policy.maxRequests, windowStart: Date.now() - 1000 });
    const res = (await enforceRateLimit(req(IP), 'write', 'u1'))!;
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: `Rate limit exceeded. Max ${policy.maxRequests} requests per 1 minutes.` });
    expect(res.headers.get('Retry-After')).toBe('59');
  });
  test('a closed policy with an unavailable limiter -> 429 "Rate limit check failed" without Retry-After', async () => {
    fake!.failWith = new Error('down');
    const res = (await enforceRateLimit(req(IP), 'landing', 'u1'))!;
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Rate limit check failed' });
    expect(res.headers.get('Retry-After')).toBeNull();
  });
  test('an open policy with an unavailable limiter lets the request through', async () => {
    fake!.failWith = new Error('down');
    expect(await enforceRateLimit(req(IP), 'write', 'u1')).toBeNull();
  });
  test('without a trusted IP, an anonymous route with a numeric noIp uses one global bucket and answers 429 with the limiter message', async () => {
    const policy = RATE_LIMITS.teacherCode;
    fake!.docs.set('rate_limits/anon_teacherCode_anon', { count: policy.noIp, windowStart: Date.now() - 1000 });
    const res = (await enforceRateLimit(req(), 'teacherCode'))!;
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: `Rate limit exceeded. Max ${policy.noIp} requests per 1 minutes.` });
    expect(res.headers.get('Retry-After')).toBe('59');
  });
  test('without a trusted IP the numeric global bucket fails open when the limiter is down', async () => {
    fake!.failWith = new Error('down');
    expect(await enforceRateLimit(req(), 'teacherCode')).toBeNull();
  });
  test('without a trusted IP a "skip" policy is not limited and writes nothing', async () => {
    expect(await enforceRateLimit(req(), 'githubStats')).toBeNull();
    expect(fake!.docs.size).toBe(0);
  });
  test('without a trusted IP, a policy with no noIp rule falls back to the shared ip_unknown-ip bucket', async () => {
    expect(RATE_LIMITS.landing).not.toHaveProperty('noIp');
    await enforceRateLimit(req(), 'landing');
    expect([...fake!.docs.keys()]).toEqual(['rate_limits/landing_ip_unknown-ip']);
  });
  test('an authenticated caller never uses the anonymous bucket even without an IP', async () => {
    await enforceRateLimit(req(), 'teacherCode', 'u1');
    expect([...fake!.docs.keys()]).toEqual(['rate_limits/teacherCode_u1']);
  });
});
