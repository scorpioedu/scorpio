const generateContent = jest.fn();
jest.mock('../src/lib/ai/config', () => ({ model: { generateContent: (...a: unknown[]) => generateContent(...a) } }));
jest.mock('../src/lib/firebase-admin', () => ({ adminDb: {} }));

import { generateAssignmentQuestions, parseQuestionsFromText, parseQuestionsManually } from '../src/lib/ai/assignment';
import { AiOutputError } from '../src/lib/ai/errors';
import { ClientError } from '../src/lib/client-error';

const reply = (text: string, extra: Record<string, unknown> = {}) => ({
  response: Promise.resolve({
    text: () => text,
    usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 },
    ...extra,
  }),
});

beforeEach(() => {
  generateContent.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('generateAssignmentQuestions', () => {
  it('parses a JSON object response and reports usage', async () => {
    generateContent.mockResolvedValue(reply(JSON.stringify({ questions: [{ text: 'Q1', type: 'text', correctAnswer: 'a' }] })));
    const out = await generateAssignmentQuestions('Waves', 1, 'easy', 'mixed', 'objectives here');
    expect(out.questions).toHaveLength(1);
    expect(out.usage).toEqual({ inputTokens: 7, outputTokens: 3 });
    const prompt = generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
    expect(prompt).toContain('objectives here');
    expect(prompt).toContain('"Waves"');
  });

  it('omits the objectives block when none provided', async () => {
    generateContent.mockResolvedValue(reply('[{"text":"Q"}]'));
    await generateAssignmentQuestions('Waves', 1, 'easy');
    expect(generateContent.mock.calls[0][0].contents[0].parts[0].text).not.toContain('LEARNING OBJECTIVES');
  });

  it('strips markdown fences and surrounding prose', async () => {
    generateContent.mockResolvedValue(reply('Here:\n```json\n[{"text":"Q"}]\n```'));
    const out = await generateAssignmentQuestions('T', 1, 'easy');
    expect(out.questions[0].text).toBe('Q');
  });

  it('throws AiOutputError on empty response', async () => {
    generateContent.mockResolvedValue(reply(' '));
    await expect(generateAssignmentQuestions('T', 1, 'easy')).rejects.toBeInstanceOf(AiOutputError);
  });

  it('throws AiOutputError with public message on non-JSON text', async () => {
    generateContent.mockResolvedValue(reply('no structure at all'));
    const err = await generateAssignmentQuestions('T', 1, 'easy').catch(e => e);
    expect(err).toBeInstanceOf(AiOutputError);
    expect(err.publicMessage ?? err.message).toContain('non-JSON');
  });

  it('recovers from trailing commas', async () => {
    generateContent.mockResolvedValue(reply('[{"text":"Q",},]'));
    const out = await generateAssignmentQuestions('T', 1, 'easy');
    expect(out.questions[0].text).toBe('Q');
  });

  it('reports a MAX_TOKENS truncation when recovery fails', async () => {
    generateContent.mockResolvedValue(reply('{"questions":[{"text":"x" "bad"}]}', { candidates: [{ finishReason: 'MAX_TOKENS' }] }));
    await expect(generateAssignmentQuestions('T', 1, 'easy')).rejects.toThrow('too long');
  });

  it('reports an invalid format when recovery fails without truncation', async () => {
    generateContent.mockResolvedValue(reply('{"questions":[{"text":"x" "bad"}]}'));
    await expect(generateAssignmentQuestions('T', 1, 'easy')).rejects.toThrow('incomplete or invalid');
  });

  it('propagates provider errors', async () => {
    generateContent.mockRejectedValue(new Error('boom'));
    await expect(generateAssignmentQuestions('T', 1, 'easy')).rejects.toThrow('boom');
  });

  it('returns an empty list when a non-Error is thrown', async () => {
    generateContent.mockRejectedValue('string failure');
    expect(await generateAssignmentQuestions('T', 1, 'easy')).toEqual({ questions: [] });
  });

  it('defaults usage tokens to 0 when metadata is missing', async () => {
    generateContent.mockResolvedValue({ response: Promise.resolve({ text: () => '[{"text":"Q"}]' }) });
    expect((await generateAssignmentQuestions('T', 1, 'easy')).usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

describe('parseQuestionsFromText', () => {
  it('re-exports the manual parser', () => {
    expect(typeof parseQuestionsManually).toBe('function');
  });

  it('throws ClientError when no questions can be found', async () => {
    const err = await parseQuestionsFromText('   ').catch(e => e);
    expect(err).toBeInstanceOf(ClientError);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('parses a single batch and sums usage', async () => {
    generateContent.mockResolvedValue(reply('noise [{"text":"Parsed","type":"multiple-choice","options":["a","b"],"correctAnswer":"a"}] noise'));
    const out = await parseQuestionsFromText('1. What is the answer to this?\nA) a\nB) b');
    expect(out.questions[0]).toMatchObject({ text: 'Parsed', type: 'multiple-choice', options: ['a', 'b'] });
    expect(out.usage).toEqual({ inputTokens: 7, outputTokens: 3 });
  });

  it('batches by five with a delay between batches', async () => {
    jest.useFakeTimers();
    try {
      generateContent.mockResolvedValue(reply('[{"text":"Q"}]'));
      const text = Array.from({ length: 6 }, (_, i) => `${i + 1}. Question number ${i + 1} is long enough`).join('\n');
      const p = parseQuestionsFromText(text);
      await jest.advanceTimersByTimeAsync(600);
      const out = await p;
      expect(generateContent).toHaveBeenCalledTimes(2);
      expect(out.questions).toHaveLength(2);
      expect(out.usage).toEqual({ inputTokens: 14, outputTokens: 6 });
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ['no brackets', 'no json here', 'Failed to extract JSON array'],
    ['invalid json', '[ not json ]', 'Failed to parse questions'],
  ])('rejects with AiOutputError when the model returns %s', async (_n, body, msg) => {
    generateContent.mockResolvedValue(reply(body));
    const err = await parseQuestionsFromText('1. A long enough question text').catch(e => e);
    expect(err).toBeInstanceOf(AiOutputError);
    expect(err.message).toContain(msg);
  });

  it('wraps non-Error throws in a generic Error', async () => {
    generateContent.mockRejectedValue('weird');
    await expect(parseQuestionsFromText('1. A long enough question text')).rejects.toThrow('unexpected error');
  });
});
