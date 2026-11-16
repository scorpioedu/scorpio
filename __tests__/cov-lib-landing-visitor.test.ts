import {
  getVisitorSecret, issueVisitorToken, verifyVisitorToken, hashIp, VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE_S,
} from '../src/lib/landing-visitor';

const SECRET = 'a-secret-of-sufficient-length';

describe('getVisitorSecret', () => {
  const saved = process.env.LANDING_VISITOR_COOKIE_SECRET;
  afterEach(() => {
    if (saved === undefined) delete process.env.LANDING_VISITOR_COOKIE_SECRET;
    else process.env.LANDING_VISITOR_COOKIE_SECRET = saved;
  });
  it('returns null when unset', () => {
    delete process.env.LANDING_VISITOR_COOKIE_SECRET;
    expect(getVisitorSecret()).toBeNull();
  });
  it('returns null when shorter than 16 chars', () => {
    process.env.LANDING_VISITOR_COOKIE_SECRET = 'short';
    expect(getVisitorSecret()).toBeNull();
  });
  it('returns the secret when long enough', () => {
    process.env.LANDING_VISITOR_COOKIE_SECRET = SECRET;
    expect(getVisitorSecret()).toBe(SECRET);
  });
});

describe('visitor tokens', () => {
  it('exposes cookie constants', () => {
    expect(VISITOR_COOKIE).toBe('scorpio_lv');
    expect(VISITOR_COOKIE_MAX_AGE_S).toBe(31536000);
  });
  it('round-trips an issued token', () => {
    const { id, token } = issueVisitorToken(SECRET);
    expect(id).toMatch(/^[a-f0-9]{32}$/);
    expect(verifyVisitorToken(token, SECRET)).toBe(id);
  });
  it('issues distinct ids', () => {
    expect(issueVisitorToken(SECRET).id).not.toBe(issueVisitorToken(SECRET).id);
  });
  it('rejects a token signed with another secret', () => {
    const { token } = issueVisitorToken(SECRET);
    expect(verifyVisitorToken(token, 'another-secret-long-enough')).toBeNull();
  });
  it('rejects tampered signature of equal length', () => {
    const { id, token } = issueVisitorToken(SECRET);
    const sig = token.slice(id.length + 1);
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(verifyVisitorToken(`${id}.${flipped}`, SECRET)).toBeNull();
  });
  it('rejects signature of the wrong length', () => {
    const { id } = issueVisitorToken(SECRET);
    expect(verifyVisitorToken(`${id}.abc`, SECRET)).toBeNull();
  });
  it.each([undefined, '', 'nodot', '.sig'])('rejects malformed token %p', (t) => {
    expect(verifyVisitorToken(t, SECRET)).toBeNull();
  });
  it('rejects ids that are not 32 hex chars', () => {
    expect(verifyVisitorToken('XYZ.sig', SECRET)).toBeNull();
  });
});

describe('hashIp', () => {
  it('is deterministic, 32 hex chars, and does not contain the ip', () => {
    const h = hashIp('1.2.3.4', SECRET);
    expect(h).toBe(hashIp('1.2.3.4', SECRET));
    expect(h).toMatch(/^[a-f0-9]{32}$/);
    expect(h).not.toContain('1.2.3.4');
  });
  it('differs by ip and by secret', () => {
    expect(hashIp('1.2.3.4', SECRET)).not.toBe(hashIp('1.2.3.5', SECRET));
    expect(hashIp('1.2.3.4', SECRET)).not.toBe(hashIp('1.2.3.4', 'another-secret-long-enough'));
  });
});
