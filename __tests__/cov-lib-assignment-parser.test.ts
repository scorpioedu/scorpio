import { parseQuestionsManually } from '../src/lib/assignment-parser';

describe('parseQuestionsManually', () => {
  it('returns [] for empty text', () => {
    expect(parseQuestionsManually('')).toEqual([]);
  });

  it('parses "Question N:" with lettered options and a letter answer', () => {
    const qs = parseQuestionsManually([
      'Question 1: What is the SI unit of force?',
      'A) Joule',
      'B) Newton',
      'C) Watt',
      'Answer: B',
    ].join('\n'));
    expect(qs).toEqual([{
      text: 'What is the SI unit of force?', type: 'multiple-choice',
      options: ['Joule', 'Newton', 'Watt'], correctAnswer: 'Newton',
    }]);
  });

  it('maps a numeric answer to the option at that index', () => {
    const [q] = parseQuestionsManually('1. Which planet is largest in the system?\n(1) Earth\n(2) Jupiter\nAnswer: 2');
    expect(q.options).toEqual(['Earth', 'Jupiter']);
    expect(q.correctAnswer).toBe('Jupiter');
  });

  it('keeps full-text answers for multiple choice and ignores out-of-range letters', () => {
    const [a, b] = parseQuestionsManually([
      '1. First question about gravity?',
      'A) Yes',
      'B) No',
      'Correct Answer: Yes',
      '2. Second question about gravity?',
      'A) Yes',
      'B) No',
      'Answer: D',
    ].join('\n'));
    expect(a.correctAnswer).toBe('Yes');
    expect(b.correctAnswer).toBe('');
  });

  it('parses inline options and stops at Answer:', () => {
    const [q] = parseQuestionsManually('1. What is 2+2 in decimal? A) 3 B) 4 C) 5 Answer: B');
    expect(q.type).toBe('multiple-choice');
    expect(q.text).toBe('What is 2+2 in decimal?');
    expect(q.options).toEqual(['3', '4', '5']);
  });

  it('treats answered questions without options as short-answer', () => {
    const [q] = parseQuestionsManually('Question 1: Name the first law of motion.\nAnswer: Inertia');
    expect(q).toMatchObject({ type: 'short-answer', correctAnswer: 'Inertia', options: [] });
  });

  it('detects true/false questions', () => {
    const [q] = parseQuestionsManually('1. The sun is a star in our galaxy.\nTrue\nFalse\nAnswer: True');
    expect(q.type).toBe('true-false');
    expect(q.options).toEqual(['True', 'False']);
    expect(q.correctAnswer).toBe('True');
  });

  it('skips section headers and appends continuation and "Use" hint lines', () => {
    const qs = parseQuestionsManually([
      'Multiple Choice',
      'Physics Quiz',
      '1. A ball is thrown upward with speed',
      'which is measured in meters per second',
      'Use g = 9.8 m/s2',
    ].join('\n'));
    expect(qs).toHaveLength(1);
    expect(qs[0].text).toBe('A ball is thrown upward with speed which is measured in meters per second Use g = 9.8 m/s2');
  });

  it('accepts dash/bullet options and skips an option line starting with answer', () => {
    const [q] = parseQuestionsManually('1. Choose the vector quantity below\n- Velocity\n• Mass\n- Answer: x');
    expect(q.options).toEqual(['Velocity', 'Mass']);
    expect(q.type).toBe('multiple-choice');
  });

  it('handles the "Options:" label and multiple questions', () => {
    const qs = parseQuestionsManually([
      '1. What carries electric current best?',
      'Options:',
      'a. Copper',
      'b. Rubber',
      'Answer: a',
      '2. Another question that is long enough?',
      'Answer: x',
    ].join('\n'));
    expect(qs).toHaveLength(2);
    expect(qs[0].correctAnswer).toBe('Copper');
    expect(qs[1].type).toBe('short-answer');
  });

  it('drops questions whose text is too short and ignores answers before any question', () => {
    expect(parseQuestionsManually('Answer: 5\nQuestion 1: Hi')).toEqual([]);
  });

  it('ignores lines before the first question', () => {
    expect(parseQuestionsManually('some intro text here')).toEqual([]);
  });
});
