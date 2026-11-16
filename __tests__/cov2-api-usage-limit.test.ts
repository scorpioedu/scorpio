let orgExists = true;

jest.mock('../src/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({ doc: () => ({ get: async () => ({ exists: orgExists, data: () => undefined }) }) }),
  },
}));

import { checkBudget } from '../src/lib/usage-limit';

afterEach(() => { orgExists = true; });

describe('checkBudget with a document that exists but holds no data', () => {
  test('is treated as an inactive subscription rather than throwing', async () => {
    expect(await checkBudget('o', 'grading')).toEqual({ allowed: false, error: 'Your subscription is no longer active.' });
  });

  test('also holds when a user id is supplied', async () => {
    expect(await checkBudget('o', 'tutor', 'u')).toEqual({ allowed: false, error: 'Your subscription is no longer active.' });
  });
});
