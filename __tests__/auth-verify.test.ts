import { NextRequest, NextResponse } from 'next/server';
jest.mock('../src/lib/firebase-admin', () => ({ adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() }, adminDb: { collection: jest.fn() } }));
import { adminAuth, adminDb } from '../src/lib/firebase-admin';
import { authenticateRequest, verifyCallerIdentity, withAuthorizedRequest } from '../src/lib/auth-verify';
const verify = adminAuth.verifyIdToken as jest.Mock;
const session = adminAuth.verifySessionCookie as jest.Mock;
const collection = adminDb.collection as jest.Mock;
beforeEach(()=>{jest.resetAllMocks();collection.mockReturnValue({doc:()=>({get:async()=>({data:()=>({role:'student',organizationId:'a'})})})});});
const request = (headers: Record<string,string> = {}, body = {}) => new NextRequest('https://scorpio.test/api/student/tutor',{method:'POST',headers,body:JSON.stringify(body)});
test('missing credentials fail closed',async()=>expect(await verifyCallerIdentity(request(),'sa')).toEqual(expect.objectContaining({authorized:false})));
test('invalid bearer fails closed',async()=>{verify.mockRejectedValue(new Error('invalid'));expect(await authenticateRequest(request({Authorization:'Bearer bad'}))).toBeNull();});
test('valid credentials cannot impersonate another account',async()=>{verify.mockResolvedValue({uid:'sa'});expect((await verifyCallerIdentity(request({Authorization:'Bearer valid'}),'sb')).authorized).toBe(false);});
test('checks revocation for bearer and session tokens',async()=>{
 verify.mockResolvedValue({uid:'sa'});await authenticateRequest(request({Authorization:'Bearer valid'}));expect(verify).toHaveBeenCalledWith('valid',true);
 session.mockResolvedValue({uid:'sa'});await authenticateRequest(request({cookie:'__session=signed'}));expect(session).toHaveBeenCalledWith('signed',true);
});
test('legacy packed cookies are supported but their claimed role is not used',async()=>{
 session.mockResolvedValue({uid:'sa'});expect(await authenticateRequest(request({cookie:`__session=${JSON.stringify({token:'signed',role:'teacher'})}`}))).toEqual({uid:'sa'});
});
test('guard rejects unauthenticated and wrong-account requests before handler',async()=>{
 const handler=jest.fn(async()=>NextResponse.json({ok:true}));const guarded=withAuthorizedRequest(handler,{identityField:'userId'});
 expect((await guarded(request())).status).toBe(401);
 verify.mockResolvedValue({uid:'sa'});expect((await guarded(request({Authorization:'Bearer valid'},{userId:'sb'}))).status).toBe(403);expect(handler).not.toHaveBeenCalled();
});
test('student cannot call teacher-only endpoints',async()=>{
 verify.mockResolvedValue({uid:'sa'});const handler=jest.fn();expect((await withAuthorizedRequest(handler,{teacher:true})(request({Authorization:'Bearer valid'}))).status).toBe(403);expect(handler).not.toHaveBeenCalled();
});
test('authorized student request reaches handler',async()=>{
 verify.mockResolvedValue({uid:'sa'});const handler=jest.fn(async()=>NextResponse.json({ok:true}));expect((await withAuthorizedRequest(handler,{identityField:'userId'})(request({Authorization:'Bearer valid'},{userId:'sa'}))).status).toBe(200);expect(handler).toHaveBeenCalledTimes(1);
});

