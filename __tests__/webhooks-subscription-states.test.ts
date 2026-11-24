/**
 * RT-19 / E-004: how the Polar webhook route applies verified subscription events, and (SCO-15) AI credit orders.
 * validateEvent is mocked here on purpose (full Polar payloads are huge); the real signature path is covered
 * in webhooks-verification.test.ts. These tests pin what the handler writes for each state and when it writes nothing.
 * Subscription events only record billing state now; credit comes from order.paid / order.refunded via the real grantCredit.
 */
import { createFakeBillingDb, type FakeBillingDb } from '../tests/helpers/fake-billing-db';

let fake: FakeBillingDb;
let credit: ReturnType<typeof createCreditDb>;
let useCredit = false;
jest.mock('../src/lib/firebase-admin', () => ({
  get adminDb() { return useCredit ? credit.db : fake.db; },
}));

/** Path-based Firestore double with sub-collections and equality queries, for the credit ledger. */
function createCreditDb() {
  const docs: Record<string, Record<string, unknown> | undefined> = {};
  const get = (obj: unknown, path: string) => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
  const collection = (colPath: string): unknown => ({
    doc: (id: string = `auto${Object.keys(docs).length}`) => docRef(`${colPath}/${id}`),
    where(field: string, _op: string, value: unknown) { return query(colPath, [[field, value]]); },
  });
  const query = (colPath: string, filters: Array<[string, unknown]>): unknown => ({
    where: (field: string, _op: string, value: unknown) => query(colPath, [...filters, [field, value]]),
    get: async () => ({
      docs: Object.entries(docs)
        .filter(([path, data]) => data && path.startsWith(`${colPath}/`) && !path.slice(colPath.length + 1).includes('/') && filters.every(([f, v]) => get(data, f) === v))
        .map(([, data]) => ({ data: () => data })),
    }),
  });
  const docRef = (path: string) => ({ path, id: path.split('/').pop()!, collection: (name: string) => collection(`${path}/${name}`) });
  return {
    docs,
    db: {
      collection: (name: string) => collection(name),
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
        get: async (ref: { path: string }) => ({ exists: docs[ref.path] !== undefined, data: () => docs[ref.path] }),
        update: (ref: { path: string }, data: Record<string, unknown>) => { docs[ref.path] = { ...docs[ref.path], ...data }; },
        create: (ref: { path: string }, data: Record<string, unknown>) => { docs[ref.path] = data; },
      }),
    },
  };
}
const mockValidate = jest.fn();
jest.mock('@polar-sh/sdk/webhooks', () => ({ validateEvent: (...args: unknown[]) => mockValidate(...args) }));
import { createHash } from 'node:crypto';
import { POST } from '../src/app/api/webhooks/polar/route';

const ORG = 'organizations/org1';
const ledger = () => Object.keys(credit.docs).filter(k => k.startsWith(`${ORG}/credit_ledger/`));
const eventKey = (id: string) => `billing_events/${createHash('sha256').update(id).digest('hex')}`;

interface Sub { id?: string; customerId?: string; status: string; modifiedAt?: string; createdAt?: string; currentPeriodStart?: string; metadata?: { organizationId?: string; planId?: string } }
const sub = (over: Partial<Sub> = {}): Sub => ({
  id: 'sub1', customerId: 'cust1', status: 'active', modifiedAt: '2026-11-02T00:00:00.000Z', createdAt: '2026-11-01T00:00:00.000Z',
  currentPeriodStart: '2026-11-01T00:00:00.000Z', metadata: { organizationId: 'org1', planId: 'standard_monthly' }, ...over,
});
const eventOf = (type: string, data: Sub) => ({ type, data });

function send(event: { type: string; data: Sub }, webhookId: string | null = 'evt-1'): Promise<Response> {
  mockValidate.mockReturnValue(event);
  const headers: Record<string, string> = webhookId ? { 'webhook-id': webhookId } : {};
  return POST(new Request('http://localhost/api/webhooks/polar', { method: 'POST', headers, body: JSON.stringify(event) }));
}

beforeEach(() => {
  mockValidate.mockReset();
  useCredit = false;
  fake = createFakeBillingDb();
  fake.docs[ORG] = { ownerId: 't1', subscriptionStatus: 'active', planId: 'standard_monthly', billingUpdatedAt: 0, billingPeriodStart: '2026-11-01T00:00:00.000Z', aiUsageCurrent: 40, notebookUsageCurrent: 3 };
});

