import { cn, downloadCSV } from '../src/lib/utils';

describe('cn', () => {
  it('merges conflicting tailwind classes, last wins', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
  it('drops falsy values and supports conditionals', () => {
    expect(cn('a', false && 'b', null, undefined, { c: true, d: false })).toBe('a c');
  });
});

describe('downloadCSV', () => {
  const link = { href: '', download: '', click: jest.fn() };
  let blobs: Blob[];
  const g = globalThis as unknown as Record<string, unknown>;
  const original = { document: g.document, createObjectURL: URL.createObjectURL };

  beforeEach(() => {
    link.href = ''; link.download = ''; link.click.mockClear();
    blobs = [];
    g.document = { createElement: jest.fn(() => link) };
    URL.createObjectURL = jest.fn((b: Blob | MediaSource) => { blobs.push(b as Blob); return 'blob:fake'; });
  });
  afterEach(() => {
    g.document = original.document;
    URL.createObjectURL = original.createObjectURL;
  });

  it('downloads an empty file when rows are empty', async () => {
    downloadCSV('empty.csv', []);
    expect(link.download).toBe('empty.csv');
    expect(link.href).toBe('blob:fake');
    expect(link.click).toHaveBeenCalledTimes(1);
    expect(await blobs[0].text()).toBe('');
    expect(blobs[0].type).toBe('text/csv;charset=utf-8;');
  });

  it('treats a nullish rows value as empty', async () => {
    downloadCSV('n.csv', undefined as unknown as Record<string, unknown>[]);
    expect(await blobs[0].text()).toBe('');
  });

  it('quotes values, escapes double quotes and leaves null/undefined cells empty', async () => {
    downloadCSV('r.csv', [
      { name: 'Ann "A"', score: 5, note: null },
      { name: 'Bo', score: 0, note: undefined },
    ]);
    expect(await blobs[0].text()).toBe('name,score,note\n"Ann ""A""","5",\n"Bo","0",');
    expect(link.download).toBe('r.csv');
    expect(link.click).toHaveBeenCalledTimes(1);
  });
});