// RT-06 / C-003: admin-claim option and the characterised behaviour of the other options.
describe('withAuthorizedRequest admin option', () => {
  const adds: Array<Record<string, unknown>> = [];
  const auditing = (profile: () => unknown) => (name: string) => name === 'admin_audit'
    ? { add: async (doc: Record<string, unknown>) => { adds.push(doc); return { id: 'a1' }; } }
    : { doc: () => ({ get: async () => ({ data: profile }) }) };
  beforeEach(() => {
    adds.length = 0;
    collection.mockImplementation(auditing(() => ({ role: 'teacher', organizationId: 'a' })));
  });
  const bearer = { Authorization: 'Bearer valid' };

  test('unauthenticated request is 401 before the claim is checked', async () => {
    const handler = jest.fn();
    expect((await withAuthorizedRequest(handler, { admin: true })(request({}, { action: 'x' }))).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
  test('signed-in user without the admin claim gets 403 and the handler never runs', async () => {
    verify.mockResolvedValue({ uid: 'teacher1' });
    const handler = jest.fn();
    expect((await withAuthorizedRequest(handler, { admin: true })(request(bearer, { action: 'x' }))).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
  test('claims that are not exactly true are rejected', async () => {
    const handler = jest.fn();
    for (const claim of [false, 'true', 1]) {
      verify.mockResolvedValue({ uid: 'u', admin: claim });
      expect((await withAuthorizedRequest(handler, { admin: true })(request(bearer, {}))).status).toBe(403);
    }
    expect(handler).not.toHaveBeenCalled();
  });
  test('user with admin: true claim reaches the handler', async () => {
    verify.mockResolvedValue({ uid: 'root', admin: true });
    const handler = jest.fn(async () => NextResponse.json({ ok: true }));
    expect((await withAuthorizedRequest(handler, { admin: true })(request(bearer, { action: 'x' }))).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
  test('admin claim works without a users profile document', async () => {
    verify.mockResolvedValue({ uid: 'root', admin: true });
    collection.mockImplementation(auditing(() => undefined));
    const handler = jest.fn(async () => NextResponse.json({ ok: true }));
    expect((await withAuthorizedRequest(handler, { admin: true })(request(bearer, {}))).status).toBe(200);
  });
  test('allowed call writes an admin_audit record with a hashed IP and no raw IP', async () => {
    verify.mockResolvedValue({ uid: 'root', admin: true });
    const handler = jest.fn(async () => NextResponse.json({ ok: true }));
    await withAuthorizedRequest(handler, { admin: true })(request({ ...bearer, 'x-forwarded-for': '203.0.113.9' }, { action: 'queryCollection', collectionName: 'users' }));
    expect(adds).toHaveLength(1);
    expect(adds[0]).toEqual(expect.objectContaining({ uid: 'root', action: 'queryCollection', collection: 'users', outcome: 'allowed' }));
    expect(typeof adds[0].ipHash).toBe('string');
    expect(JSON.stringify(adds[0])).not.toContain('203.0.113.9');
  });
  test('denied call is audited too', async () => {
    verify.mockResolvedValue({ uid: 'teacher1' });
    await withAuthorizedRequest(jest.fn(), { admin: true })(request(bearer, { action: 'list' }));
    expect(adds).toHaveLength(1);
    expect(adds[0]).toEqual(expect.objectContaining({ uid: 'teacher1', outcome: 'denied' }));
  });
  test('handler does not run if the audit record cannot be written', async () => {
    verify.mockResolvedValue({ uid: 'root', admin: true });
    collection.mockImplementation(() => ({ add: async () => { throw new Error('down'); }, doc: () => ({ get: async () => ({ data: () => ({}) }) }) }));
    const handler = jest.fn();
    expect((await withAuthorizedRequest(handler, { admin: true })(request(bearer, {}))).status).toBeGreaterThanOrEqual(400);
    expect(handler).not.toHaveBeenCalled();
  });
  test('non-admin routes ignore the claim and do not write audit records', async () => {
    verify.mockResolvedValue({ uid: 'sa', admin: true });
    const handler = jest.fn(async () => NextResponse.json({ ok: true }));
    expect((await withAuthorizedRequest(handler)(request(bearer, {}))).status).toBe(200);
    expect(adds).toHaveLength(0);
  });
  test('admin claim does not bypass the teacher option on other routes', async () => {
    verify.mockResolvedValue({ uid: 'sa', admin: true });
    collection.mockImplementation(auditing(() => ({ role: 'student' })));
    expect((await withAuthorizedRequest(jest.fn(), { teacher: true })(request(bearer, {}))).status).toBe(403);
  });
  test('x-admin-secret header grants nothing', async () => {
    verify.mockResolvedValue({ uid: 'teacher1' });
    const h = jest.fn();
    expect((await withAuthorizedRequest(h, { admin: true })(request({ ...bearer, 'x-admin-secret': 'legacy' }, {}))).status).toBe(403);
    expect(h).not.toHaveBeenCalled();
  });
});