describe('verification failures (validateEvent throws)', () => {
  test.each([
    ['a signature error', new Error('No matching signature found')],
    ['an unknown event type', new Error('Unknown event type')],
    ['a TypeError from a missing secret', new TypeError('The first argument must be of type string')],
  ])('%s -> 401 "Invalid signature" and no Firestore writes', async (_name, error) => {
    mockValidate.mockImplementation(() => { throw error; });
    const res = await POST(new Request('http://localhost/api/webhooks/polar', { method: 'POST', headers: { 'webhook-id': 'x' }, body: '{}' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
    expect(fake.writes).toEqual([]);
  });

  test('the route hands the raw body, the headers and POLAR_WEBHOOK_SECRET to validateEvent', async () => {
    process.env.POLAR_WEBHOOK_SECRET = 'secret-for-test';
    try {
      await send(eventOf('subscription.active', sub()), 'evt-args');
    } finally { delete process.env.POLAR_WEBHOOK_SECRET; }
    const [body, headers, secret] = mockValidate.mock.calls[0];
    expect(JSON.parse(body)).toMatchObject({ type: 'subscription.active' });
    expect(headers).toMatchObject({ 'webhook-id': 'evt-args' });
    expect(secret).toBe('secret-for-test');
  });
});

describe('subscription state events', () => {
  test.each([
    ['subscription.canceled', 'canceled'],
    ['subscription.revoked', 'revoked'],
    ['subscription.updated', 'past_due'],
    ['subscription.active', 'active'],
    ['subscription.created', 'trialing'],
    ['subscription.uncanceled', 'active'],
  ])('%s with status %s is recorded on the organization', async (type, status) => {
    const res = await send(eventOf(type, sub({ status })));
    expect(res.status).toBe(200);
    expect(fake.docs[ORG]).toMatchObject({
      subscriptionStatus: status, subscriptionId: 'sub1', polarCustomerId: 'cust1', planId: 'standard_monthly',
      billingUpdatedAt: Date.parse('2026-11-02T00:00:00.000Z'),
    });
    expect(fake.writes).toEqual([`update ${ORG}`, `create ${eventKey('evt-1')}`]);
  });

  test('subscription events never touch plan, usage counters or credit', async () => {
    fake.docs[ORG]!.aiPaidCents = 700;
    let modified = 1;
    for (const [type, status] of [['subscription.canceled', 'canceled'], ['subscription.revoked', 'revoked'], ['subscription.updated', 'past_due'], ['subscription.active', 'active']]) {
      await send(eventOf(type, sub({ status, currentPeriodStart: '2026-12-01T00:00:00.000Z', modifiedAt: `2026-11-0${++modified}T00:00:00.000Z` })), `evt-${status}`);
      expect(fake.docs[ORG]).toMatchObject({ subscriptionStatus: status, planId: 'standard_monthly', aiUsageCurrent: 40, notebookUsageCurrent: 3, aiPaidCents: 700 });
    }
    expect(fake.docs[ORG]).not.toHaveProperty('lastRenewalAt');
    expect(fake.docs[ORG]!.billingPeriodStart).toBe('2026-11-01T00:00:00.000Z');
  });

  test('metadata planId is ignored: the plan is never written', async () => {
    await send(eventOf('subscription.canceled', sub({ status: 'canceled', metadata: { organizationId: 'org1', planId: 'department_monthly' } })), 'e1');
    expect(fake.docs[ORG]!.planId).toBe('standard_monthly');
    fake.docs[ORG] = { ownerId: 't1' };
    await send(eventOf('subscription.canceled', sub({ status: 'canceled', metadata: { organizationId: 'org1' }, modifiedAt: '2026-11-03T00:00:00.000Z' })), 'e2');
    expect(fake.docs[ORG]).not.toHaveProperty('planId');
    expect(fake.docs[ORG]).toMatchObject({ subscriptionStatus: 'canceled' });
  });

  test('a subscription event does not end a pilot or convert it', async () => {
    fake.docs[ORG]!.pilotId = 'pilot1';
    fake.docs['pilots/pilot1'] = { status: 'active' };
    await send(eventOf('subscription.active', sub()));
    expect(fake.docs['pilots/pilot1']).toEqual({ status: 'active' });
    expect(fake.writes).toEqual([`update ${ORG}`, `create ${eventKey('evt-1')}`]);
  });

  test('modifiedAt falls back to createdAt when absent', async () => {
    await send(eventOf('subscription.canceled', sub({ status: 'canceled', modifiedAt: undefined })));
    expect(fake.docs[ORG]!.billingUpdatedAt).toBe(Date.parse('2026-11-01T00:00:00.000Z'));
  });
});

describe('events that must not change an organization', () => {
  const unchanged = () => expect(fake.docs[ORG]).toMatchObject({ subscriptionStatus: 'active', aiUsageCurrent: 40 });

  test('a replay of the same webhook-id is ignored', async () => {
    await send(eventOf('subscription.canceled', sub({ status: 'canceled' })));
    fake.writes.length = 0;
    await send(eventOf('subscription.active', sub({ status: 'active', modifiedAt: '2026-11-09T00:00:00.000Z' })));
    expect(fake.writes).toEqual([]);
    expect(fake.docs[ORG]!.subscriptionStatus).toBe('canceled');
  });

  test('without a webhook-id the body hash dedupes the event', async () => {
    const event = eventOf('subscription.canceled', sub({ status: 'canceled' }));
    await send(event, null);
    expect(fake.writes).toHaveLength(2);
    await send(event, null);
    expect(fake.writes).toHaveLength(2);
  });

  test('an out-of-order (older) event is dropped', async () => {
    fake.docs[ORG]!.billingUpdatedAt = Date.parse('2026-11-05T00:00:00.000Z');
    const res = await send(eventOf('subscription.revoked', sub({ status: 'revoked', modifiedAt: '2026-11-04T00:00:00.000Z' })));
    expect(res.status).toBe(200);
    expect(fake.writes).toEqual([]);
    unchanged();
  });

  test('an event stamped exactly at billingUpdatedAt is still applied (not strictly older)', async () => {
    fake.docs[ORG]!.billingUpdatedAt = Date.parse('2026-11-02T00:00:00.000Z');
    await send(eventOf('subscription.canceled', sub({ status: 'canceled' })));
    expect(fake.docs[ORG]!.subscriptionStatus).toBe('canceled');
  });

  test('an unparseable modified date is dropped', async () => {
    await send(eventOf('subscription.canceled', sub({ status: 'canceled', modifiedAt: 'garbage' })));
    expect(fake.writes).toEqual([]);
  });

  test('an unknown organization is acknowledged without writes', async () => {
    const res = await send(eventOf('subscription.canceled', sub({ status: 'canceled', metadata: { organizationId: 'ghost' } })));
    expect(res.status).toBe(200);
    expect(fake.writes).toEqual([]);
  });

  test.each([
    ['no metadata', undefined],
    ['no organizationId', {}],
    ['a path-like organizationId', { organizationId: 'org1/../other' }],
    ['a non-string organizationId', { organizationId: 5 as unknown as string }],
  ])('%s is acknowledged without touching Firestore', async (_name, metadata) => {
    const res = await send(eventOf('subscription.canceled', sub({ status: 'canceled', metadata })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(fake.writes).toEqual([]);
    unchanged();
  });

  test.each(['order.created', 'order.updated', 'checkout.updated', 'customer.created'])('%s never changes subscription state', async type => {
    const res = await send(eventOf(type, sub({ status: 'active' })));
    expect(res.status).toBe(200);
    expect(fake.writes).toEqual([]);
    unchanged();
  });

  test('a failing transaction is a 500 so Polar retries', async () => {
    fake.failTransaction = true;
    const res = await send(eventOf('subscription.canceled', sub({ status: 'canceled' })));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Webhook processing failed' });
    unchanged();
  });
});

// ─── AI credit orders (SCO-15) ─────────────────────────────────────────
interface Order { id: string; paid?: boolean; netAmount?: number; platformFeeAmount?: number; refundedAmount?: number; currency?: string; metadata?: { kind?: string; organizationId?: string; userId?: string } }
const order = (over: Partial<Order> = {}): Order => ({
  id: 'ord1', paid: true, netAmount: 1000, platformFeeAmount: 100, refundedAmount: 0, currency: 'usd',
  metadata: { kind: 'ai_credit', organizationId: 'org1', userId: 't1' }, ...over,
});
const sendOrder = (type: 'order.paid' | 'order.refunded', o: Order) => send({ type, data: o as never }, `evt-${type}-${o.id}-${o.refundedAmount ?? 0}`);

describe('credit orders', () => {
  beforeEach(() => {
    useCredit = true;
    credit = createCreditDb();
    credit.docs[ORG] = { ownerId: 't1', aiPaidCents: 50 };
  });

  test('order.paid credits net minus the Polar fee to the paid bucket and writes a ledger entry', async () => {
    const res = await sendOrder('order.paid', order());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(credit.docs[ORG]!.aiPaidCents).toBe(50 + 900);
    expect(ledger()).toHaveLength(1);
    expect(credit.docs[ledger()[0]]).toMatchObject({ kind: 'deposit', bucket: 'paid', cents: 900, externalId: 'ord1', actorUid: 't1' });
  });

  test('delivering order.paid twice credits once', async () => {
    await sendOrder('order.paid', order());
    const again = await sendOrder('order.paid', order());
    expect(again.status).toBe(200);
    expect(credit.docs[ORG]!.aiPaidCents).toBe(950);
    expect(ledger()).toHaveLength(1);
  });

  test.each([
    ['another kind of order', order({ metadata: { organizationId: 'org1' } })],
    ['an order for a legacy plan', order({ metadata: { kind: 'subscription', organizationId: 'org1' } })],
    ['an unpaid order', order({ paid: false })],
    ['an order with no paid flag', order({ paid: undefined })],
    ['an order with no organizationId', order({ metadata: { kind: 'ai_credit' } })],
    ['an order with a path-like organizationId', order({ metadata: { kind: 'ai_credit', organizationId: 'org1/x' } })],
    ['an order whose fee swallows the net amount', order({ netAmount: 100, platformFeeAmount: 100 })],
  ])('order.paid ignores %s', async (_name, o) => {
    const res = await sendOrder('order.paid', o);
    expect(res.status).toBe(200);
    expect(credit.docs[ORG]!.aiPaidCents).toBe(50);
    expect(ledger()).toEqual([]);
  });

  test('order.paid for a network that does not exist is a 500 so Polar retries', async () => {
    delete credit.docs[ORG];
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await sendOrder('order.paid', order());
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Webhook processing failed' });
  });

  describe('order.refunded', () => {
    beforeEach(async () => { await sendOrder('order.paid', order()); });

    test('a partial refund debits that share of the credit', async () => {
      const res = await sendOrder('order.refunded', order({ refundedAmount: 250 }));
      expect(res.status).toBe(200);
      // 900 credited for a 1000 net order: 250 refunded is 225 of credit.
      expect(credit.docs[ORG]!.aiPaidCents).toBe(950 - 225);
      expect(ledger()).toHaveLength(2);
      expect(Object.values(credit.docs).find(d => d?.kind === 'refund')).toMatchObject({ bucket: 'paid', cents: -225, meta: { orderId: 'ord1', refundedAmount: 250 } });
    });

    test('a partial then a full refund debits the whole credit exactly once', async () => {
      await sendOrder('order.refunded', order({ refundedAmount: 250 }));
      await sendOrder('order.refunded', order({ refundedAmount: 1000 }));
      expect(credit.docs[ORG]!.aiPaidCents).toBe(50);
      expect(ledger()).toHaveLength(3);
    });

    test('delivering the same refund twice does not debit twice', async () => {
      await sendOrder('order.refunded', order({ refundedAmount: 250 }));
      await sendOrder('order.refunded', order({ refundedAmount: 250 }));
      expect(credit.docs[ORG]!.aiPaidCents).toBe(950 - 225);
      expect(ledger()).toHaveLength(2);
    });

    test('an older, smaller refundedAmount arriving late debits nothing more', async () => {
      await sendOrder('order.refunded', order({ refundedAmount: 1000 }));
      await sendOrder('order.refunded', order({ refundedAmount: 250 }));
      expect(credit.docs[ORG]!.aiPaidCents).toBe(50);
      expect(ledger()).toHaveLength(2);
    });

    test('a refund beyond the net amount is clamped to the credit the order added', async () => {
      await sendOrder('order.refunded', order({ refundedAmount: 5000 }));
      expect(credit.docs[ORG]!.aiPaidCents).toBe(50);
    });

    test('the paid bucket may go negative when the credit was already spent', async () => {
      credit.docs[ORG]!.aiPaidCents = 100;
      await sendOrder('order.refunded', order({ refundedAmount: 1000 }));
      expect(credit.docs[ORG]!.aiPaidCents).toBe(-800);
    });

    test.each([
      ['a non ai_credit order', order({ refundedAmount: 500, metadata: { organizationId: 'org1' } })],
      ['an order with nothing refunded', order({ refundedAmount: 0 })],
      ['an order with no net amount', order({ netAmount: 0, refundedAmount: 500 })],
    ])('ignores %s', async (_name, o) => {
      await sendOrder('order.refunded', o);
      expect(credit.docs[ORG]!.aiPaidCents).toBe(950);
      expect(ledger()).toHaveLength(1);
    });
  });
});
