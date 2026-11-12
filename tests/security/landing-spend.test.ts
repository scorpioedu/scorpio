import * as admin from 'firebase-admin';
import { NextRequest } from 'next/server';
jest.mock('../../src/lib/firebase-admin', () => {
  const adm: typeof admin = jest.requireActual('firebase-admin');
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
  if (!adm.apps.length) adm.initializeApp({ projectId: 'demo-scorpio-security' });
  return { adminDb: adm.firestore(), adminFieldWithValue: adm.firestore.FieldValue, adminAuth: {} };
});
import { adminDb } from '../../src/lib/firebase-admin';
import { billingContext } from '../../src/lib/billing-context';
import { model } from '../../src/lib/ai/config';
import { POST } from '../../src/app/api/chat/landing/route';

const ORG = 'landing-org';
// Test-only value; the real secret comes from the deployment environment.
const TEST_SECRET = 'test-only-landing-cookie-secret-0123456789';

const org = () => adminDb.collection('organizations').doc(ORG);
const okResponse = (text = 'ok') => ({
  ok: true, status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }),
}) as unknown as Response;

let ipCounter = 0;
const newIp = () => `203.0.113.${(++ipCounter % 250) + 1}`;

function send(opts: { ip?: string; cookie?: string; visitorId?: string; message?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-forwarded-for': opts.ip ?? '198.51.100.7' };
  if (opts.cookie) headers.cookie = opts.cookie;
  return POST(new NextRequest('https://scorpio.test/api/chat/landing', {
    method: 'POST', headers,
    body: JSON.stringify({ message: opts.message ?? 'What is Scorpio?', visitorId: opts.visitorId ?? `v_${Math.random().toString(36).slice(2)}` }),
  }));
}
const cookieOf = (res: Response) => (res.headers.get('set-cookie') || '').split(';')[0];

async function wipe(col: string) {
  const snap = await adminDb.collection(col).get();
  await Promise.all(snap.docs.map(d => d.ref.delete()));
}

let fetchSpy: jest.SpyInstance;
beforeEach(async () => {
  await Promise.all(['landing_visitors', 'landing_daily', 'rate_limits', 'ai_reservations'].map(wipe));
  await org().set({ planId: 'pro', subscriptionStatus: 'active', aiBudgetLimit: 1000, aiUsageCurrent: 0, aiUsageReserved: 0 });
  process.env.GEMINI_API_KEY = 'test-key-not-real';
  process.env.LANDING_ORG_ID = ORG;
  process.env.LANDING_VISITOR_COOKIE_SECRET = TEST_SECRET;
  delete process.env.LANDING_DAILY_CAP;
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse());
});
afterEach(() => { jest.restoreAllMocks(); });
afterAll(async () => { await Promise.all(admin.apps.filter(Boolean).map(app => app!.delete())); });

describe('visitor identity and per-visitor limit', () => {
  test('normal visitor: first reply is 200, sets an httpOnly signed cookie and reports remaining', async () => {
    const res = await send({ ip: newIp() });
    expect(res.status).toBe(200);
    expect((await res.json()).remaining).toBe(9);
    expect(res.headers.get('set-cookie') || '').toMatch(/HttpOnly/i);
    expect(cookieOf(res)).toMatch(/^\w+=[\w-]+\.[\w-]+$/);
  });

  test('11th message with a fresh visitorId each time but the same cookie is rejected 429', async () => {
    const ip = newIp();
    const first = await send({ ip });
    const cookie = cookieOf(first);
    for (let i = 0; i < 9; i++) {
      await wipe('rate_limits'); // isolate the visitor counter from the per-minute limiter
      expect((await send({ ip, cookie })).status).toBe(200);
    }
    await wipe('rate_limits');
    const eleventh = await send({ ip, cookie });
    expect(eleventh.status).toBe(429);
    expect((await eleventh.json()).limitReached).toBe(true);
  });

  test('a forged cookie signature is not honoured (a new identity is issued)', async () => {
    const res = await send({ ip: newIp(), cookie: 'scorpio_lv=forged-id.AAAA' });
    expect(res.status).toBe(200);
    expect(cookieOf(res)).not.toContain('forged-id');
  });

  test('discarding the cookie does not reset the per-IP daily limit', async () => {
    const ip = newIp();
    let rejected = 0;
    for (let i = 0; i < 40; i++) {
      // Clear the short-window rate limiter so only the daily IP counter can stop us.
      await wipe('rate_limits');
      if ((await send({ ip })).status === 429) rejected++;
    }
    expect(rejected).toBeGreaterThan(0);
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(30);
  });
});

describe('fail closed on missing or exhausted landing budget', () => {
  test('LANDING_ORG_ID unset returns 503 and makes no provider call', async () => {
    delete process.env.LANDING_ORG_ID;
    const res = await send({ ip: newIp() });
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('exhausted landing org budget returns 503 and makes no provider call', async () => {
    await org().set({ aiUsageCurrent: 1000 }, { merge: true });
    const res = await send({ ip: newIp() });
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('missing cookie secret returns 503 and makes no provider call', async () => {
    delete process.env.LANDING_VISITOR_COOKIE_SECRET;
    const res = await send({ ip: newIp() });
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('landing type is no longer exempt from the organization requirement', async () => {
    await expect(billingContext.run({ organizationId: '', type: 'landing' }, () => model.generateContent('hi'))).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('landing type with an exhausted budget throws instead of calling the provider', async () => {
    await org().set({ aiUsageCurrent: 1000 }, { merge: true });
    await expect(billingContext.run({ organizationId: ORG, type: 'landing' }, () => model.generateContent('hi'))).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('research exemption is retained but visible', () => {
  test('research with an exhausted budget still calls the provider and logs the swallowed error', async () => {
    await org().set({ aiUsageCurrent: 1000 }, { merge: true });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await billingContext.run({ organizationId: ORG, type: 'research' }, () => model.generateContent('hi'));
    expect((await res.response).text()).toBe('ok');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(errSpy.mock.calls.flat().join(' ')).toMatch(/research.*reservation/i);
  });
});

describe('global daily cap, output cap and budget alert', () => {
  test('the daily cap rejects further messages from fresh visitors and makes no provider call', async () => {
    process.env.LANDING_DAILY_CAP = '3';
    for (let i = 0; i < 3; i++) expect((await send({ ip: newIp() })).status).toBe(200);
    fetchSpy.mockClear();
    const res = await send({ ip: newIp() });
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
    const day = new Date().toISOString().slice(0, 10);
    expect((await adminDb.collection('landing_daily').doc(day).get()).data()!.count).toBe(3);
  });

  test('provider request caps maxOutputTokens at 512 or lower', async () => {
    await send({ ip: newIp() });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.generationConfig.maxOutputTokens).toBeLessThanOrEqual(512);
  });

  test('logs a warning once the landing org passes 80% of its budget', async () => {
    await org().set({ aiUsageCurrent: 850 }, { merge: true });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await send({ ip: newIp() });
    expect(res.status).toBe(200);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/80%/);
  });

  test('does not warn while the landing org is below 80% of its budget', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await send({ ip: newIp() });
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/80%/);
  });
});
