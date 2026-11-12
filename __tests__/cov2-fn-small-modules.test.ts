// Edge-case behaviour of functions/src/pii.ts, grading-schema.ts and assignment-cleanup.ts.
import { scrubPII } from '../functions/src/pii';
import { assessReviewNeed, gradeWithModel, parseGraderReply } from '../functions/src/grading-schema';
import { collectSubmissionObjects, deleteStorageObjects, storageObjectForWorkFile } from '../functions/src/assignment-cleanup';

jest.mock(require.resolve('../functions/node_modules/firebase-functions/lib/logger/index.js'), () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
import * as logger from '../functions/node_modules/firebase-functions/lib/logger/index.js';

describe('scrubPII edge cases', () => {
  it('returns empty input unchanged', () => {
    expect(scrubPII('')).toBe('');
  });

  it('ignores blank roster entries and does not mask connector words inside multi-word names', () => {
    expect(scrubPII('Ann saw Bob and Tom', ['', 'Ann and Bob', 'Tom'])).toBe('[NAME] saw [NAME] and [NAME]');
  });

  it('masks a full name before its parts and leaves two-letter name parts alone', () => {
    expect(scrubPII('Al Smith met Al and Smith', ['Al Smith'])).toBe('[NAME] met Al and [NAME]');
  });

  it('does not mask a roster name of two characters or fewer', () => {
    expect(scrubPII('Al went home', ['Al'])).toBe('Al went home');
  });

  it('keeps the allowed public contact address but masks other emails', () => {
    expect(scrubPII('write rushil@scorpioedu.org or kid@school.org', [], 'contact')).toBe('write rushil@scorpioedu.org or [EMAIL]');
  });
});

describe('parseGraderReply score coercion', () => {
  it('rejects a score that overflows to infinity', () => {
    expect(parseGraderReply('{"score": 1e999}')).toEqual({ ok: false, reason: 'score is missing or not numeric' });
  });
  it('rejects a fraction with a zero denominator', () => {
    expect(parseGraderReply('{"score": "5/0"}')).toEqual({ ok: false, reason: 'score is missing or not numeric' });
  });
  it('rescales a fraction string to the maximum score', () => {
    expect(parseGraderReply('{"score": "4/8"}')).toMatchObject({ ok: true, value: { score: 5 } });
  });
  it('rejects a score that is neither a number nor a string', () => {
    expect(parseGraderReply('{"score": true}')).toMatchObject({ ok: false });
  });
});

describe('assessReviewNeed without a rubric', () => {
  const longQuestion = 'What is the SI unit of electric potential difference?';
  it('flags full marks for a short non-numeric answer when there is no rubric to match', () => {
    expect(assessReviewNeed({ question: longQuestion, answer: 'volt', score: 10 }).needsReview).toBe(true);
  });
  it('does not flag the same answer when the rubric contains it', () => {
    expect(assessReviewNeed({ question: longQuestion, answer: 'volt', rubric: 'The volt (V)', score: 10 })).toEqual({ needsReview: false });
  });
});

describe('gradeWithModel feedback fallbacks', () => {
  const reply = (extra: Record<string, unknown>) => async () => ({ text: JSON.stringify({ score: 5, ...extra }) });
  const inputs = { question: 'q', answer: 'a' };

  it('uses the model feedback when present', async () => {
    expect((await gradeWithModel(inputs, reply({ student_feedback: 'good' }), { defaultFeedback: 'dflt' })).feedback).toBe('good');
  });
  it('falls back to the configured default feedback', async () => {
    expect((await gradeWithModel(inputs, reply({}), { defaultFeedback: 'dflt' })).feedback).toBe('dflt');
  });
  it('falls back to a generic message when no default is configured', async () => {
    expect((await gradeWithModel(inputs, reply({}))).feedback).toBe('No feedback provided.');
  });
  it('rejects an empty model reply', async () => {
    await expect(gradeWithModel(inputs, async () => ({ text: '' }))).rejects.toThrow('AI returned empty response');
  });
});

describe('assignment-cleanup edge cases', () => {
  const url = (object: string) => `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent(object)}?alt=media`;

  it('rejects a missing file reference', () => {
    expect(storageObjectForWorkFile(undefined as never, 'stu')).toBeNull();
    expect(storageObjectForWorkFile(null as never, 'stu')).toBeNull();
  });

  it('skips submissions that are missing or have no workFiles array, and null file entries', () => {
    const objects = collectSubmissionObjects([
      undefined,
      { studentId: 'stu', workFiles: 'not-an-array' },
      { studentId: 'stu', workFiles: [null, { url: url('submissions/stu/a.png') }, { url: url('submissions/other/b.png') }] },
    ]);
    expect(objects).toEqual(['submissions/stu/a.png']);
  });

  it('reports a failed delete (non-Error rejection) without throwing and keeps deleting the rest', async () => {
    const deleted: string[] = [];
    const bucket = {
      file: (name: string) => ({
        delete: async (opts: { ignoreNotFound: boolean }) => {
          expect(opts).toEqual({ ignoreNotFound: true });
          if (name === 'bad') throw 'quota exceeded';
          deleted.push(name);
        },
      }),
    };
    expect(await deleteStorageObjects(bucket, ['bad', 'good'])).toEqual(['bad']);
    expect(deleted).toEqual(['good']);
    expect(logger.error).toHaveBeenCalledWith('Failed to delete storage object bad', { error: 'unknown' });
  });
});
