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
const MONTH = new Date().toISOString().slice(0, 7);
/** The month's spend has reached the cap. */
const capReached = () => org().set({ aiUsageCurrent: 1000, aiUsageMonth: MONTH }, { merge: true });
/** No cap, and every bucket is empty: this month's free credit used, no bonus, no paid. */
const balanceEmpty = () => org().set({ aiBudgetLimit: 0, aiFreeMonth: MONTH, aiFreeUsedCents: 100, aiBonusCents: 0, aiPaidCents: 0 }, { merge: true });
// Test-only value; the real secret comes from the deployment environment.
const TEST_SECRET = 'test-only-landing-cookie-secret-0123456789';

const org = () => adminDb.collection('organizations').doc(ORG);
const okResponse = (text = 'ok') => ({
  ok: true, status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }),
}) as unknown as Response;

let ipCounter = 0;
const newIp = () => `203.0.113.${(++ipCounter % 250) + 1}`;

function send(opts: { ip?: string; cookie?: string; visitorId?: string; message?: string; spoofXff?: string; noIp?: boolean } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-vercel-forwarded-for': opts.ip ?? '198.51.100.7' };
  if (opts.spoofXff) headers['x-forwarded-for'] = opts.spoofXff;
  if (opts.noIp) delete headers['x-vercel-forwarded-for'];
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
  // A $10 monthly spend cap and $50 of paid balance; spend only counts for the month it was written in.
  await org().set({ aiBudgetLimit: 1000, aiUsageCurrent: 0, aiUsageMonth: MONTH, aiUsageReserved: 0, aiPaidCents: 5000 });
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

describe('trusted client IP source', () => {
  test('varying x-forwarded-for alone does not change the per-IP bucket', async () => {
    const ip = newIp();
    let rejected = 0;
    for (let i = 0; i < 40; i++) {
      await wipe('rate_limits');
      if ((await send({ ip, spoofXff: `9.9.9.${i}` })).status === 429) rejected++;
    }
    expect(rejected).toBeGreaterThan(0);
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(30);
  });

  test('varying x-vercel-forwarded-for gives separate per-IP buckets', async () => {
    for (let i = 0; i < 40; i++) {
      await wipe('rate_limits');
      expect((await send({ ip: `192.0.2.${i + 1}` })).status).toBe(200);
    }
  });

  test('with no trusted IP header there is no per-IP limiting, but cookie and daily caps still apply', async () => {
    const first = await send({ noIp: true });
    expect(first.status).toBe(200);
    const cookie = cookieOf(first);
    for (let i = 0; i < 9; i++) expect((await send({ noIp: true, cookie })).status).toBe(200);
    expect((await send({ noIp: true, cookie })).status).toBe(429);
    process.env.LANDING_DAILY_CAP = '10';
    expect((await send({ noIp: true })).status).toBe(503);
    expect((await adminDb.collection('landing_visitors').get()).docs.some(d => d.id.startsWith('ip_'))).toBe(false);
  });

  test('the real per-minute limiter (not wiped) allows normal use then throttles bursts', async () => {
    const ip = newIp();
    const cookie = cookieOf(await send({ ip }));
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await send({ ip, cookie })).status);
    expect(statuses.slice(0, 4)).toEqual([200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });
});

describe('fail closed on missing or exhausted landing budget', () => {
  test('LANDING_ORG_ID unset returns 503 and makes no provider call', async () => {
    delete process.env.LANDING_ORG_ID;
    const res = await send({ ip: newIp() });
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('landing org at its monthly spend cap returns 503 and makes no provider call', async () => {
    await capReached();
    const res = await send({ ip: newIp() });
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('landing org with an empty balance returns 503 and makes no provider call', async () => {
    await balanceEmpty();
    const res = await send({ ip: newIp() });
    expect(res.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('spend from an earlier month does not count against this month\'s cap', async () => {
    await org().set({ aiUsageCurrent: 1000, aiUsageMonth: '2000-01' }, { merge: true });
    expect((await send({ ip: newIp() })).status).toBe(200);
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
    await balanceEmpty();
    await expect(billingContext.run({ organizationId: ORG, type: 'landing' }, () => model.generateContent('hi'))).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('research exemption is retained but visible', () => {
  test('research with an exhausted budget still calls the provider and logs the swallowed error', async () => {
    await balanceEmpty();
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

  test('logs a warning once the landing org passes 80% of its monthly cap', async () => {
    await org().set({ aiUsageCurrent: 850, aiUsageMonth: MONTH }, { merge: true });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await send({ ip: newIp() });
    expect(res.status).toBe(200);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/80%/);
  });

  test('with no cap, logs a warning once 80% of this month\'s spend plus balance is used', async () => {
    await org().set({ aiBudgetLimit: 0, aiUsageCurrent: 850, aiUsageMonth: MONTH, aiFreeMonth: MONTH, aiFreeUsedCents: 100, aiPaidCents: 150 }, { merge: true });
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
