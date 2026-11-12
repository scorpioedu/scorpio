import {
  splitIntoQuestions, repairIncompleteJson, validateAndNormalizeQuestions, classifyQuestion,
} from '../src/lib/ai/utils';

describe('splitIntoQuestions', () => {
  it('splits numbered questions and keeps continuation lines', () => {
    const text = [
      '1. What is the speed of light in vacuum?',
      'A) 3e8',
      'B) 3e6',
      '',
      '2) Define Newton second law of motion please',
    ].join('\n');
    const chunks = splitIntoQuestions(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain('A) 3e8');
    expect(chunks[1]).toBe('2) Define Newton second law of motion please');
  });
  it('treats leading unnumbered text as its own chunk when long enough', () => {
    const chunks = splitIntoQuestions('Preamble line that is long\n1. First question text here');
    expect(chunks).toEqual(['Preamble line that is long', '1. First question text here']);
  });
  it('does not treat short numbered lines as a new question', () => {
    expect(splitIntoQuestions('1. Short')).toEqual([]);
  });
  it('returns [] for empty input and filters tiny chunks', () => {
    expect(splitIntoQuestions('')).toEqual([]);
    expect(splitIntoQuestions('\n\n  \n')).toEqual([]);
  });
});

describe('repairIncompleteJson', () => {
  it('truncates after the last closing brace and closes the array', () => {
    expect(repairIncompleteJson('[{"a":1},{"b":2},{"c":')).toBe('[{"a":1},{"b":2}]');
  });
  it('removes a trailing comma before the bracket', () => {
    expect(repairIncompleteJson('[{"a":1},')).toBe('[{"a":1}]');
  });
  it('leaves complete arrays unchanged', () => {
    expect(repairIncompleteJson('[{"a":1}]')).toBe('[{"a":1}]');
  });
  it('appends a bracket when there is no brace at all', () => {
    expect(repairIncompleteJson('[')).toBe('[]');
  });
});

describe('validateAndNormalizeQuestions', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('normalizes an array with defaults', () => {
    const out = validateAndNormalizeQuestions([{ text: '  Q1  ' }]);
    expect(out).toEqual([{ text: 'Q1', type: 'text', options: [], correctAnswer: '', points: 10 }]);
  });
  it('keeps valid type, filters falsy options, uses answer alias and numeric points', () => {
    const out = validateAndNormalizeQuestions([
      { question: 'Q', type: 'multiple-choice', options: ['a', '', null, 'b'], answer: 'a', points: '5' },
    ]);
    expect(out[0]).toMatchObject({ text: 'Q', type: 'multiple-choice', options: ['a', 'b'], correctAnswer: 'a', points: 5 });
  });
  it('falls back to text type for unknown types and 10 for NaN points', () => {
    const out = validateAndNormalizeQuestions([{ problem: 'P', type: 'weird', points: 'x', options: 'nope' }]);
    expect(out[0]).toMatchObject({ type: 'text', points: 10, options: [] });
  });
  it('unwraps {questions} and {items}', () => {
    expect(validateAndNormalizeQuestions({ questions: [{ text: 'A' }] })).toHaveLength(1);
    expect(validateAndNormalizeQuestions({ items: [{ text: 'A' }, { text: 'B' }] })).toHaveLength(2);
  });
  it('wraps a single question object', () => {
    expect(validateAndNormalizeQuestions({ text: 'Solo' })[0].text).toBe('Solo');
    expect(validateAndNormalizeQuestions({ question: 'Solo2' })[0].text).toBe('Solo2');
  });
  it('throws when an object has no questions', () => {
    expect(() => validateAndNormalizeQuestions({ foo: 1 })).toThrow('no list of questions');
  });
  it.each([null, 'str', 5, []])('throws on empty/invalid structure %p', (d) => {
    expect(() => validateAndNormalizeQuestions(d)).toThrow('empty result or invalid structure');
  });
  it('skips questions without string text but keeps the rest', () => {
    const out = validateAndNormalizeQuestions([{ text: 5 }, {}, { text: 'ok' }]);
    expect(out.map(q => q.text)).toEqual(['ok']);
  });
  it('throws when no question has usable text', () => {
    expect(() => validateAndNormalizeQuestions([{ text: 5 }, {}])).toThrow('No valid questions');
  });
});

describe('classifyQuestion', () => {
  it.each([
    ['What is momentum?', 'declarative'],
    ['Define work', 'declarative'],
    ['Calculate the force', 'problem-solving'],
    ['Solve for x', 'problem-solving'],
    ['A 5 kg block rests there', 'problem-solving'],
    ['Something ambiguous', 'declarative'],
  ])('%s -> %s', (q, expected) => {
    expect(classifyQuestion(q)).toBe(expected);
  });
  it('declarative keywords win over problem keywords', () => {
    expect(classifyQuestion('Explain how to calculate speed')).toBe('declarative');
  });
});
