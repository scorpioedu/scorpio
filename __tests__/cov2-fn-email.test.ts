// functions/src/lib/email.ts: API key resolution, the no-key skip, response-id logging and error redaction.
// The Resend SDK and the logger are mocked; no email is ever sent.
import type * as React from 'react';

type SendFn = jest.Mock<Promise<unknown>, never[]>;
const LOGGER = require.resolve('../functions/node_modules/firebase-functions/lib/logger/index.js');

interface Loaded {
  sendEmail: (args: { apiKey?: string; to: string | string[]; subject: string; react: React.ReactElement; replyTo?: string }) => Promise<unknown>;
  send: SendFn;
  ResendCtor: jest.Mock;
  logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock };
}

/** Loads a fresh copy of the module so its cached Resend client does not leak between tests. */
function load(send: SendFn): Loaded {
  let loaded: Loaded | undefined;
  jest.isolateModules(() => {
    const ResendCtor = jest.fn(() => ({ emails: { send } }));
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    jest.doMock('resend', () => ({ Resend: ResendCtor }), { virtual: true });
    jest.doMock(LOGGER, () => logger);
    const mod = jest.requireActual('../functions/src/lib/email');
    loaded = { sendEmail: mod.sendEmail, send, ResendCtor, logger };
  });
  return loaded as Loaded;
}

const element = { type: 'div', props: {} } as unknown as React.ReactElement;
const savedKey = process.env.RESEND_API_KEY;
afterEach(() => {
  if (savedKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = savedKey;
  jest.dontMock('resend');
});

describe('sendEmail', () => {
  it('skips quietly, without creating a client, when no key is passed or in the environment', async () => {
    delete process.env.RESEND_API_KEY;
    const m = load(jest.fn());
    await expect(m.sendEmail({ to: 'a@x.test', subject: 's', react: element })).resolves.toBeUndefined();
    expect(m.ResendCtor).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
    expect(m.logger.warn).toHaveBeenCalledWith('No RESEND_API_KEY found. Skipping email send.');
  });

  it('falls back to the RESEND_API_KEY environment variable', async () => {
    process.env.RESEND_API_KEY = 'env-key';
    const m = load(jest.fn(async () => ({ data: { id: 'msg1' } })));
    await m.sendEmail({ to: 'a@x.test', subject: 's', react: element });
    expect(m.ResendCtor).toHaveBeenCalledWith('env-key');
  });

  it('passes a reply-to address through only when one is given', async () => {
    const m = load(jest.fn(async () => ({ data: { id: 'msg2' } })));
    await m.sendEmail({ apiKey: 'k', to: 'a@x.test', subject: 's', react: element, replyTo: 'owner@x.test' });
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'owner@x.test' }));
  });

  it('prefers an explicit key, sends from the platform address and returns the provider response', async () => {
    process.env.RESEND_API_KEY = 'env-key';
    const response = { data: { id: 'msg1' } };
    const m = load(jest.fn(async () => response));
    const result = await m.sendEmail({ apiKey: 'arg-key', to: ['a@x.test', 'b@x.test'], subject: 'Hello', react: element });
    expect(result).toBe(response);
    expect(m.ResendCtor).toHaveBeenCalledWith('arg-key');
    expect(m.send).toHaveBeenCalledWith({ from: 'Scorpio <hello@scorpioedu.org>', to: ['a@x.test', 'b@x.test'], subject: 'Hello', react: element });
    expect(m.logger.info).toHaveBeenCalledWith(expect.stringContaining('Email sent successfully'), { id: 'msg1' });
  });

  it('reuses one client across calls', async () => {
    const m = load(jest.fn(async () => ({ data: { id: 'x' } })));
    await m.sendEmail({ apiKey: 'k', to: 'a@x.test', subject: 's', react: element });
    await m.sendEmail({ apiKey: 'k', to: 'b@x.test', subject: 's', react: element });
    expect(m.ResendCtor).toHaveBeenCalledTimes(1);
    expect(m.send).toHaveBeenCalledTimes(2);
  });

  it('logs an undefined id when the provider returns no data', async () => {
    const m = load(jest.fn(async () => undefined));
    await expect(m.sendEmail({ apiKey: 'k', to: 'a@x.test', subject: 's', react: element })).resolves.toBeUndefined();
    expect(m.logger.info).toHaveBeenCalledWith(expect.any(String), { id: undefined });
  });

  it('logs only the error name with a masked address, then rethrows', async () => {
    const boom = new RangeError('contains a@x.test');
    const m = load(jest.fn(async () => { throw boom; }));
    await expect(m.sendEmail({ apiKey: 'k', to: 'a@x.test', subject: 's', react: element })).rejects.toBe(boom);
    expect(m.logger.error).toHaveBeenCalledWith('Failed to send email to a***@x.test', { error: 'RangeError' });
  });

  it('logs "unknown" when a non-Error is thrown, then rethrows it', async () => {
    const m = load(jest.fn(async () => { throw 'offline'; }));
    await expect(m.sendEmail({ apiKey: 'k', to: 'a@x.test', subject: 's', react: element })).rejects.toBe('offline');
    expect(m.logger.error).toHaveBeenCalledWith(expect.any(String), { error: 'unknown' });
  });
});

