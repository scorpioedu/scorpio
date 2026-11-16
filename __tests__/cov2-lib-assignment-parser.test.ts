import { parseQuestionsManually } from '../src/lib/assignment-parser';

describe('parseQuestionsManually edge cases', () => {
  it('drops an empty trailing inline option', () => {
    const [q] = parseQuestionsManually('Question 1: Which unit measures force? A) joule B) newton C)');
    expect(q.text).toBe('Which unit measures force?');
    expect(q.options).toEqual(['joule', 'newton']);
    expect(q.type).toBe('multiple-choice');
  });

  it('leaves the answer empty when a numeric answer is beyond the option list', () => {
    const [q] = parseQuestionsManually('Question 1: Which unit measures force?\nA) joule\nB) newton\nAnswer: 4');
    expect(q.options).toEqual(['joule', 'newton']);
    expect(q.correctAnswer).toBe('');
  });

  it('maps an in-range numeric answer to the option text', () => {
    const [q] = parseQuestionsManually('Question 1: Which unit measures force?\nA) joule\nB) newton\nAnswer: 2');
    expect(q.correctAnswer).toBe('newton');
  });

  it('does not add True/False options when options already exist and the options label reset the flag', () => {
    const [q] = parseQuestionsManually('Question 1: Which unit measures force?\nA) joule\nOptions:\nTrue');
    expect(q.options).toEqual(['joule']);
    expect(q.type).toBe('multiple-choice');
  });

  it('ignores a continuation line that has no letters', () => {
    const [q] = parseQuestionsManually('Question 1: Compute the total momentum\n1234 5678');
    expect(q.text).toBe('Compute the total momentum');
  });

  it('appends a lettered continuation line to the question text', () => {
    const [q] = parseQuestionsManually('Question 1: Compute the total momentum\nof the two carts together');
    expect(q.text).toBe('Compute the total momentum of the two carts together');
  });
});
