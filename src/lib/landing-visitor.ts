import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const VISITOR_COOKIE = 'scorpio_lv';
export const VISITOR_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

/** Returns the signing secret, or null when it is not configured (callers must fail closed). */
export function getVisitorSecret(): string | null {
  const secret = process.env.LANDING_VISITOR_COOKIE_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}

function sign(id: string, secret: string): string {
  return createHmac('sha256', secret).update(id).digest('base64url');
}

/** Creates a new random visitor id and its signed cookie value `<id>.<hmac>`. */
export function issueVisitorToken(secret: string): { id: string; token: string } {
  const id = randomUUID().replace(/-/g, '');
  return { id, token: `${id}.${sign(id, secret)}` };
}

/** Returns the visitor id if the cookie value carries a valid signature, otherwise null. */
export function verifyVisitorToken(token: string | undefined, secret: string): string | null {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  if (!/^[a-f0-9]{32}$/.test(id)) return null;
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(id, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return id;
}

/**
 * Client IP as seen by the platform proxy. The left-most X-Forwarded-For entries are client supplied
 * and spoofable; the right-most entry is appended by the nearest proxy, so that is the one we trust.
 */
export function clientIp(headers: Headers): string {
  const parts = (headers.get('x-forwarded-for') || '').split(',').map(p => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'unknown-ip';
}

/** Salted hash so raw IPs are never stored. */
export function hashIp(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(`ip:${ip}`).digest('hex').slice(0, 32);
}
