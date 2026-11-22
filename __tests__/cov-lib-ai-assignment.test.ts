const generateContent = jest.fn();
jest.mock('../src/lib/ai/config', () => ({ model: { generateContent: (...a: unknown[]) => generateContent(...a) } }));
jest.mock('../src/lib/firebase-admin', () => ({ adminDb: {} }));

import { GENERATION_BATCH_SIZE, generateAssignmentQuestions, parseQuestionsFromText, parseQuestionsManually } from '../src/lib/ai/assignment';
import { answersAgree, dropNearDuplicates, isCheckable, isNearDuplicate } from '../src/lib/ai/answer-check';
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

describe('generateAssignmentQuestions: batches, exact count and the answer check', () => {
  type Q = { text: string; type?: string; options?: string[]; correctAnswer?: string };
  const stem = (i: number) => `Question ${i}: ${['a cart on a ramp', 'a falling ball', 'a spring launcher', 'two colliding pucks', 'a pendulum bob', 'a satellite in orbit', 'a block on ice', 'a rocket burn', 'a rolling hoop', 'a bungee jumper'][i % 10]} case ${i}?`;
  const mc = (i: number, correctAnswer = 'x'): Q => ({ text: stem(i), type: 'multiple-choice', options: ['x', 'y', 'z'], correctAnswer });
  const free = (i: number): Q => ({ text: stem(i), type: 'text', correctAnswer: 'guide' });
  const promptOf = (call: number) => generateContent.mock.calls[call][0].contents[0].parts[0].text as string;
  const isCheck = (req: { systemInstruction?: string }) => typeof req.systemInstruction === 'string';
  const answers = (list: Array<[number, string]>) => reply(JSON.stringify({ answers: list.map(([n, answer]) => ({ n, answer })) }));
  /** Generation calls are answered from `batches` in order; check calls by `check`. */
  const script = (batches: Q[][], check: (prompt: string, n: number) => unknown = () => answers([])) => {
    let g = 0;
    let c = 0;
    generateContent.mockImplementation(async (req: { systemInstruction?: string; contents: { parts: { text: string }[] }[] }) =>
      isCheck(req) ? check(req.contents[0].parts[0].text, c++) : reply(JSON.stringify({ questions: batches[g++] ?? [] })));
  };
  const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);
  const genCalls = () => generateContent.mock.calls.filter(([req]) => !isCheck(req));
  const checkCalls = () => generateContent.mock.calls.filter(([req]) => isCheck(req));

  it('asks for at most 10 per call and tells later batches the earlier stems', async () => {
    script([range(0, 10).map(i => free(i)), range(10, 20).map(i => free(i))]);
    const out = await generateAssignmentQuestions('Momentum', 20, 'Medium');
    expect(out.questions).toHaveLength(20);
    expect(out.message).toBeUndefined();
    expect(genCalls()).toHaveLength(2);
    expect(promptOf(0)).toContain('Generate 10 ');
    expect(promptOf(0)).not.toContain('ALREADY WRITTEN');
    expect(promptOf(1)).toContain('Generate 10 ');
    expect(promptOf(1)).toContain('ALREADY WRITTEN');
    expect(promptOf(1)).toContain(stem(0));
    expect(promptOf(1)).toContain(stem(9));
    // Free-response questions have nothing to check, so no check call is made.
    expect(checkCalls()).toHaveLength(0);
    expect(out.calls).toBe(2);
    expect(out.usage).toEqual({ inputTokens: 14, outputTokens: 6 });
    expect(GENERATION_BATCH_SIZE).toBe(10);
  });

  it('a request of 10 or fewer is one generation call', async () => {
    script([range(0, 7).map(i => free(i))]);
    const out = await generateAssignmentQuestions('T', 7, 'easy');
    expect(out.questions).toHaveLength(7);
    expect(genCalls()).toHaveLength(1);
    expect(promptOf(0)).toContain('Generate 7 ');
  });

  it('cuts extra questions so the count is exact', async () => {
    script([range(0, 9).map(i => free(i))]);
    const out = await generateAssignmentQuestions('T', 4, 'easy');
    expect(out.questions.map(q => q.text)).toEqual(range(0, 4).map(stem));
    expect(out.message).toBeUndefined();
  });

  it('tops up a short batch with one more call for the missing questions', async () => {
    script([range(0, 3).map(i => free(i)), range(3, 5).map(i => free(i))]);
    const out = await generateAssignmentQuestions('T', 5, 'easy');
    expect(out.questions).toHaveLength(5);
    expect(genCalls()).toHaveLength(2);
    expect(promptOf(1)).toContain('Generate 2 ');
    expect(out.message).toBeUndefined();
  });

  it('returns fewer with an honest message when the model keeps coming back short', async () => {
    script([range(0, 3).map(i => free(i)), [free(3)], range(4, 9).map(i => free(i))]);
    const out = await generateAssignmentQuestions('T', 5, 'easy');
    // ceil(5 / 10) + 1 = 2 generation calls at most.
    expect(genCalls()).toHaveLength(2);
    expect(out.questions).toHaveLength(4);
    expect(out.message).toBe('Made 4 of the 5 questions you asked for.');
  });

  it('drops near-duplicate questions, within a batch and against earlier batches', async () => {
    const twin = { ...free(0), text: stem(0).toUpperCase().replace('?', ' ?') };
    script([[free(0), twin, ...range(1, 10).map(i => free(i))], [{ ...free(1), text: `${stem(1)}  ` }, ...range(10, 14).map(i => free(i))]]);
    const out = await generateAssignmentQuestions('T', 12, 'easy');
    const texts = out.questions.map(q => q.text);
    expect(texts).toHaveLength(12);
    expect(new Set(texts.map(t => t.toLowerCase().replace(/\W+/g, ' ').trim())).size).toBe(12);
    expect(texts).not.toContain(twin.text);
  });

  it('stops with what it has when a batch adds nothing new', async () => {
    script([range(0, 10).map(i => free(i)), range(0, 10).map(i => free(i)), range(10, 20).map(i => free(i))]);
    const out = await generateAssignmentQuestions('T', 20, 'easy');
    expect(out.questions).toHaveLength(10);
    expect(genCalls()).toHaveLength(2);
    expect(out.message).toBe('Made 10 of the 20 questions you asked for.');
  });

  it('keeps the earlier questions when a later batch fails; the first batch failing still fails', async () => {
    let g = 0;
    generateContent.mockImplementation(async () => {
      if (g++ === 0) return reply(JSON.stringify({ questions: range(0, 10).map(i => free(i)) }));
      throw new Error('provider down');
    });
    const out = await generateAssignmentQuestions('T', 20, 'easy');
    expect(out.questions).toHaveLength(10);
    expect(out.message).toBe('Made 10 of the 20 questions you asked for.');
    generateContent.mockReset().mockRejectedValue(new Error('provider down'));
    await expect(generateAssignmentQuestions('T', 20, 'easy')).rejects.toThrow('provider down');
  });

  it('checks each batch with one call at temperature 0 that never sees the answers', async () => {
    const batch = [mc(0, 'y'), { text: stem(1), type: 'true-false', correctAnswer: 'True' }, { text: stem(2), type: 'short-answer', correctAnswer: 'SECRET-KEY 12.5 m/s' }, { ...free(3), correctAnswer: 'SECRET-GUIDE' }];
    script([batch], () => answers([[1, 'B'], [2, 'true'], [3, '12.4 m/s']]));
    const out = await generateAssignmentQuestions('T', 4, 'easy');
    expect(checkCalls()).toHaveLength(1);
    const req = checkCalls()[0][0];
    expect(req.generationConfig.temperature).toBe(0);
    const sent = JSON.stringify(req);
    expect(sent).not.toContain('SECRET');
    expect(sent).not.toContain('correctAnswer');
    expect(req.contents[0].parts[0].text).toContain('A. x\nB. y\nC. z');
    // The free-response question is left out of the check and comes back unchecked.
    expect(req.contents[0].parts[0].text).not.toContain(stem(3));
    expect(out.questions.map(q => q.answerCheck)).toEqual(['agrees', 'agrees', 'agrees', 'unchecked']);
    expect(out.questions.some(q => 'checkedAnswer' in q)).toBe(false);
    expect(out.calls).toBe(2);
    // The check's tokens are counted.
    expect(out.usage).toEqual({ inputTokens: 14, outputTokens: 6 });
  });

  it('flags a question whose key the second solve disagrees with, and says what it got', async () => {
    const batch = [mc(0, 'y'), mc(1, 'x'), { text: stem(2), type: 'true-false', correctAnswer: 'False' }, { text: stem(3), type: 'short-answer', correctAnswer: '9.8 m/s^2' }, { text: stem(4), type: 'short-answer', correctAnswer: 'It increases' }, { text: stem(5), type: 'short-answer', correctAnswer: 'the normal force' }];
    script([batch], () => answers([[1, 'C'], [2, 'x'], [3, 'True'], [4, '4.9 m/s^2'], [5, 'It decreases'], [6, 'Normal force']]));
    const out = await generateAssignmentQuestions('T', 6, 'easy');
    expect(out.questions.map(q => q.answerCheck)).toEqual(['disagrees', 'agrees', 'disagrees', 'disagrees', 'disagrees', 'agrees']);
    expect(out.questions.map(q => q.checkedAnswer)).toEqual(['z', undefined, 'True', '4.9 m/s^2', 'It decreases', undefined]);
    // The generated key is left as it was.
    expect(out.questions[0].correctAnswer).toBe('y');
  });

  it('a question the checker skipped is unchecked', async () => {
    script([[mc(0), mc(1)]], () => answers([[2, 'A']]));
    const out = await generateAssignmentQuestions('T', 2, 'easy');
    expect(out.questions.map(q => q.answerCheck)).toEqual(['unchecked', 'agrees']);
  });

  it.each([
    ['throws', () => { throw new Error('check down'); }],
    ['returns text that is not JSON', () => reply('I think the answers are fine')],
    ['returns the wrong shape', () => reply('{"answers":"B"}')],
    ['returns nothing', () => reply('')],
  ])('still succeeds with every question unchecked when the check call %s', async (_n, check) => {
    script([range(0, 10).map(i => mc(i)), range(10, 12).map(i => mc(i))], check);
    const out = await generateAssignmentQuestions('T', 12, 'easy');
    expect(out.questions).toHaveLength(12);
    expect(out.questions.every(q => q.answerCheck === 'unchecked')).toBe(true);
    expect(out.message).toBeUndefined();
    expect(checkCalls()).toHaveLength(2);
  });

  it('20 questions: two generation calls and two check calls, each check for its own batch', async () => {
    script([range(0, 10).map(i => mc(i)), range(10, 20).map(i => mc(i))], prompt => answers(range(1, 11).map(n => [n, prompt.includes(stem(10)) ? 'B' : 'A'])));
    const out = await generateAssignmentQuestions('T', 20, 'easy');
    expect(genCalls()).toHaveLength(2);
    expect(checkCalls()).toHaveLength(2);
    expect(out.calls).toBe(4);
    expect(out.questions.map(q => q.text)).toEqual(range(0, 20).map(stem));
    expect(out.questions.slice(0, 10).every(q => q.answerCheck === 'agrees')).toBe(true);
    expect(out.questions.slice(10).every(q => q.answerCheck === 'disagrees' && q.checkedAnswer === 'y')).toBe(true);
    expect(out.usage).toEqual({ inputTokens: 28, outputTokens: 12 });
  });
});

