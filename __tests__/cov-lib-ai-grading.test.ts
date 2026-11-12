const generateContent = jest.fn();
jest.mock('../src/lib/ai/config', () => ({ model: { generateContent: (...a: unknown[]) => generateContent(...a) } }));
jest.mock('../src/lib/firebase-admin', () => ({ adminDb: {} }));

import { gradeResponse, synthesizeRubric, validateResponse } from '../src/lib/ai/grading';

const resp = (over: Record<string, unknown> = {}) => ({
  response: Promise.resolve({
    text: () => JSON.stringify({ score: 7, feedback: 'Good', reasoning: 'because' }),
    usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 5 },
    ...over,
  }),
});

beforeEach(() => {
  generateContent.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('gradeResponse', () => {
  it('returns a zero grade without calling the model when question or answer is missing', async () => {
    expect(await gradeResponse('', 'a')).toEqual({ score: 0, feedback: 'Missing question or answer text for grading.' });
    expect(await gradeResponse('q', '')).toEqual({ score: 0, feedback: 'Missing question or answer text for grading.' });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('grades via the model and passes usage through', async () => {
    generateContent.mockResolvedValue(resp());
    const out = await gradeResponse('Explain why the sky appears blue during the day', 'Rayleigh scattering of short wavelengths by air molecules', 'rubric');
    expect(out).toMatchObject({ score: 7, feedback: 'Good', reasoning: 'because', usage: { inputTokens: 11, outputTokens: 5 } });
    const arg = generateContent.mock.calls[0][0];
    expect(arg.scrubLevel).toBe('full');
    expect(arg.generationConfig).toMatchObject({ temperature: 0.1, responseMimeType: 'application/json' });
  });

  it('scrubs student names from the prompt', async () => {
    generateContent.mockResolvedValue(resp());
    await gradeResponse('Explain Newton first law of motion please', 'Zachariah Quimby said objects stay in motion', undefined, ['Zachariah Quimby']);
    const prompt = JSON.stringify(generateContent.mock.calls[0][0].contents);
    expect(prompt).not.toContain('Zachariah Quimby');
  });

  it('defaults token usage to 0 when metadata is absent', async () => {
    generateContent.mockResolvedValue(resp({ usageMetadata: undefined }));
    const out = await gradeResponse('Explain why the sky appears blue during the day', 'Scattering of light by atmosphere particles');
    expect(out.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('maps a SAFETY block to the generic manual-review error', async () => {
    generateContent.mockResolvedValue(resp({
      text: () => { throw new Error('blocked'); },
      candidates: [{ finishReason: 'SAFETY' }],
    }));
    await expect(gradeResponse('q question here long', 'a')).rejects.toThrow('AI grading unavailable; manual review required');
    expect(console.error).toHaveBeenCalledWith('Error in gradeResponse:', 'Response blocked; manual review required');
  });

  it('rethrows other text() errors as the generic error', async () => {
    generateContent.mockResolvedValue(resp({ text: () => { throw new Error('odd'); } }));
    await expect(gradeResponse('q question here long', 'a')).rejects.toThrow('AI grading unavailable');
    expect(console.error).toHaveBeenCalledWith('Error in gradeResponse:', 'odd');
  });

  it('hides non-Error rejections behind the generic error', async () => {
    generateContent.mockRejectedValue('nope');
    await expect(gradeResponse('q question here long', 'a')).rejects.toThrow('AI grading unavailable');
    expect(console.error).toHaveBeenCalledWith('Error in gradeResponse:', 'nope');
  });

  it('rejects unparseable model output', async () => {
    generateContent.mockResolvedValue(resp({ text: () => 'not json' }));
    await expect(gradeResponse('q question here long', 'a')).rejects.toThrow('AI grading unavailable');
  });
});

describe('synthesizeRubric', () => {
  it('returns text and usage and embeds topic and question in the prompt', async () => {
    generateContent.mockResolvedValue(resp({ text: () => '# Rubric' }));
    const out = await synthesizeRubric('What is torque?', 'Rotation');
    expect(out).toEqual({ text: '# Rubric', usage: { inputTokens: 11, outputTokens: 5 } });
    const prompt = generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
    expect(prompt).toContain('"Rotation"');
    expect(prompt).toContain('"What is torque?"');
  });
  it('defaults missing usage to zero', async () => {
    generateContent.mockResolvedValue(resp({ text: () => 'x', usageMetadata: undefined }));
    expect((await synthesizeRubric('q', 't')).usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

describe('validateResponse', () => {
  it('passes a clean response with units', () => {
    expect(validateResponse('The force is 5 N')).toEqual({ passed: true, violations: [] });
  });
  it('flags a direct numeric answer to a problem-solving question', () => {
    const r = validateResponse('42 m', 'Calculate the distance');
    expect(r.violations).toContain('Direct numerical answer without guidance');
  });
  it('does not flag guided answers for problem-solving questions', () => {
    const r = validateResponse('Think about it: 42 m', 'Calculate the distance');
    expect(r.violations).not.toContain('Direct numerical answer without guidance');
  });
  it('does not apply the guidance rule to declarative questions', () => {
    expect(validateResponse('42 m', 'What is distance?').violations).not.toContain('Direct numerical answer without guidance');
  });
  it('flags numbers lacking units', () => {
    const r = validateResponse('The answer is 42.');
    expect(r.passed).toBe(false);
    expect(r.violations).toContain('Missing units on numerical values');
  });
  it('flags vectors without \\vec notation but accepts them with it', () => {
    expect(validateResponse('A vector quantity').violations).toContain('Missing vector notation when discussing vectors');
    expect(validateResponse('A vector $\\vec{v}$').violations).toEqual([]);
  });
});
