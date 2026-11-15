// RT-12 follow-up, batch 1: schemas for courses, enrollment, register, session, research/respond.
// Payloads mirror the real client call sites; "rejects" cases are input that used to crash or slip through.
import { courseBody, courseBodyMessage, enrollmentBody, registerBody, sessionBody, researchRespondBody } from '../src/lib/schemas/api-bodies';

describe('courseBody', () => {
  it('accepts the teacher page payload', () => {
    expect(courseBody.safeParse({ name: 'Physics 1', code: 'PHYS-101' }).success).toBe(true);
  });
  it.each([
    [{ name: '   ', code: 'PHYS-101' }, 'Enter a class name'],
    [{ name: 5, code: 'PHYS-101' }, 'Enter a class name'],
    [{ name: 'Physics', code: 'abc' }, 'Use a class code of 6–64 letters, numbers, dashes, or underscores'],
    [{ name: 'Physics', code: 'bad code!' }, 'Use a class code of 6–64 letters, numbers, dashes, or underscores'],
  ])('rejects %j with the original message', (body, message) => {
    const r = courseBody.safeParse(body);
    expect(r.success).toBe(false);
    if (!r.success) expect(courseBodyMessage(r.error.issues.map(i => ({ path: i.path.map(String).join('.') })))).toBe(message);
  });
});

describe('enrollmentBody', () => {
  it.each([{ action: 'join', code: 'ABC123' }, { code: 'ABC123' }, { action: 'leave' }])('accepts %j', body => {
    expect(enrollmentBody.safeParse(body).success).toBe(true);
  });
  it.each([{ action: 'delete' }, { code: 42 }, { code: 'x'.repeat(129) }])('rejects %j', body => {
    expect(enrollmentBody.safeParse(body).success).toBe(false);
  });
});

describe('registerBody', () => {
  it('accepts student and teacher payloads, with or without a code', () => {
    expect(registerBody.safeParse({ role: 'student', name: 'Ada', code: 'ABC123' }).success).toBe(true);
    expect(registerBody.safeParse({ role: 'teacher', name: 'Bo', code: null }).success).toBe(true);
    expect(registerBody.safeParse({ role: 'student', name: 'Ada' }).success).toBe(true);
  });
  it.each([
    { role: 'admin', name: 'Ada' }, { role: 'student', name: '  ' }, { role: 'student', name: 'x'.repeat(121) },
    { role: 'student', name: 'Ada', code: 7 }, {},
  ])('rejects %j', body => {
    expect(registerBody.safeParse(body).success).toBe(false);
  });
});

describe('sessionBody', () => {
  it('drops the extra role/organizationId the auth context sends', () => {
    const r = sessionBody.parse({ idToken: 'tok', role: 'teacher', organizationId: 'o1' });
    expect(r).toEqual({ idToken: 'tok' });
  });
  it.each([{}, { idToken: '' }, { idToken: 12 }])('rejects %j', body => {
    expect(sessionBody.safeParse(body).success).toBe(false);
  });
});

describe('researchRespondBody', () => {
  it('accepts the research client payload', () => {
    expect(researchRespondBody.safeParse({ message: 'why?', level: 'standard', mode: 'concept' }).success).toBe(true);
  });
  it.each([{ message: 5, level: 'a' }, { message: 'x'.repeat(10001), level: 'a' }, { message: 'hi' }])('rejects %j', body => {
    expect(researchRespondBody.safeParse(body).success).toBe(false);
  });
});
