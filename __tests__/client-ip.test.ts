import { getClientIp } from '../src/lib/client-ip';

const h = (o: Record<string, string>) => new Headers(o);

describe('getClientIp', () => {
  test('prefers x-vercel-forwarded-for over x-real-ip', () => {
    expect(getClientIp(h({ 'x-vercel-forwarded-for': '1.1.1.1', 'x-real-ip': '2.2.2.2' }))).toBe('1.1.1.1');
  });
  test('falls back to x-real-ip', () => {
    expect(getClientIp(h({ 'x-real-ip': '2.2.2.2' }))).toBe('2.2.2.2');
  });
  test('takes the first of multiple entries and trims whitespace', () => {
    expect(getClientIp(h({ 'x-vercel-forwarded-for': '  3.3.3.3 , 4.4.4.4' }))).toBe('3.3.3.3');
  });
  test('never reads x-forwarded-for', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '5.5.5.5' }))).toBeNull();
  });
  test('returns null when absent or empty', () => {
    expect(getClientIp(h({}))).toBeNull();
    expect(getClientIp(h({ 'x-vercel-forwarded-for': ' ,', 'x-real-ip': '' }))).toBeNull();
  });
});
