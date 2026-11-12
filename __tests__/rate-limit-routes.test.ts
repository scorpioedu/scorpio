import { NextRequest, NextResponse } from 'next/server';
import { createFakeDb, type FakeDb } from '../tests/helpers/fake-rate-limit-db';

let fake: FakeDb;
const verifyIdToken = jest.fn();
jest.mock('../src/lib/firebase-admin', () => ({
  get adminDb() { return fake; },
  adminAuth: {
    get verifyIdToken() { return verifyIdToken; },
    verifySessionCookie: jest.fn(),
  },
}));
// Route modules import model clients and billing code that need credentials; the limiter runs before any of it.
jest.mock('../src/lib/ai/config', () => ({ model: { generateContent: jest.fn() } }));
jest.mock('../src/lib/usage-limit', () => ({ checkBudget: jest.fn(), recordUsage: jest.fn() }));
jest.mock('../functions/src/metering', () => ({ reserveBudget: jest.fn(), settleBudget: jest.fn(), estimateMaximumCost: jest.fn() }));

import { RATE_LIMITS, type RateLimitKind } from '../src/lib/rate-limit-config';
import { enforceRateLimit } from '../src/lib/rate-limit';
import { withAuthorizedRequest } from '../src/lib/auth-verify';

const IP = '203.0.113.9';
const bearer = { Authorization: 'Bearer valid' };
const post = (path: string, headers: Record<string, string> = {}, body: unknown = {}) =>
  new NextRequest(`https://scorpio.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

/** Fills the bucket so the next call is the (N+1)th inside the window. */
function exhaust(kind: RateLimitKind, identifier: string) {
  fake.docs.set(`rate_limits/${kind}_${identifier}`, { count: RATE_LIMITS[kind].maxRequests, windowStart: Date.now() });
}

beforeEach(() => {
  fake = createFakeDb();
  verifyIdToken.mockReset();
  verifyIdToken.mockResolvedValue({ uid: 'u1' });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('withAuthorizedRequest rateLimit option', () => {
  const handler = () => jest.fn(async () => NextResponse.json({ ok: true }));
  const profile = { role: 'teacher' };
  const withProfile = () => {
    const collection = fake.collection;
    // users/{uid} lookups return a teacher; rate_limits go through the fake transaction store.
    fake.collection = (name: string) => name === 'users'
      ? ({ doc: () => ({ get: async () => ({ data: () => profile }) }) } as unknown as ReturnType<FakeDb['collection']>)
      : collection(name);
  };

  test('requests up to the budget pass and the next is 429 with Retry-After', async () => {
    withProfile();
    const h = handler();
    const route = withAuthorizedRequest(h, { rateLimit: 'parse' });
    for (let i = 0; i < RATE_LIMITS.parse.maxRequests; i++) expect((await route(post('/api/x', bearer))).status).toBe(200);
    const blocked = await route(post('/api/x', bearer));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(h).toHaveBeenCalledTimes(RATE_LIMITS.parse.maxRequests);
  });

  test('is keyed by uid: one class sharing an IP does not share a budget', async () => {
    withProfile();
    const route = withAuthorizedRequest(handler(), { rateLimit: 'parse' });
    const ipHeaders = { ...bearer, 'x-vercel-forwarded-for': IP };
    verifyIdToken.mockResolvedValue({ uid: 's1' });
    for (let i = 0; i < RATE_LIMITS.parse.maxRequests; i++) await route(post('/api/x', ipHeaders));
    expect((await route(post('/api/x', ipHeaders))).status).toBe(429);
    verifyIdToken.mockResolvedValue({ uid: 's2' });
    expect((await route(post('/api/x', ipHeaders))).status).toBe(200);
  });

  test('unauthenticated requests get 401 and do not touch the limiter', async () => {
    const route = withAuthorizedRequest(handler(), { rateLimit: 'parse' });
    expect((await route(post('/api/x'))).status).toBe(401);
    expect(fake.transactions).toBe(0);
  });

  test('a Firestore outage lets newly limited routes through (fail open)', async () => {
    withProfile();
    fake.failWith = new Error('UNAVAILABLE');
    const h = handler();
    expect((await withAuthorizedRequest(h, { rateLimit: 'parse' })(post('/api/x', bearer))).status).toBe(200);
    expect(h).toHaveBeenCalledTimes(1);
  });

  test('a Firestore outage still blocks routes that were limited before RT-11 (unchanged fail closed)', async () => {
    withProfile();
    fake.failWith = new Error('UNAVAILABLE');
    const res = await withAuthorizedRequest(handler(), { rateLimit: 'generate' })(post('/api/x', bearer));
    expect(res.status).toBe(429);
  });

  test('routes without the option are not rate limited', async () => {
    withProfile();
    const route = withAuthorizedRequest(handler());
    expect((await route(post('/api/x', bearer))).status).toBe(200);
    expect(fake.transactions).toBe(0);
  });
});

describe('enforceRateLimit for anonymous callers', () => {
  test('N+1th request from one trusted IP is blocked, another IP is unaffected', async () => {
    for (let i = 0; i < RATE_LIMITS.teacherCode.maxRequests; i++) {
      expect(await enforceRateLimit(post('/api/x', { 'x-vercel-forwarded-for': IP }), 'teacherCode')).toBeNull();
    }
    const blocked = await enforceRateLimit(post('/api/x', { 'x-vercel-forwarded-for': IP }), 'teacherCode');
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get('Retry-After')).toBeTruthy();
    expect(await enforceRateLimit(post('/api/x', { 'x-vercel-forwarded-for': '203.0.113.10' }), 'teacherCode')).toBeNull();
  });

  test('rotating x-forwarded-for cannot reset the budget', async () => {
    for (let i = 0; i < RATE_LIMITS.teacherCode.maxRequests; i++) {
      await enforceRateLimit(post('/api/x', { 'x-vercel-forwarded-for': IP, 'x-forwarded-for': `10.1.1.${i}` }), 'teacherCode');
    }
    const blocked = await enforceRateLimit(post('/api/x', { 'x-vercel-forwarded-for': IP, 'x-forwarded-for': '10.9.9.9' }), 'teacherCode');
    expect(blocked?.status).toBe(429);
  });
});

// Each real route is wired to its budget: with the bucket full the route answers 429 before running its handler.
describe('route wiring', () => {
  type Case = [path: string, load: () => Promise<{ POST: (req: NextRequest) => Promise<Response> }>, kind: RateLimitKind];
  const authed: Case[] = [
    ['/api/ai/generate', () => import('../src/app/api/ai/generate/route'), 'generate'],
    ['/api/ai/parse', () => import('../src/app/api/ai/parse/route'), 'parse'],
    ['/api/ai/synthesize-rubric', () => import('../src/app/api/ai/synthesize-rubric/route'), 'rubric'],
    ['/api/ai/generate-title', () => import('../src/app/api/ai/generate-title/route'), 'title'],
    ['/api/chat', () => import('../src/app/api/chat/route'), 'chat'],
    ['/api/chat/limits', () => import('../src/app/api/chat/limits/route'), 'limitsChat'],
    ['/api/notebook/chat', () => import('../src/app/api/notebook/chat/route'), 'notebook'],
    ['/api/student/tutor', () => import('../src/app/api/student/tutor/route'), 'tutor'],
    ['/api/grade', () => import('../src/app/api/grade/route'), 'grade'],
    ['/api/teacher/network/portfolio', () => import('../src/app/api/teacher/network/portfolio/route'), 'portfolio'],
    ['/api/research/respond', () => import('../src/app/api/research/respond/route'), 'research'],
    ['/api/checkout', () => import('../src/app/api/checkout/route'), 'checkout'],
    ['/api/support/report', () => import('../src/app/api/support/report/route'), 'support'],
    ['/api/auth/register', () => import('../src/app/api/auth/register/route'), 'register'],
    ['/api/assignments', () => import('../src/app/api/assignments/route'), 'write'],
    ['/api/courses', () => import('../src/app/api/courses/route'), 'write'],
    ['/api/submissions', () => import('../src/app/api/submissions/route'), 'write'],
    ['/api/student/enrollment', () => import('../src/app/api/student/enrollment/route'), 'write'],
    ['/api/teacher/network/invites', () => import('../src/app/api/teacher/network/invites/route'), 'write'],
    ['/api/teacher/network/membership', () => import('../src/app/api/teacher/network/membership/route'), 'write'],
    ['/api/teacher/students/cleanup', () => import('../src/app/api/teacher/students/cleanup/route'), 'write'],
    ['/api/admin/firestore', () => import('../src/app/api/admin/firestore/route'), 'write'],
  ];

  test.each(authed)('%s answers 429 + Retry-After once its uid budget is spent', async (path, load, kind) => {
    const { POST } = await load();
    exhaust(kind, 'u1');
    const res = await POST(post(path, bearer));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  const anonymous: Case[] = [
    ['/api/auth/teacher-code', () => import('../src/app/api/auth/teacher-code/route'), 'teacherCode'],
    ['/api/auth/request-access', () => import('../src/app/api/auth/request-access/route'), 'requestAccess'],
  ];

  test.each(anonymous)('%s answers 429 + Retry-After once its IP budget is spent', async (path, load, kind) => {
    const { POST } = await load();
    exhaust(kind, `ip_${IP}`);
    const res = await POST(post(path, { 'x-vercel-forwarded-for': IP }, { action: 'validate', code: 'ABC' }));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  test('/api/auth/session is limited per verified uid', async () => {
    const { POST } = await import('../src/app/api/auth/session/route');
    exhaust('session', 'u1');
    const res = await POST(post('/api/auth/session', {}, { idToken: 'tok' }));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  test('/api/github/stats is limited per IP', async () => {
    const { GET } = await import('../src/app/api/github/stats/route');
    exhaust('githubStats', `ip_${IP}`);
    const res = await GET(new NextRequest('https://scorpio.test/api/github/stats', { headers: { 'x-vercel-forwarded-for': IP } }));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  test('admin teacher-code actions are not charged to the public IP bucket', async () => {
    const { POST } = await import('../src/app/api/auth/teacher-code/route');
    exhaust('teacherCode', `ip_${IP}`);
    verifyIdToken.mockResolvedValue({ uid: 'admin1', admin: true });
    const res = await POST(post('/api/auth/teacher-code', { ...bearer, 'x-vercel-forwarded-for': IP }, { action: 'list' }));
    expect(res.status).not.toBe(429);
  });
});

// Firebase Hosting sends no trusted IP header: a tiny shared bucket would lock every visitor out.
describe('anonymous routes with no trusted client IP', () => {
  const noIp = (extra: Record<string, string> = {}) => post('/api/auth/teacher-code', extra, { action: 'validate', code: 'X' });

  test('a burst of 100 teacher-code validates is not limited, the 601st in the window is', async () => {
    for (let i = 0; i < 100; i++) expect(await enforceRateLimit(noIp({ 'x-forwarded-for': `10.0.0.${i}` }), 'teacherCode')).toBeNull();
    fake.docs.set('rate_limits/anon_teacherCode_anon', { count: 600, windowStart: Date.now() });
    const blocked = await enforceRateLimit(noIp({ 'x-forwarded-for': '10.9.9.9' }), 'teacherCode');
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get('Retry-After')).toBeTruthy();
  });

  test('the 600th call passes and the real 601st is blocked', async () => {
    for (let i = 0; i < 600; i++) expect(await enforceRateLimit(noIp(), 'requestAccess')).toBeNull();
    expect((await enforceRateLimit(noIp(), 'requestAccess'))?.status).toBe(429);
  });

  test('a Firestore outage does not block anonymous no-IP callers', async () => {
    fake.failWith = new Error('UNAVAILABLE');
    expect(await enforceRateLimit(noIp(), 'teacherCode')).toBeNull();
  });

  test('with a Vercel header the per-IP limit still applies and x-forwarded-for rotation does not bypass it', async () => {
    for (let i = 0; i < RATE_LIMITS.teacherCode.maxRequests; i++) {
      expect(await enforceRateLimit(noIp({ 'x-vercel-forwarded-for': IP, 'x-forwarded-for': `10.2.2.${i}` }), 'teacherCode')).toBeNull();
    }
    expect((await enforceRateLimit(noIp({ 'x-vercel-forwarded-for': IP, 'x-forwarded-for': '10.8.8.8' }), 'teacherCode'))?.status).toBe(429);
  });

  test('github/stats with no IP is never limited and writes nothing', async () => {
    for (let i = 0; i < 100; i++) expect(await enforceRateLimit(post('/api/github/stats', { 'x-forwarded-for': `10.3.3.${i}` }), 'githubStats')).toBeNull();
    expect(fake.transactions).toBe(0);
  });
});
