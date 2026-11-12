/** RT-10 step 3: Cloud Function email logs never contain a full recipient address. */
const send = jest.fn();
jest.mock('resend', () => ({ Resend: jest.fn(() => ({ emails: { send } })) }), { virtual: true });
jest.mock('../functions/node_modules/firebase-functions/lib/logger/index.js', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
import * as logger from '../functions/node_modules/firebase-functions/lib/logger/index.js';
import { sendEmail } from '../functions/src/lib/email';

const react = {} as Parameters<typeof sendEmail>[0]['react'];
const logged = (...spies: jest.SpyInstance[]) => JSON.stringify(spies.flatMap(s => s.mock.calls));

afterEach(() => { jest.restoreAllMocks(); (logger.info as jest.Mock).mockClear(); (logger.error as jest.Mock).mockClear(); });

test('a successful send logs the masked recipient only', async () => {
  send.mockResolvedValue({ data: { id: 'msg_1' } });
  const log = logger.info as unknown as jest.SpyInstance;
  await sendEmail({ apiKey: 'k', to: 'jane.doe@school.edu', subject: 's', react });
  expect(logged(log)).toContain('j***@school.edu');
  expect(logged(log)).not.toContain('jane.doe');
});

test('a failed send logs the masked recipient only', async () => {
  send.mockRejectedValue(new Error('boom'));
  const err = logger.error as unknown as jest.SpyInstance;
  await expect(sendEmail({ apiKey: 'k', to: 'jane.doe@school.edu', subject: 's', react })).rejects.toThrow('boom');
  expect(logged(err)).toContain('j***@school.edu');
  expect(logged(err)).not.toContain('jane.doe');
});

test('a list of recipients is fully redacted rather than printed', async () => {
  send.mockResolvedValue({ data: { id: 'msg_2' } });
  const log = logger.info as unknown as jest.SpyInstance;
  await sendEmail({ apiKey: 'k', to: ['a.b@x.org', 'c.d@y.org'], subject: 's', react });
  expect(logged(log)).not.toContain('a.b@x.org');
});
