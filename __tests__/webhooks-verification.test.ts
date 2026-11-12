/**
 * RT-19 / E-004: the Polar webhook route with the REAL @polar-sh/sdk validateEvent (no mock).
 * Requests are signed in the standard-webhooks scheme with a test secret, exactly as the SDK verifies them.
 * The route answers 401 (not 403) for every verification failure; these tests pin that and that nothing is written.
 */
import { createHmac } from 'node:crypto';
import { createFakeBillingDb, type FakeBillingDb } from '../tests/helpers/fake-billing-db';

let fake: FakeBillingDb;
jest.mock('../src/lib/firebase-admin', () => ({
  get adminDb() { return fake.db; },
}));
import { POST } from '../src/app/api/webhooks/polar/route';

const SECRET = 'test-webhook-secret';
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** standard-webhooks signature: HMAC-SHA256 over "id.timestamp.body" keyed by the secret bytes, base64, "v1," prefix. */
function sign(id: string, timestamp: number, body: string, secret = SECRET): string {
  return 'v1,' + createHmac('sha256', Buffer.from(secret, 'utf-8')).update(`${id}.${timestamp}.${body}`).digest('base64');
}

const body = JSON.stringify({
  type: 'subscription.canceled',
  data: { id: 'sub', customerId: 'cust', status: 'canceled', metadata: { organizationId: 'org1', planId: 'standard_monthly' } },
});

function send(headers: Record<string, string>, payload = body): Promise<Response> {
  return POST(new Request('http://localhost/api/webhooks/polar', { method: 'POST', headers, body: payload }));
}
function signed(over: { id?: string; timestamp?: number; secret?: string; payload?: string } = {}) {
  const id = over.id ?? 'msg_1';
  const timestamp = over.timestamp ?? nowSeconds();
  const payload = over.payload ?? body;
  return { 'webhook-id': id, 'webhook-timestamp': String(timestamp), 'webhook-signature': sign(id, timestamp, payload, over.secret) };
}

const without = (headers: Record<string, string>, key: string) =>
  Object.fromEntries(Object.entries(headers).filter(([name]) => name !== key));

beforeEach(() => {
  fake = createFakeBillingDb();
  fake.docs['organizations/org1'] = { ownerId: 't1', subscriptionStatus: 'active', planId: 'standard_monthly', aiUsageCurrent: 7 };
  process.env.POLAR_WEBHOOK_SECRET = SECRET;
});
afterEach(() => { delete process.env.POLAR_WEBHOOK_SECRET; });

const untouched = () => {
  expect(fake.writes).toEqual([]);
  expect(fake.docs['organizations/org1']).toEqual({ ownerId: 't1', subscriptionStatus: 'active', planId: 'standard_monthly', aiUsageCurrent: 7 });
};

describe('Polar webhook signature verification (real validateEvent)', () => {
  test('no signature headers -> 401 and no writes', async () => {
    const res = await send({});
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
    untouched();
  });

  test('missing webhook-signature -> 401 and no writes', async () => {
    const headers = without(signed(), 'webhook-signature');
    expect((await send(headers)).status).toBe(401);
    untouched();
  });

  test('missing webhook-id -> 401 and no writes', async () => {
    const headers = without(signed(), 'webhook-id');
    expect((await send(headers)).status).toBe(401);
    untouched();
  });

  test('missing webhook-timestamp -> 401 and no writes', async () => {
    const headers = without(signed(), 'webhook-timestamp');
    expect((await send(headers)).status).toBe(401);
    untouched();
  });

  test('signature made with a different secret -> 401 and no writes', async () => {
    expect((await send(signed({ secret: 'someone-elses-secret' }))).status).toBe(401);
    untouched();
  });

  test('body tampered after signing -> 401 and no writes', async () => {
    const headers = signed();
    const tampered = body.replace('canceled', 'active');
    expect((await send(headers, tampered)).status).toBe(401);
    untouched();
  });

  test('signature for another webhook-id (replayed under a new id) -> 401', async () => {
    const headers = { ...signed({ id: 'msg_1' }), 'webhook-id': 'msg_2' };
    expect((await send(headers)).status).toBe(401);
    untouched();
  });

  test('timestamp older than the 5 minute tolerance -> 401 even with a valid signature', async () => {
    expect((await send(signed({ timestamp: nowSeconds() - 6 * 60 }))).status).toBe(401);
    untouched();
  });

  test('timestamp too far in the future -> 401 even with a valid signature', async () => {
    expect((await send(signed({ timestamp: nowSeconds() + 6 * 60 }))).status).toBe(401);
    untouched();
  });

  test('malformed JSON with a valid signature -> 401 and no writes', async () => {
    const payload = '{not json';
    expect((await send(signed({ payload }), payload)).status).toBe(401);
    untouched();
  });

  test('unknown event type with a valid signature is rejected by the SDK parser -> 401 and no writes', async () => {
    const payload = JSON.stringify({ type: 'something.else', data: {} });
    expect((await send(signed({ payload }), payload)).status).toBe(401);
    untouched();
  });

  test('a valid signature on a payload that fails the SDK schema is not applied -> 401 and no writes', async () => {
    // The signed body is minimal, so the SDK schema parse fails after the signature check succeeds.
    expect((await send(signed())).status).toBe(401);
    untouched();
  });

  test('unset POLAR_WEBHOOK_SECRET fails closed -> 401 and no writes', async () => {
    delete process.env.POLAR_WEBHOOK_SECRET;
    expect((await send(signed())).status).toBe(401);
    untouched();
  });

  test('empty body -> 401 and no writes', async () => {
    expect((await send(signed({ payload: '' }), '')).status).toBe(401);
    untouched();
  });

  // Positive control: proves the 401s above come from verification, not from a broken harness.
  describe('a correctly signed, schema-valid event', () => {
    const customerDeleted = JSON.stringify({
      type: 'customer.deleted',
      timestamp: '2026-11-01T00:00:00Z',
      data: {
        id: 'c1', created_at: '2026-11-01T00:00:00Z', modified_at: '2026-11-01T00:00:00Z', metadata: {}, external_id: null,
        email: 'a@example.test', email_verified: true, name: null, billing_address: null, tax_id: null,
        organization_id: 'o1', deleted_at: null, avatar_url: 'https://example.test/a.png',
      },
    });

    test('passes verification; non-subscription events are acknowledged without any write', async () => {
      const res = await send(signed({ payload: customerDeleted }), customerDeleted);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      untouched();
    });

    test('the same event with a wrong-secret signature is rejected', async () => {
      expect((await send(signed({ payload: customerDeleted, secret: 'wrong' }), customerDeleted)).status).toBe(401);
      untouched();
    });

    test('the same event with one byte changed after signing is rejected', async () => {
      expect((await send(signed({ payload: customerDeleted }), customerDeleted.replace('c1', 'c2'))).status).toBe(401);
      untouched();
    });
  });
});
