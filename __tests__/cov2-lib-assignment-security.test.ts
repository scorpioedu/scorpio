import { splitAssignmentQuestions, mergeAnswerKey } from '../src/lib/assignment-security';
import { ClientError } from '../src/lib/client-error';

describe('splitAssignmentQuestions validation', () => {
  it('rejects a question whose text is not a string', () => {
    expect(() => splitAssignmentQuestions([{ id: 'q1', text: 5 }])).toThrow(new ClientError('Invalid question text'));
  });

  it('rejects blank question text', () => {
    expect(() => splitAssignmentQuestions([{ id: 'q1', text: '   ' }])).toThrow('Invalid question text');
  });

  it('rejects question text over 50000 characters but accepts exactly 50000', () => {
    expect(() => splitAssignmentQuestions([{ id: 'q1', text: 'a'.repeat(50001) }])).toThrow('Invalid question text');
    expect(splitAssignmentQuestions([{ id: 'q1', text: 'a'.repeat(50000) }]).publicQuestions).toHaveLength(1);
  });

  it.each([
    ['a string', '5'],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['negative', -1],
  ])('rejects points that are %s', (_n, points) => {
    expect(() => splitAssignmentQuestions([{ id: 'q1', text: 'ok', points }])).toThrow('Invalid question points');
  });

  it('accepts zero points and omitted points', () => {
    const { publicQuestions } = splitAssignmentQuestions([{ id: 'a', text: 't', points: 0 }, { id: 'b', text: 't' }]);
    expect(publicQuestions.map(q => q.points)).toEqual([0, undefined]);
  });

  it('rejects a non-string answer key', () => {
    expect(() => splitAssignmentQuestions([{ id: 'q1', text: 't', correctAnswer: 4 }])).toThrow('Invalid answer key');
  });

  it('rejects invalid, reserved and duplicate ids', () => {
    for (const id of [undefined, 7, '', 'has space', 'x'.repeat(129), '__proto__', 'constructor', 'prototype']) {
      expect(() => splitAssignmentQuestions([{ id, text: 't' }])).toThrow('Question IDs must be unique and valid');
    }
    expect(() => splitAssignmentQuestions([{ id: 'd', text: 't' }, { id: 'd', text: 'u' }])).toThrow('Question IDs must be unique and valid');
  });

  it('separates answers from the public questions and defaults a missing answer to empty', () => {
    const { publicQuestions, answers } = splitAssignmentQuestions([
      { id: 'a', text: 'one', correctAnswer: 'A' },
      { id: 'b', text: 'two' },
    ]);
    expect(publicQuestions).toEqual([{ id: 'a', text: 'one' }, { id: 'b', text: 'two' }]);
    expect({ ...answers }).toEqual({ a: 'A', b: '' });
  });
});

describe('mergeAnswerKey', () => {
  const q = { id: 'a', text: 't' };

  it('prefers the key answer and key rubric', () => {
    const out = mergeAnswerKey({ rubric: 'r0', questions: [{ ...q, correctAnswer: 'old' }] }, { answers: { a: 'new' }, rubric: 'r1' });
    expect(out.rubric).toBe('r1');
    expect(out.questions[0].correctAnswer).toBe('new');
  });

  it('keeps an empty-string key answer rather than falling back', () => {
    const out = mergeAnswerKey({ questions: [{ ...q, correctAnswer: 'old' }] }, { answers: { a: '' } });
    expect(out.questions[0].correctAnswer).toBe('');
  });

  it('falls back to the question correctAnswer, then the legacy answer field, then empty', () => {
    const out = mergeAnswerKey({ rubric: 'r0', questions: [
      { ...q, id: '1', correctAnswer: 'own' },
      { ...q, id: '2', answer: 'legacy' },
      { ...q, id: '3' },
    ] });
    expect(out.rubric).toBe('r0');
    expect(out.questions.map(x => x.correctAnswer)).toEqual(['own', 'legacy', '']);
  });

  it('handles an assignment with no questions or rubric', () => {
    expect(mergeAnswerKey({}, { answers: {} })).toEqual({ rubric: '', questions: [] });
  });
});
