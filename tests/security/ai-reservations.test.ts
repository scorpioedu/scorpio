import * as admin from 'firebase-admin';
jest.mock('../../src/lib/firebase-admin', () => {
  const adm: typeof admin = jest.requireActual('firebase-admin');
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
  if (!adm.apps.length) adm.initializeApp({ projectId: 'demo-scorpio-security' });
  return { adminDb: adm.firestore(), adminFieldWithValue: adm.firestore.FieldValue, adminAuth: {} };
});
import { adminDb } from '../../src/lib/firebase-admin';
import { billingContext } from '../../src/lib/billing-context';
import { model } from '../../src/lib/ai/config';
import { releaseStaleReservations, getActiveTokenRates } from '../../functions/src/metering';

const ORG = 'res-org';
const PRIOR_RESERVED = 1;
const org = () => adminDb.collection('organizations').doc(ORG);
const reservations = () => adminDb.collection('ai_reservations').where('organizationId', '==', ORG).get();
const callModel = (prompt = 'hello world') => billingContext.run({ organizationId: ORG, userId: undefined, type: 'grading' }, () => model.generateContent(prompt));
const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

beforeAll(() => { process.env.GEMINI_API_KEY = 'test-key-not-real'; });
beforeEach(async () => {
  const old = await adminDb.collection('ai_reservations').where('organizationId', '==', ORG).get();
  await Promise.all(old.docs.map(d => d.ref.delete()));
  await org().set({ planId: 'pro', subscriptionStatus: 'active', aiBudgetLimit: 1000, aiUsageCurrent: 0, aiUsageReserved: PRIOR_RESERVED });
});
afterEach(() => { jest.restoreAllMocks(); });
afterAll(async () => { await Promise.all(admin.apps.filter(Boolean).map(app => app!.delete())); });

describe('provider call success path (characterization)', () => {
  test('settles actual usage, releases the hold and records the reservation as settled', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(okResponse({
      candidates: [{ content: { parts: [{ text: 'hi' }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 10 },
    }));
    await callModel();
    const rates = getActiveTokenRates();
    const expected = 100 * rates.input + 50 * rates.output;
    const data = (await org().get()).data()!;
    expect(data.aiUsageReserved).toBeCloseTo(PRIOR_RESERVED);
    expect(data.aiUsageCurrent).toBeCloseTo(expected);
    const docs = (await reservations()).docs.map(d => d.data());
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ status: 'settled' });
    expect(docs[0].costCents).toBeCloseTo(expected);
  });

  test('a non-OK provider status settles at zero cost and throws', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 } as unknown as Response);
    await expect(callModel()).rejects.toThrow('AI provider returned 503');
    const data = (await org().get()).data()!;
    expect(data.aiUsageReserved).toBeCloseTo(PRIOR_RESERVED);
    expect(data.aiUsageCurrent).toBe(0);
    expect((await reservations()).docs[0].data().status).toBe('settled');
  });
});

describe('provider call failure paths release the hold', () => {
  test('a fetch timeout restores aiUsageReserved and charges the input estimate', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'));
    await expect(callModel()).rejects.toThrow('timed out');
    const data = (await org().get()).data()!;
    expect(data.aiUsageReserved).toBeCloseTo(PRIOR_RESERVED);
    const docs = (await reservations()).docs.map(d => d.data());
    expect(docs).toHaveLength(1);
    expect(docs[0].status).toBe('settled');
    expect(docs[0].costCents).toBeGreaterThan(0);
    const rates = getActiveTokenRates();
    const analytics = await adminDb.collection('usage_analytics').where('organizationId', '==', ORG).get();
    const rec = analytics.docs.map(d => d.data()).find(d => d.costCents === docs[0].costCents)!;
    expect(rec.outputTokens).toBe(0);
    expect(rec.costCents).toBeCloseTo(rec.inputTokens * rates.input);
  });

  test('a malformed response body restores aiUsageReserved', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token'); } } as unknown as Response);
    await expect(callModel()).rejects.toThrow('Unexpected token');
    expect((await org().get()).data()!.aiUsageReserved).toBeCloseTo(PRIOR_RESERVED);
    expect((await reservations()).docs[0].data().status).toBe('settled');
  });

  test('missing usageMetadata settles with the estimate, warns and does not throw', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch').mockResolvedValue(okResponse({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }));
    const result = await callModel();
    expect((await result.response).text()).toBe('hi');
    expect(warn).toHaveBeenCalled();
    const data = (await org().get()).data()!;
    expect(data.aiUsageReserved).toBeCloseTo(PRIOR_RESERVED);
    expect(data.aiUsageCurrent).toBeGreaterThan(0);
    expect((await reservations()).docs[0].data().status).toBe('settled');
  });
});

describe('releaseStaleReservations', () => {
  const ageMs = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000);
  const seed = async (id: string, minutesOld: number, maxCost: number, status = 'pending') =>
    adminDb.collection('ai_reservations').doc(id).set({ organizationId: ORG, userId: null, type: 'grading', maxCost, createdAt: ageMs(minutesOld), status });

  test('expires a reservation older than 30 minutes exactly once and releases its hold', async () => {
    await org().update({ aiUsageReserved: 3 });
    await seed('res-stale', 45, 2);
    await seed('res-fresh', 5, 0.5);
    expect(await releaseStaleReservations(adminDb)).toBe(1);
    expect(await releaseStaleReservations(adminDb)).toBe(0);
    expect((await org().get()).data()!.aiUsageReserved).toBeCloseTo(1);
    expect((await adminDb.collection('ai_reservations').doc('res-stale').get()).data()!.status).toBe('expired');
    expect((await adminDb.collection('ai_reservations').doc('res-fresh').get()).data()!.status).toBe('pending');
  });

  test('never drives aiUsageReserved negative', async () => {
    await org().update({ aiUsageReserved: 0.2 });
    await seed('res-over', 60, 5);
    await releaseStaleReservations(adminDb);
    expect((await org().get()).data()!.aiUsageReserved).toBe(0);
  });

  test('leaves settled reservations alone', async () => {
    await seed('res-settled', 90, 2, 'settled');
    expect(await releaseStaleReservations(adminDb)).toBe(0);
    expect((await org().get()).data()!.aiUsageReserved).toBeCloseTo(PRIOR_RESERVED);
  });
});
