/**
 * RT-19 / E-004: how the Polar webhook route applies verified subscription events.
 * validateEvent is mocked here on purpose (full Polar payloads are huge); the real signature path is covered
 * in webhooks-verification.test.ts. These tests pin what the handler writes for each state and when it writes nothing.
 */
import { createFakeBillingDb, type FakeBillingDb } from '../tests/helpers/fake-billing-db';

let fake: FakeBillingDb;
jest.mock('../src/lib/firebase-admin', () => ({
  get adminDb() { return fake.db; },
}));
const mockValidate = jest.fn();
jest.mock('@polar-sh/sdk/webhooks', () => ({ validateEvent: (...args: unknown[]) => mockValidate(...args) }));
import { createHash } from 'node:crypto';
import { POST } from '../src/app/api/webhooks/polar/route';

const ORG = 'organizations/org1';
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

  test('canceled / revoked / past_due within the same billing period do not reset usage', async () => {
    let modified = 1;
    for (const [type, status] of [['subscription.canceled', 'canceled'], ['subscription.revoked', 'revoked'], ['subscription.updated', 'past_due']]) {
      await send(eventOf(type, sub({ status, modifiedAt: `2026-11-0${++modified}T00:00:00.000Z` })), `evt-${status}`);
      expect(fake.docs[ORG]).toMatchObject({ subscriptionStatus: status, aiUsageCurrent: 40, notebookUsageCurrent: 3 });
    }
  });

  test('a new billing period resets usage counters and stamps lastRenewalAt', async () => {
    await send(eventOf('subscription.active', sub({ currentPeriodStart: '2026-12-01T00:00:00.000Z' })));
    expect(fake.docs[ORG]).toMatchObject({ aiUsageCurrent: 0, notebookUsageCurrent: 0, billingPeriodStart: '2026-12-01T00:00:00.000Z' });
    expect(fake.docs[ORG]!.lastRenewalAt).toBeInstanceOf(Date);
  });

  test('missing planId keeps the existing plan; with no plan at all it falls back to free', async () => {
    await send(eventOf('subscription.canceled', sub({ status: 'canceled', metadata: { organizationId: 'org1' } })), 'e1');
    expect(fake.docs[ORG]!.planId).toBe('standard_monthly');
    fake.docs[ORG] = { ownerId: 't1' };
    await send(eventOf('subscription.canceled', sub({ status: 'canceled', metadata: { organizationId: 'org1' }, modifiedAt: '2026-11-03T00:00:00.000Z' })), 'e2');
    expect(fake.docs[ORG]!.planId).toBe('free');
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

  test.each(['order.created', 'order.paid', 'checkout.updated', 'customer.created'])('%s never changes subscription state', async type => {
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
