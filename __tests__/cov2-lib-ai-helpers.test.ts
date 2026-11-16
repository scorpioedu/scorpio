/**
 * Branch coverage for the usage-token fallbacks and prompt branches of the AI helper modules
 * (network, chatbot, tutor, assignment). The Gemini model is mocked; no real service is called.
 */
const generateContent = jest.fn();
jest.mock('../src/lib/ai/config', () => ({
  model: { generateContent: (...a: unknown[]) => generateContent(...a) },
  CONTEXT_WINDOW_SIZE: 10,
}));
jest.mock('../src/lib/firebase-admin', () => ({ adminDb: {} }));

import { getNetworkLimitsHelp, generateStudentPortfolio, type NetworkLimitsContext } from '../src/lib/ai/network';
import { getNavigationResponse, getLandingChatbotResponse } from '../src/lib/ai/chatbot';
import { explainPhysicsConcept, helpSolveProblem } from '../src/lib/ai/tutor';
import { generateAssignmentQuestions, parseQuestionsFromText } from '../src/lib/ai/assignment';
import { AiOutputError } from '../src/lib/ai/errors';

/** A model reply whose usageMetadata is optional, to exercise the `|| 0` fallbacks. */
const reply = (text: string | undefined, usageMetadata?: Record<string, number>, extra: Record<string, unknown> = {}) => ({
  response: Promise.resolve({ text: () => text, usageMetadata, ...extra }),
});
const promptOf = () => generateContent.mock.calls[0][0].contents[0].parts[0].text as string;

