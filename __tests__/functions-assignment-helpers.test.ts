import { storageObjectForWorkFile, collectSubmissionObjects } from '../functions/src/assignment-cleanup';
import { selectRecipients, mapWithConcurrency } from '../functions/src/assignment-email';

const url = (object: string) => `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent(object)}?alt=media`;

describe('storageObjectForWorkFile (dry-run path computation)', () => {
  test('maps a download URL to the object path', () => {
    expect(storageObjectForWorkFile({ url: url('submissions/s1/1700-hw.pdf') }, 's1')).toBe('submissions/s1/1700-hw.pdf');
  });
  test.each([
    ['other student prefix', url('submissions/s2/a.png'), 's1'],
    ['teacher resources', url('resources/t1/a.mp4'), 's1'],
    ['prefix only', url('submissions/s1/'), 's1'],
    ['traversal', url('submissions/s1/../x'), 's1'],
    ['data url', 'data:image/png;base64,AAAA', 's1'],
    ['garbage', '::nope', 's1'],
    ['empty student', url('submissions//a.png'), ''],
    ['slash in student id', url('submissions/a/b/c.png'), 'a/b'],
    ['no /o/ segment', 'https://example.com/file.png', 's1'],
  ])('rejects %s', (_label, u, student) => {
    expect(storageObjectForWorkFile({ url: u }, student)).toBeNull();
  });
  test('collectSubmissionObjects de-duplicates and tolerates missing workFiles', () => {
    const f = { url: url('submissions/s1/a.png') };
    expect(collectSubmissionObjects([{ studentId: 's1', workFiles: [f, f] }, { studentId: 's1' }, undefined])).toEqual(['submissions/s1/a.png']);
  });
});

describe('selectRecipients', () => {
  const doc = (d: Record<string, unknown>) => ({ data: () => d });
  const docs = [doc({ email: 'a@x', courseId: 'c1' }), doc({ email: 'b@x', courseId: 'c2' }), doc({ courseId: 'c1' }), doc({ email: 'd@x' })];
  test('filters by course when set', () => expect(selectRecipients(docs, 'c1').map(s => s.email)).toEqual(['a@x']));
  test('keeps everyone with an email when no course', () => expect(selectRecipients(docs, undefined).map(s => s.email)).toEqual(['a@x', 'b@x', 'd@x']));
});

describe('mapWithConcurrency', () => {
  test('never exceeds the limit and processes everything', async () => {
    let active = 0; let peak = 0; let done = 0;
    await mapWithConcurrency([...Array(12).keys()], 3, async () => {
      active++; peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, 1));
      active--; done++;
    });
    expect(done).toBe(12);
    expect(peak).toBeLessThanOrEqual(3);
  });
});