describe('Resend failures and batches', () => {
  type Batch = jest.Mock<Promise<unknown>, [unknown[], unknown?]>;
  function loadWith(send: SendFn, batchSend: Batch) {
    type Mod = {
      sendEmail: Loaded['sendEmail'];
      sendEmailBatch: (args: { apiKey?: string; messages: Array<{ to: string; subject: string; react: React.ReactElement }> }) => Promise<number>;
    };
    let mod: Mod | undefined;
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    jest.isolateModules(() => {
      jest.doMock('resend', () => ({ Resend: jest.fn(() => ({ emails: { send }, batch: { send: batchSend } })) }), { virtual: true });
      jest.doMock(LOGGER, () => logger);
      mod = jest.requireActual<Mod>('../functions/src/lib/email');
    });
    return { ...(mod as unknown as Mod), logger };
  }
  const msg = (to: string) => ({ to, subject: 's', react: element });

  it('treats an { error } response as a failure instead of logging success', async () => {
    const m = loadWith(jest.fn(async () => ({ data: null, error: { name: 'validation_error', statusCode: 422 } })), jest.fn());
    await expect(m.sendEmail({ apiKey: 'k', ...msg('a@x.test') })).rejects.toMatchObject({ name: 'EmailSendError', code: 'validation_error' });
    expect(m.logger.error).toHaveBeenCalledWith('Failed to send email to a***@x.test', { error: 'validation_error' });
    expect(m.logger.info).not.toHaveBeenCalled();
  });

  it('waits and retries when Resend rate-limits', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({ data: null, error: { name: 'rate_limit_exceeded', statusCode: 429 } })
      .mockResolvedValueOnce({ data: { id: 'ok' } });
    const m = loadWith(send as unknown as SendFn, jest.fn());
    await m.sendEmail({ apiKey: 'k', ...msg('a@x.test') });
    expect(send).toHaveBeenCalledTimes(2);
    expect(m.logger.info).toHaveBeenCalledWith(expect.any(String), { id: 'ok' });
  });

  it('sends a class in chunks of 100, permissively, and counts what Resend accepted', async () => {
    const batchSend: Batch = jest.fn(async (emails: unknown[]) => ({
      data: { data: emails.map(() => ({ id: 'x' })), ...(emails.length === 100 ? { errors: [{ index: 3, message: 'bad' }] } : {}) },
    }));
    const m = loadWith(jest.fn(), batchSend);
    const messages = Array.from({ length: 150 }, (_, i) => msg(`s${i}@x.test`));
    expect(await m.sendEmailBatch({ apiKey: 'k', messages })).toBe(149);
    expect(batchSend.mock.calls.map((c) => c[0].length)).toEqual([100, 50]);
    expect(batchSend.mock.calls[0][1]).toEqual({ batchValidation: 'permissive' });
    expect(m.logger.warn).toHaveBeenCalledWith('Resend skipped 1 of 100 emails in a batch');
  });

  it('logs a failed chunk and still sends the next one', async () => {
    const batchSend: Batch = jest
      .fn()
      .mockResolvedValueOnce({ data: null, error: { name: 'application_error', statusCode: 500 } })
      .mockResolvedValueOnce({ data: { data: [] } });
    const m = loadWith(jest.fn(), batchSend);
    const messages = Array.from({ length: 101 }, (_, i) => msg(`s${i}@x.test`));
    expect(await m.sendEmailBatch({ apiKey: 'k', messages })).toBe(1);
    expect(m.logger.error).toHaveBeenCalledWith('Failed to send 100 emails', { error: 'application_error' });
  });

  it('sends nothing for an empty class', async () => {
    const batchSend: Batch = jest.fn();
    const m = loadWith(jest.fn(), batchSend);
    expect(await m.sendEmailBatch({ apiKey: 'k', messages: [] })).toBe(0);
    expect(batchSend).not.toHaveBeenCalled();
  });
});
