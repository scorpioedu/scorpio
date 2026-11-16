// RT-18 (E-005, K-007): billing outbox delivery trigger, with Polar mocked (no network).
const ingest = jest.fn(async (args: { events: Array<Record<string, unknown>> }) => { void args; });
jest.mock(require.resolve('../functions/node_modules/@polar-sh/sdk'), () => ({
  Polar: jest.fn().mockImplementation(() => ({ events: { ingest: (a: { events: Array<Record<string, unknown>> }) => ingest(a) } })),
}));

import { deliverBillingUsage } from '../functions/src/billing';

type Runnable = { run: (event: unknown) => Promise<unknown> };
const run = (row: Record<string, unknown> | undefined) => {
  const update = jest.fn(async () => undefined);
  const event = { params: { eventId: 'evt1' }, data: { ref: { get: async () => ({ data: () => row }), update } } };
  return (deliverBillingUsage as unknown as Runnable).run(event).then(() => update);
};

const row = {
  status: 'pending', customerId: 'cust', timestamp: { toDate: () => new Date('2026-01-01T00:00:00Z') },
  inputTokens: 100, outputTokens: 50, costCents: 250, organizationId: 'org1', type: 'grading',
};

beforeEach(() => ingest.mockClear());

test('a pending outbox row is ingested once with its event id and marked delivered', async () => {
  const update = await run(row);
  expect(ingest).toHaveBeenCalledTimes(1);
  expect(ingest.mock.calls[0][0].events[0]).toMatchObject({ externalId: 'evt1', customerId: 'cust', metadata: expect.objectContaining({ costUSD: 2.5, organizationId: 'org1' }) });
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'delivered' }));
});

test('an already delivered row is not ingested again', async () => {
  const update = await run({ ...row, status: 'delivered' });
  expect(ingest).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});

test('a missing row is ignored', async () => {
  await run(undefined);
  expect(ingest).not.toHaveBeenCalled();
});

test('an ingest failure is rethrown so the retry policy applies, and the row is not marked delivered', async () => {
  ingest.mockRejectedValueOnce(new Error('polar down'));
  const update = jest.fn();
  const event = { params: { eventId: 'evt1' }, data: { ref: { get: async () => ({ data: () => row }), update } } };
  await expect((deliverBillingUsage as unknown as Runnable).run(event)).rejects.toThrow('polar down');
  expect(update).not.toHaveBeenCalled();
});
