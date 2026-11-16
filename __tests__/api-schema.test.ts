import { NextRequest } from 'next/server';
import { z } from 'zod';
import { parseJsonBody, parseValue } from '../src/lib/api-schema';
import { gradeBody } from '../src/lib/schemas/api-bodies';

const req = (body: string) => new NextRequest('https://scorpio.test/api/x', { method: 'POST', body });
const schema = z.object({ n: z.number() });

describe('parseJsonBody', () => {
  it('returns typed data and strips unknown keys', async () => {
    const r = await parseJsonBody(req('{"n":1,"extra":true}'), schema);
    expect(r).toEqual({ ok: true, data: { n: 1 } });
  });

  it('treats an empty body as {}', async () => {
    const r = await parseJsonBody(req(''), z.object({ n: z.number().optional() }));
    expect(r).toEqual({ ok: true, data: {} });
  });

  it('returns 400 "Invalid JSON" for malformed JSON', async () => {
    const r = await parseJsonBody(req('{nope'), schema);
    if (r.ok) throw new Error('expected rejection');
    expect(r.response.status).toBe(400);
    expect(await r.response.json()).toEqual({ error: 'Invalid JSON' });
  });

  it('returns 413 above maxBytes', async () => {
    const r = await parseJsonBody(req(JSON.stringify({ n: 1, pad: 'x'.repeat(100) })), schema, { maxBytes: 50 });
    if (r.ok) throw new Error('expected rejection');
    expect(r.response.status).toBe(413);
  });

  it('exposes field paths and short messages only, never the received value', async () => {
    const r = await parseJsonBody(req('{"n":"super-secret-value"}'), schema, { message: 'Bad thing' });
    if (r.ok) throw new Error('expected rejection');
    const body = await r.response.json();
    expect(r.response.status).toBe(400);
    expect(body.error).toBe('Bad thing');
    expect(body.fields).toEqual([{ path: 'n', message: expect.any(String) }]);
    expect(JSON.stringify(body)).not.toContain('super-secret-value');
  });

  it('lets the message depend on the failing field', async () => {
    const r = parseValue({ n: 'x' }, schema, issues => `bad ${issues[0].path}`);
    if (r.ok) throw new Error('expected rejection');
    expect((await r.response.json()).error).toBe('bad n');
  });
});

describe('gradeBody', () => {
  it.each([[{}], [{ submissionId: '' }], [{ submissionId: 5 }], [{ submissionId: 'a/b' }], [{ submissionId: 'x'.repeat(300) }]])(
    'rejects %j', body => expect(gradeBody.safeParse(body).success).toBe(false));
  it('accepts the grade page payload', () => expect(gradeBody.safeParse({ submissionId: 's1' }).success).toBe(true));
});
