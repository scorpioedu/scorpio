import { NextRequest, NextResponse } from 'next/server';

const mockCookieSet = jest.fn();
const mockCookieDelete = jest.fn();
jest.mock('next/headers', () => ({ cookies: async () => ({ set: mockCookieSet, delete: mockCookieDelete }) }));

const mockVerifyIdToken = jest.fn();
const mockCreateSessionCookie = jest.fn();
const mockProfile = jest.fn();
jest.mock('../src/lib/firebase-admin', () => ({
  adminAuth: {
    verifyIdToken: (...a: unknown[]) => mockVerifyIdToken(...a),
    createSessionCookie: (...a: unknown[]) => mockCreateSessionCookie(...a),
  },
  adminDb: { collection: () => ({ doc: () => ({ get: async () => ({ data: () => mockProfile() }) }) }) },
}));
const mockEnforce = jest.fn();
jest.mock('../src/lib/rate-limit', () => ({ enforceRateLimit: (...a: unknown[]) => mockEnforce(...a) }));

import { POST as sessionPost, DELETE as sessionDelete } from '../src/app/api/auth/session/route';
import { GET as githubGet } from '../src/app/api/github/stats/route';

const env = { ...process.env };
const sessionCall = (body: unknown, headers: Record<string, string> = {}) =>
  sessionPost(new NextRequest('https://scorpio.test/api/auth/session', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }));

beforeEach(() => {
  for (const m of [mockCookieSet, mockCookieDelete, mockVerifyIdToken, mockCreateSessionCookie, mockProfile, mockEnforce]) m.mockReset();
  mockVerifyIdToken.mockResolvedValue({ uid: 'u1' });
  mockCreateSessionCookie.mockResolvedValue('session-cookie-value');
  mockProfile.mockReturnValue({ role: 'teacher' });
  mockEnforce.mockResolvedValue(null);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { process.env = { ...env }; jest.restoreAllMocks(); });

describe('POST /api/auth/session', () => {
  test('403 for a cross-origin request before any token work', async () => {
    const res = await sessionCall({ idToken: 't' }, { origin: 'https://evil.test' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Invalid origin' });
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  test('401 for an invalid token, malformed body, or failed cookie creation', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('bad token'));
    const bad = await sessionCall({ idToken: 'bad' });
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: 'Invalid session credentials' });
    expect((await sessionCall('not json')).status).toBe(401);
    mockVerifyIdToken.mockResolvedValue({ uid: 'u1' });
    mockCreateSessionCookie.mockRejectedValue(new Error('cannot mint'));
    expect((await sessionCall({ idToken: 't' })).status).toBe(401);
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  test('verifies the token with revocation checking and rate limits by uid', async () => {
    mockEnforce.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }));
    const res = await sessionCall({ idToken: 'tok' });
    expect(res.status).toBe(429);
    expect(mockVerifyIdToken).toHaveBeenCalledWith('tok', true);
    expect(mockEnforce.mock.calls[0].slice(1)).toEqual(['session', 'u1']);
    expect(mockCreateSessionCookie).not.toHaveBeenCalled();
  });

  test.each([[undefined], [{ role: 'admin' }]])('403 when registration is incomplete (%j)', async profile => {
    mockProfile.mockReturnValue(profile);
    const res = await sessionCall({ idToken: 't' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Complete registration first');
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  test('sets a 5 day httpOnly session cookie and returns the server-side role', async () => {
    mockProfile.mockReturnValue({ role: 'student' });
    const res = await sessionCall({ idToken: 'tok' }, { origin: 'https://scorpio.test' });
    expect(await res.json()).toEqual({ status: 'success', role: 'student' });
    expect(mockCreateSessionCookie).toHaveBeenCalledWith('tok', { expiresIn: 5 * 24 * 60 * 60 * 1000 });
    expect(mockCookieSet).toHaveBeenCalledWith('__session', 'session-cookie-value', expect.objectContaining({
      maxAge: 5 * 24 * 60 * 60, httpOnly: true, sameSite: 'lax', path: '/', secure: false,
    }));
  });

  test('cookie is marked secure in production', async () => {
    Object.assign(process.env, { NODE_ENV: 'production' });
    await sessionCall({ idToken: 'tok' });
    expect(mockCookieSet.mock.calls[0][2]).toMatchObject({ secure: true });
  });
});

describe('DELETE /api/auth/session', () => {
  test('clears the session cookie', async () => {
    const res = await sessionDelete();
    expect(await res.json()).toEqual({ status: 'success' });
    expect(mockCookieDelete).toHaveBeenCalledWith('__session');
  });
});

describe('GET /api/github/stats', () => {
  const get = () => githubGet(new NextRequest('https://scorpio.test/api/github/stats'));
  const mockFetch = jest.fn();
  const commit = (n: number) => ({ sha: `sha${n}`, html_url: `https://github.test/c/${n}`, commit: { message: `msg ${n}`, author: { name: `Author ${n}`, date: `2030-01-0${n}` } } });
  const response = (ok: boolean, body: unknown = [], link: string | null = null, status = ok ? 200 : 500) =>
    ({ ok, status, headers: { get: () => link }, json: async () => body });

  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'test-token';
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  test('returns the limiter response and makes no upstream call when rate limited', async () => {
    mockEnforce.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }));
    const res = await get();
    expect(res.status).toBe(429);
    expect(mockEnforce.mock.calls[0][1]).toBe('githubStats');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('500 when the token is not configured, without calling GitHub', async () => {
    delete process.env.GITHUB_TOKEN;
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'GitHub token not configured' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('maps commits and reads the total from the Link header', async () => {
    mockFetch
      .mockResolvedValueOnce(response(true, [], '<https://api.github.com/x?per_page=1&page=321>; rel="last"'))
      .mockResolvedValueOnce(response(true, [commit(1), commit(2)]));
    const json = await (await get()).json();
    expect(json.totalCommits).toBe('321');
    expect(json.recentCommits).toEqual([
      { sha: 'sha1', message: 'msg 1', date: '2030-01-01', url: 'https://github.test/c/1', author: 'Author 1' },
      { sha: 'sha2', message: 'msg 2', date: '2030-01-02', url: 'https://github.test/c/2', author: 'Author 2' },
    ]);
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('token test-token');
    expect(mockFetch.mock.calls[0][0]).toContain('per_page=1');
    expect(mockFetch.mock.calls[1][0]).toContain('per_page=5');
  });

  test('falls back to 130 when there is no parseable Link header', async () => {
    mockFetch.mockResolvedValueOnce(response(true, [])).mockResolvedValueOnce(response(true, [commit(1)]));
    expect((await (await get()).json()).totalCommits).toBe('130');
    mockFetch.mockResolvedValueOnce(response(true, [], 'garbage')).mockResolvedValueOnce(response(true, []));
    expect((await (await get()).json()).totalCommits).toBe('130');
  });

  test.each([[false, true], [true, false]])('502 with generic text when GitHub fails (first ok=%s, second ok=%s)', async (a, b) => {
    mockFetch.mockResolvedValueOnce(response(a)).mockResolvedValueOnce(response(b));
    const res = await get();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'GitHub is unavailable right now' });
  });

  test('500 with generic text when the network call throws', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNRESET internal'));
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to fetch GitHub stats' });
  });

  test('500 when the upstream body has an unexpected shape', async () => {
    mockFetch.mockResolvedValueOnce(response(true, [])).mockResolvedValueOnce(response(true, [{ sha: 'x' }]));
    expect((await get()).status).toBe(500);
  });
});
