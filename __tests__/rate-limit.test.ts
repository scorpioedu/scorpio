import { NextRequest } from 'next/server';
import { createFakeDb, type FakeDb } from '../tests/helpers/fake-rate-limit-db';

let fake: FakeDb;
jest.mock('../src/lib/firebase-admin', () => ({
  get adminDb() { return fake; },
}));
import { checkRateLimit } from '../src/lib/rate-limit';

const req = (headers: Record<string, string> = {}) => new NextRequest('https://scorpio.test/api/x', { method: 'POST', headers });
const cfg = { windowMs: 60_000, maxRequests: 3 };

beforeEach(() => {
  fake = createFakeDb();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-12T10:00:00Z'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

// RT-11 / C-002, E-008: characterisation of checkRateLimit as shipped, then the new guarantees.
describe('checkRateLimit characterisation', () => {
  test('allows up to maxRequests then blocks the next one', async () => {
    for (let i = 0; i < 3; i++) expect((await checkRateLimit(req(), 'u1', 'k', cfg)).allowed).toBe(true);
    const blocked = await checkRateLimit(req(), 'u1', 'k', cfg);
    expect(blocked.allowed).toBe(false);
    expect(blocked.error).toBe('Rate limit exceeded. Max 3 requests per 1 minutes.');
  });

  test('a blocked call does not consume budget', async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit(req(), 'u1', 'k', cfg);
    expect(fake.docs.get('rate_limits/k_u1')?.count).toBe(3);
  });

  test('window resets once windowMs has passed', async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit(req(), 'u1', 'k', cfg);
    expect((await checkRateLimit(req(), 'u1', 'k', cfg)).allowed).toBe(false);
    jest.advanceTimersByTime(60_001);
    expect((await checkRateLimit(req(), 'u1', 'k', cfg)).allowed).toBe(true);
    expect(fake.docs.get('rate_limits/k_u1')?.count).toBe(1);
  });

  test('still blocked exactly at the window boundary', async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit(req(), 'u1', 'k', cfg);
    jest.advanceTimersByTime(60_000);
    expect((await checkRateLimit(req(), 'u1', 'k', cfg)).allowed).toBe(false);
  });

  test('buckets are isolated per user and per endpoint type', async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit(req(), 'u1', 'k', cfg);
    expect((await checkRateLimit(req(), 'u1', 'k', cfg)).allowed).toBe(false);
    expect((await checkRateLimit(req(), 'u2', 'k', cfg)).allowed).toBe(true);
    expect((await checkRateLimit(req(), 'u1', 'other', cfg)).allowed).toBe(true);
  });

  test('state lives in Firestore, so a second server instance shares the bucket', async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit(req(), 'u1', 'k', cfg);
    jest.resetModules();
    const { checkRateLimit: otherInstance } = await import('../src/lib/rate-limit');
    expect((await otherInstance(req(), 'u1', 'k', cfg)).allowed).toBe(false);
  });

  test('concurrent calls are counted by the transaction, never over the limit', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => checkRateLimit(req(), 'u1', 'k', cfg)));
    expect(results.filter(r => r.allowed)).toHaveLength(3);
  });

  test('slashes in the identifier cannot address another document path', async () => {
    await checkRateLimit(req(), 'a/b', 'k', cfg);
    expect([...fake.docs.keys()]).toEqual(['rate_limits/k_a_b']);
  });

  test('fails closed when the database is unavailable (existing semantics)', async () => {
    fake.failWith = new Error('UNAVAILABLE');
    expect(await checkRateLimit(req(), 'u1', 'k', cfg)).toMatchObject({ allowed: false, error: 'Rate limit check failed' });
  });
});

describe('checkRateLimit client IP (spoofing)', () => {
  test('rotating x-forwarded-for does not bypass the limit', async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit(req({ 'x-forwarded-for': `10.0.0.${i}` }), null, 'k', cfg);
    expect((await checkRateLimit(req({ 'x-forwarded-for': '10.0.0.99' }), null, 'k', cfg)).allowed).toBe(false);
  });

  test('rotating x-forwarded-for does not bypass the limit when the Vercel header is present', async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit(req({ 'x-vercel-forwarded-for': '203.0.113.5', 'x-forwarded-for': `10.0.0.${i}` }), null, 'k', cfg);
    expect((await checkRateLimit(req({ 'x-vercel-forwarded-for': '203.0.113.5', 'x-forwarded-for': '10.0.0.99' }), null, 'k', cfg)).allowed).toBe(false);
  });

  test('the bucket follows x-vercel-forwarded-for', async () => {
    const h = { 'x-vercel-forwarded-for': '203.0.113.5' };
    for (let i = 0; i < 3; i++) await checkRateLimit(req(h), null, 'k', cfg);
    expect((await checkRateLimit(req(h), null, 'k', cfg)).allowed).toBe(false);
    expect((await checkRateLimit(req({ 'x-vercel-forwarded-for': '203.0.113.6' }), null, 'k', cfg)).allowed).toBe(true);
  });

  test('x-real-ip is used when the Vercel header is absent', async () => {
    const h = { 'x-real-ip': '198.51.100.1' };
    for (let i = 0; i < 3; i++) await checkRateLimit(req(h), null, 'k', cfg);
    expect((await checkRateLimit(req(h), null, 'k', cfg)).allowed).toBe(false);
    expect((await checkRateLimit(req({ 'x-real-ip': '198.51.100.2' }), null, 'k', cfg)).allowed).toBe(true);
  });

  test('an authenticated uid wins over the IP: two users behind one NAT do not share a bucket', async () => {
    const h = { 'x-vercel-forwarded-for': '203.0.113.5' };
    for (let i = 0; i < 3; i++) await checkRateLimit(req(h), 's1', 'k', cfg);
    expect((await checkRateLimit(req(h), 's1', 'k', cfg)).allowed).toBe(false);
    expect((await checkRateLimit(req(h), 's2', 'k', cfg)).allowed).toBe(true);
  });
});

describe('checkRateLimit result metadata', () => {
  test('a blocked call reports seconds until the window ends', async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit(req(), 'u1', 'k', cfg);
    jest.advanceTimersByTime(20_000);
    expect(await checkRateLimit(req(), 'u1', 'k', cfg)).toMatchObject({ allowed: false, retryAfterSeconds: 40 });
  });

  test('a database failure is flagged unavailable so callers can choose to fail open', async () => {
    fake.failWith = new Error('UNAVAILABLE');
    expect(await checkRateLimit(req(), 'u1', 'k', cfg)).toMatchObject({ allowed: false, unavailable: true });
  });

  test('buckets carry an expiresAt so a Firestore TTL policy can clean them up', async () => {
    await checkRateLimit(req(), 'u1', 'k', cfg);
    expect((fake.docs.get('rate_limits/k_u1')?.expiresAt as Date).getTime()).toBe(Date.now() + 60_000);
  });
});