describe('answer comparison and duplicates', () => {
  const q = (type: string, correctAnswer: string, options: string[] = []) => ({ text: 'Q', type, correctAnswer, options }) as Parameters<typeof answersAgree>[0];
  it('compares choices by option, whatever form the checker used', () => {
    const question = q('multiple-choice', '20 N', ['10 N', '20 N', '30 N']);
    for (const a of ['B', 'b', 'B.', '(B) 20 N', 'B) 20 N', '20 N', '20 n']) expect(answersAgree(question, a)).toBe(true);
    for (const a of ['A', 'C', '30 N', 'none']) expect(answersAgree(question, a)).toBe(false);
    expect(answersAgree(q('true-false', 'True'), 't')).toBe(true);
    expect(answersAgree(q('true-false', 'True'), 'False')).toBe(false);
  });
  it('compares short answers leniently', () => {
    expect(answersAgree(q('short-answer', '12.5 m/s'), '12.4 m/s')).toBe(true);
    expect(answersAgree(q('short-answer', '12.5 m/s'), '45 km/h')).toBe(true);
    expect(answersAgree(q('short-answer', '12.5 m/s'), '25 m/s')).toBe(false);
    expect(answersAgree(q('short-answer', 'Newton\'s third law'), 'newtons third law.')).toBe(true);
    expect(answersAgree(q('short-answer', 'conservation of momentum'), 'Momentum is conserved (conservation of momentum)')).toBe(true);
    expect(answersAgree(q('short-answer', 'the net force on the cart'), 'net force on cart is zero')).toBe(true);
    expect(answersAgree(q('short-answer', 'kinetic energy'), 'potential energy')).toBe(false);
    expect(answersAgree(q('short-answer', 'friction'), 'gravity')).toBe(false);
  });
  it('knows what can be checked', () => {
    expect(isCheckable(q('text', 'guide'))).toBe(false);
    expect(isCheckable(q('short-answer', ' '))).toBe(false);
    expect(isCheckable(q('multiple-choice', 'a', ['a']))).toBe(false);
    expect(isCheckable(q('multiple-choice', 'a', ['a', 'b']))).toBe(true);
    expect(isCheckable(q('true-false', 'True'))).toBe(true);
  });
  it('finds near-duplicate stems', () => {
    expect(isNearDuplicate('What is the momentum of a $2\\ \\text{kg}$ cart?', 'what is the momentum of a 2 kg cart')).toBe(true);
    expect(isNearDuplicate('A cart of mass 2 kg moves at 3 m/s on a level track. What is its momentum?', 'A cart of mass 2 kg moves at 3 m/s on a level track. What is its momentum, exactly?')).toBe(true);
    expect(isNearDuplicate('What is the momentum of the cart?', 'What is the kinetic energy of the ball?')).toBe(false);
    expect(isNearDuplicate('', '')).toBe(false);
    expect(dropNearDuplicates([{ text: 'One thing' }, { text: 'one thing.' }, { text: 'Another' }], [{ text: 'ANOTHER' }])).toEqual([{ text: 'One thing' }]);
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