beforeEach(() => {
  generateContent.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const NO_USAGE = { inputTokens: 0, outputTokens: 0 };

describe('chatbot', () => {
  it('navigation response reports zero tokens when usage is absent', async () => {
    generateContent.mockResolvedValue(reply('hi'));
    expect(await getNavigationResponse('where?', 'student', 'feat', 'sys')).toEqual({ text: 'hi', usage: NO_USAGE });
  });

  it('navigation response reports zero tokens when the counts are missing from usage', async () => {
    generateContent.mockResolvedValue(reply('hi', {}));
    expect((await getNavigationResponse('where?', 'teacher', 'feat', 'sys')).usage).toEqual(NO_USAGE);
    expect(promptOf()).toContain('TEACHER FEATURES:');
  });

  it('navigation response passes through real token counts', async () => {
    generateContent.mockResolvedValue(reply('hi', { promptTokenCount: 11, candidatesTokenCount: 22 }));
    expect((await getNavigationResponse('q', 'student', 'f', 's')).usage).toEqual({ inputTokens: 11, outputTokens: 22 });
  });

  it('landing response reports zero tokens when usage is absent or partial', async () => {
    generateContent.mockResolvedValue(reply('a'));
    expect((await getLandingChatbotResponse('q', 's')).usage).toEqual(NO_USAGE);
    generateContent.mockResolvedValue(reply('a', {}));
    expect((await getLandingChatbotResponse('q', 's')).usage).toEqual(NO_USAGE);
  });

  it('landing response passes through real token counts and embeds the visitor question', async () => {
    generateContent.mockResolvedValue(reply('a', { promptTokenCount: 5, candidatesTokenCount: 6 }));
    expect((await getLandingChatbotResponse('what is it', 'sys')).usage).toEqual({ inputTokens: 5, outputTokens: 6 });
    expect(promptOf()).toBe('sys\n\nVisitor question: what is it');
  });
});

describe('tutor', () => {
  it('explainPhysicsConcept reports zero tokens when usage is absent or partial', async () => {
    generateContent.mockResolvedValue(reply('x'));
    expect((await explainPhysicsConcept('force')).usage).toEqual(NO_USAGE);
    generateContent.mockResolvedValue(reply('x', {}));
    expect((await explainPhysicsConcept('force')).usage).toEqual(NO_USAGE);
  });

  it('explainPhysicsConcept passes through real token counts', async () => {
    generateContent.mockResolvedValue(reply('x', { promptTokenCount: 8, candidatesTokenCount: 9 }));
    expect((await explainPhysicsConcept('force')).usage).toEqual({ inputTokens: 8, outputTokens: 9 });
  });

  it('helpSolveProblem reports zero tokens when usage is absent or partial', async () => {
    generateContent.mockResolvedValue(reply('x'));
    expect((await helpSolveProblem('p')).usage).toEqual(NO_USAGE);
    generateContent.mockResolvedValue(reply('x', {}));
    expect((await helpSolveProblem('p')).usage).toEqual(NO_USAGE);
  });

  it('helpSolveProblem passes through real token counts', async () => {
    generateContent.mockResolvedValue(reply('x', { promptTokenCount: 1, candidatesTokenCount: 2 }));
    expect((await helpSolveProblem('p')).usage).toEqual({ inputTokens: 1, outputTokens: 2 });
  });
});

const ctx = (over: Partial<NetworkLimitsContext> = {}): NetworkLimitsContext => ({
  orgName: 'Org', planId: 'free', aiBudgetLimit: 1000, aiUsageCurrent: 250, notebookLimitPerStudent: 3,
  aiNotebookLimitPerStudent: 4, aiTutorLimitPerStudent: 5, studentCount: 30, ...over,
});

describe('getNetworkLimitsHelp', () => {
  it('shows the free-plan label, budget percentage and reports zero usage without metadata', async () => {
    generateContent.mockResolvedValue(reply('ok'));
    const out = await getNetworkLimitsHelp('q', [], ctx());
    expect(out).toEqual({ text: 'ok', usage: NO_USAGE });
    expect(promptOf()).toContain('Plan: Free (upgrade required for most features)');
    expect(promptOf()).toContain('(25.0%)');
    expect(promptOf()).not.toContain('Previous conversation history');
  });

  it('shows the plan id, 0% for a zero budget and renders prior turns with roles', async () => {
    generateContent.mockResolvedValue(reply('ok', { promptTokenCount: 2 }));
    const history = [{ role: 'user' as const, content: 'hello' }, { role: 'assistant' as const, content: 'hey' }];
    const out = await getNetworkLimitsHelp('q', history, ctx({ planId: 'dept', aiBudgetLimit: 0 }));
    expect(out.usage).toEqual({ inputTokens: 2, outputTokens: 0 });
    expect(promptOf()).toContain('Plan: dept');
    expect(promptOf()).toContain('(0%)');
    expect(promptOf()).toContain('Teacher: hello\nRaise: hey');
    expect(promptOf()).toContain('Remaining headroom: $0.0000');
  });

  it('reports output tokens when present and none for input', async () => {
    generateContent.mockResolvedValue(reply('ok', { candidatesTokenCount: 7 }));
    expect((await getNetworkLimitsHelp('q', [], ctx())).usage).toEqual({ inputTokens: 0, outputTokens: 7 });
  });

  it('logs and rethrows model failures', async () => {
    const boom = new Error('model down');
    generateContent.mockRejectedValue(boom);
    await expect(getNetworkLimitsHelp('q', [], ctx())).rejects.toBe(boom);
    expect(console.error).toHaveBeenCalledWith('Network limits assistant error:', boom);
  });
});

describe('generateStudentPortfolio', () => {
  const good = JSON.stringify({ strengths: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], weaknesses: ['w'], masteryLevel: 'Expert', aiSummary: 'summary' });

  it('uses a no-evidence prompt when there is no history', async () => {
    generateContent.mockResolvedValue(reply(good));
    await generateStudentPortfolio('Ada', []);
    expect(promptOf()).toContain('insufficient evidence');
    expect(promptOf()).not.toContain('RECENT RAISE SESSIONS');
  });

  it('renders both roles, scrubs the student name, truncates lists to five and keeps a valid level', async () => {
    generateContent.mockResolvedValue(reply(good, { promptTokenCount: 4, candidatesTokenCount: 6 }));
    const out = await generateStudentPortfolio('Ada', [{ role: 'user', content: 'I am Ada' }, { role: 'assistant', content: 'Hi' }]);
    expect(promptOf()).toContain('Student: I am [NAME]');
    expect(promptOf()).toContain('Raise: Hi');
    expect(out.portfolio.strengths).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(out.portfolio.weaknesses).toEqual(['w']);
    expect(out.portfolio.masteryLevel).toBe('Expert');
    expect(out.portfolio.aiSummary).toBe('summary');
    expect(out.usage).toEqual({ inputTokens: 4, outputTokens: 6 });
  });

  it('falls back to defaults for an unknown level and non-array or missing fields', async () => {
    generateContent.mockResolvedValue(reply(JSON.stringify({ masteryLevel: 'Wizard', strengths: 'nope', weaknesses: 7 })));
    const out = await generateStudentPortfolio('Ada', []);
    expect(out.portfolio).toEqual({
      strengths: ['Engaging with Raise'],
      weaknesses: ['Needs more practice'],
      masteryLevel: 'Beginner',
      aiSummary: 'The student has primarily been using Raise casually. More intensive sessions are needed for a deeper analysis.',
    });
    expect(out.usage).toEqual(NO_USAGE);
  });

  it('extracts the JSON object from surrounding prose', async () => {
    generateContent.mockResolvedValue(reply(`Sure! ${good} Hope that helps`));
    expect((await generateStudentPortfolio('Ada', [])).portfolio.aiSummary).toBe('summary');
  });

  it('recovers JSON with trailing commas and raw newlines through the sanitiser', async () => {
    generateContent.mockResolvedValue(reply('{"strengths": ["a",], "weaknesses": ["w"],\n"masteryLevel": "Advanced", "aiSummary": "ok",}'));
    const out = await generateStudentPortfolio('Ada', []);
    expect(out.portfolio.strengths).toEqual(['a']);
    expect(out.portfolio.masteryLevel).toBe('Advanced');
  });

  it('throws AiOutputError when the text is not JSON at all', async () => {
    generateContent.mockResolvedValue(reply('no json here'));
    await expect(generateStudentPortfolio('Ada', [])).rejects.toBeInstanceOf(AiOutputError);
    expect(console.error).toHaveBeenCalledWith('Error generating student portfolio:', expect.any(AiOutputError));
  });
});

describe('assignment', () => {
  it('parseQuestionsFromText reports zero usage when the model gives no metadata', async () => {
    generateContent.mockResolvedValue(reply('[{"text":"What is the speed of light?","type":"text"}]'));
    const out = await parseQuestionsFromText('1. What is the speed of light?');
    expect(out.questions).toHaveLength(1);
    expect(out.usage).toEqual(NO_USAGE);
  });

  it('parseQuestionsFromText reports zero for a missing count and sums real ones', async () => {
    generateContent.mockResolvedValue(reply('[{"text":"What is the speed of light?","type":"text"}]', { promptTokenCount: 5 }));
    const out = await parseQuestionsFromText('1. What is the speed of light?');
    expect(out.usage).toEqual({ inputTokens: 5, outputTokens: 0 });
    generateContent.mockResolvedValue(reply('[{"text":"What is the speed of light?","type":"text"}]', { candidatesTokenCount: 9 }));
    expect((await parseQuestionsFromText('1. What is the speed of light?')).usage).toEqual({ inputTokens: 0, outputTokens: 9 });
  });

  it('generateAssignmentQuestions reports zero usage without metadata', async () => {
    generateContent.mockResolvedValue(reply('[{"text":"Question text long enough","type":"text","correctAnswer":"a"}]'));
    const out = await generateAssignmentQuestions('Waves', 1, 'easy');
    expect(out.usage).toEqual(NO_USAGE);
  });

  it('generateAssignmentQuestions reports each count independently', async () => {
    generateContent.mockResolvedValue(reply('[{"text":"Question text long enough","type":"text","correctAnswer":"a"}]', { candidatesTokenCount: 3 }));
    expect((await generateAssignmentQuestions('Waves', 1, 'easy')).usage).toEqual({ inputTokens: 0, outputTokens: 3 });
  });

  it('generateAssignmentQuestions treats a model reply with no text as empty', async () => {
    generateContent.mockResolvedValue(reply(undefined));
    await expect(generateAssignmentQuestions('Waves', 1, 'easy')).rejects.toBeInstanceOf(AiOutputError);
  });
});
