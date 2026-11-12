import { isSubmissionLate } from '../src/lib/due-date';

// E-002: the predicate is the one the submissions route uses (src/lib/due-date.ts), not a local copy.
// Rewritten from a copy-pasted function definition to an import of the real code (RT-19).
describe('Assignment Due Date Enforcement', () => {
  const due = new Date('2026-05-01T12:00:00Z');
  const stamp = (d: Date) => ({ toDate: () => d });

  it('marks submission as not late when submitted before due date', () => {
    expect(isSubmissionLate(stamp(due), new Date('2026-05-01T11:59:00Z'))).toBe(false);
  });

  it('marks submission as late when submitted after due date', () => {
    expect(isSubmissionLate(stamp(due), new Date('2026-05-01T12:01:00Z'))).toBe(true);
  });

  it('handles Firestore timestamp mock', () => {
    const dueMock = { toDate: () => new Date('2026-05-01T12:00:00Z') };
    expect(isSubmissionLate(dueMock, new Date('2026-05-01T12:05:00Z'))).toBe(true);
  });

  it('returns false if no due date is configured', () => {
    const submission = new Date('2026-05-01T12:05:00Z');
    expect(isSubmissionLate(null, submission)).toBe(false);
    expect(isSubmissionLate(undefined, submission)).toBe(false);
  });

  it('is not late at the exact due instant, late one millisecond after', () => {
    expect(isSubmissionLate(stamp(due), new Date(due.getTime()))).toBe(false);
    expect(isSubmissionLate(stamp(due), new Date(due.getTime() + 1))).toBe(true);
  });

  it('is not late one millisecond before the due instant', () => {
    expect(isSubmissionLate(stamp(due), new Date(due.getTime() - 1))).toBe(false);
  });

  it('treats an invalid due date (NaN) as not late', () => {
    expect(isSubmissionLate(stamp(new Date('not a date')), new Date('2030-01-01T00:00:00Z'))).toBe(false);
  });

  // Documents current behaviour: only Firestore-style `toDate()` values count. A Date or ISO string
  // stored in the field is silently "no due date" (see FOLLOWUPS.md).
  it.each([
    ['a plain Date', new Date('2026-05-01T12:00:00Z')],
    ['an ISO string', '2026-05-01T12:00:00Z'],
    ['an empty object', {}],
  ])('treats %s as having no due date', (_name, value) => {
    expect(isSubmissionLate(value as unknown as { toDate?: () => Date }, new Date('2030-01-01T00:00:00Z'))).toBe(false);
  });
});
