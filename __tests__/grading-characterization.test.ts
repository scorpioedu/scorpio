// Characterization tests: legitimate-answer behaviour of gradeResponse that RT-07 must preserve.
jest.mock('../src/lib/ai/config', () => ({ model: { generateContent: jest.fn() } }));
import { model } from '../src/lib/ai/config';
import { gradeResponse } from '../src/lib/ai/grading';

const generate = model.generateContent as jest.Mock;
const reply = (text: string, usageMetadata: Record<string, number> = {}) =>
  generate.mockResolvedValue({ response: Promise.resolve({ text: () => text, usageMetadata }) });
beforeEach(() => jest.clearAllMocks());

describe('gradeResponse legitimate answers (characterization)', () => {
  test('full-credit reply for a correct answer is returned as a grade', async () => {
    reply('{"score":10,"technical_reasoning":"Correct, with units.","student_feedback":"Well done","misconceptions":[]}');
    const r = await gradeResponse('What is the SI unit of force?', 'The newton (N)', 'newton');
    expect(r).toMatchObject({ score: 10, feedback: 'Well done', reasoning: 'Correct, with units.' });
  });

  test('partial credit keeps its decimal value', async () => {
    reply('{"score":6.5,"technical_reasoning":"minor math slip","student_feedback":"check arithmetic"}');
    expect((await gradeResponse('Compute the work done by a 10 N force over 3 m.', 'W = 10 x 3 = 31 J')).score).toBe(6.5);
  });

  test('zero stays zero', async () => {
    reply('{"score":0,"student_feedback":"Try again"}');
    expect((await gradeResponse('question', 'answer')).score).toBe(0);
  });

  test('a single-number answer matching the reference can be graded full marks', async () => {
    reply('{"score":10,"student_feedback":"Correct"}');
    const r = await gradeResponse('A 2 kg mass is pulled by a 10 N net force. What is its acceleration in m/s^2?', '5', '5 m/s^2');
    expect(r.score).toBe(10);
  });

  test('legacy field names feedback/reasoning are still accepted', async () => {
    reply('{"score":7,"feedback":"legacy feedback","reasoning":"legacy reasoning"}');
    expect(await gradeResponse('question', 'answer')).toMatchObject({ feedback: 'legacy feedback', reasoning: 'legacy reasoning' });
  });

  test('missing feedback falls back to a default message', async () => {
    reply('{"score":4}');
    expect((await gradeResponse('question', 'answer')).feedback).toBe('No feedback provided.');
  });

  test('JSON wrapped in a markdown fence or prose is still extracted', async () => {
    reply('Here you go:\n```json\n{"score":8,"student_feedback":"good"}\n```');
    expect((await gradeResponse('question', 'answer')).score).toBe(8);
  });

  test('token usage is reported from provider metadata', async () => {
    reply('{"score":5}', { promptTokenCount: 120, candidatesTokenCount: 30 });
    expect((await gradeResponse('question', 'answer')).usage).toEqual({ inputTokens: 120, outputTokens: 30 });
  });

  test('missing question or answer returns zero without calling the model', async () => {
    const r = await gradeResponse('', 'answer');
    expect(r).toEqual({ score: 0, feedback: 'Missing question or answer text for grading.' });
    expect(generate).not.toHaveBeenCalled();
  });

  test('a non-numeric string score is rejected rather than graded', async () => {
    reply('{"score":"excellent"}');
    await expect(gradeResponse('question', 'answer')).rejects.toThrow('manual review');
  });
});
