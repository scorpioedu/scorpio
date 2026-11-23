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
    expect(m.send).toHaveBeenCalledWith({ from: 'Scorpio Platform <hello@scorpioedu.org>', to: ['a@x.test', 'b@x.test'], subject: 'Hello', react: element });
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
