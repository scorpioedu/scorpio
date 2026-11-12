jest.mock('firebase-admin', () => ({ initializeApp: jest.fn(), firestore: jest.fn() }));
jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn() }), { virtual: true });

import * as fns from '../functions/src/index';

type Endpoint = { timeoutSeconds?: number; availableMemoryMb?: number; scheduleTrigger?: { schedule?: string } };
const endpoint = (fn: unknown): Endpoint => (fn as { __endpoint: Endpoint }).__endpoint;

describe('deployed grading functions', () => {
  test.each(['onSubmissionCreated', 'onSubmissionUpdated'] as const)('%s has a 540s timeout', name => {
    expect(endpoint(fns[name]).timeoutSeconds).toBe(540);
  });

  test.each(['onSubmissionCreated', 'onSubmissionUpdated'] as const)('%s has explicit memory', name => {
    expect(endpoint(fns[name]).availableMemoryMb).toBe(1024);
  });

  test('the stuck-grading sweep is exported so it deploys', () => {
    expect(endpoint(fns.sweepStuckGrading).scheduleTrigger?.schedule).toBeTruthy();
  });
});
