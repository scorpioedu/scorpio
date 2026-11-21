import { buildTeacherPrompt } from '../src/lib/ai/tutor-prompts';

describe('buildTeacherPrompt', () => {
  const base = { historyContext: '', message: 'Write 2 problems on torque', diagrams: false };

  test('speaks to a teacher and allows full answers', () => {
    const p = buildTeacherPrompt(base);
    expect(p).toContain("Teacher's latest message: \"Write 2 problems on torque\"");
    expect(p).toMatch(/full worked solutions with final numerical answers/);
    expect(p).not.toMatch(/Socratic/);
    expect(p).not.toMatch(/Never give away/);
  });

  test('adds the diagram language only when diagrams are on', () => {
    expect(buildTeacherPrompt(base)).not.toContain('=== DIAGRAM LANGUAGE ===');
    expect(buildTeacherPrompt({ ...base, diagrams: true })).toContain('=== DIAGRAM LANGUAGE ===');
  });

  test('includes prior conversation', () => {
    const p = buildTeacherPrompt({ ...base, historyContext: 'HISTORY\n\n' });
    expect(p.indexOf('HISTORY')).toBeLessThan(p.indexOf("Teacher's latest message"));
  });
});
