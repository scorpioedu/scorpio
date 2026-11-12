import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from './firebase-admin';
import { getClientIp } from './client-ip';
import { RATE_LIMITS, type RateLimitKind, type RateLimitPolicy } from './rate-limit-config';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  error?: string;
  /** Seconds until the current window ends; set when the request was blocked for exceeding the limit. */
  retryAfterSeconds?: number;
  /** True when the check itself could not run (no database, Firestore error), not when the limit was hit. */
  unavailable?: boolean;
}

/**
 * Checks if a request exceeds the configured rate limit.
 * Uses Firestore to track counts within a sliding window.
 */
export async function checkRateLimit(
  req: NextRequest,
  userId: string | undefined | null,
  endpointType: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  if (!adminDb) return { allowed: false, error: "Database not initialized", unavailable: true };

  // Authenticated callers are keyed by uid (many students share one school IP). Anonymous callers are
  // keyed by the platform-trusted client IP (RT-11); x-forwarded-for is client-controlled and never read.
  // With no trusted IP every anonymous caller shares one bucket, so rotating headers cannot escape it.
  const identifier = userId || `ip_${getClientIp(req.headers) ?? "unknown-ip"}`;
  
  if (!identifier) {
    return { allowed: false, error: "Unable to identify requestor" };
  }

  const { windowMs, maxRequests } = config;
  
  // Create a unique id for the user + endpoint. Replace invalid characters for Firestore Document ID
  const docId = `${endpointType}_${identifier.replace(/\//g, '_')}`;
  
  try {
    const rateLimitRef = adminDb.collection('rate_limits').doc(docId);
    
    // We can use a transaction to safely read and increment
    return await adminDb.runTransaction(async (transaction) => {
      const doc = await transaction.get(rateLimitRef);
      const now = Date.now();
      
      let usage = { count: 0, windowStart: now };
      if (doc.exists) {
        const data = doc.data();
        if (data) {
          usage = { count: data.count, windowStart: data.windowStart };
        }
      }

      // Reset window if it has passed
      if (now - usage.windowStart > windowMs) {
        usage.count = 0;
        usage.windowStart = now;
      }

      if (usage.count >= maxRequests) {
        const minutes = Math.round(windowMs / 1000 / 60);
        return {
          allowed: false,
          error: `Rate limit exceeded. Max ${maxRequests} requests per ${minutes > 0 ? minutes + ' minutes' : windowMs + ' ms'}.`,
          retryAfterSeconds: Math.max(1, Math.ceil((usage.windowStart + windowMs - now) / 1000)),
        };
      }

      // Increment usage count
      usage.count++;
      // expiresAt lets a Firestore TTL policy on rate_limits.expiresAt delete idle buckets (HUMAN-TODO).
      transaction.set(rateLimitRef, { ...usage, expiresAt: new Date(usage.windowStart + windowMs) }, { merge: true });
      
      return { allowed: true };
    });
  } catch (err) {
    console.error(`Error in checkRateLimit for ${identifier}:`, err);
    // Fail closed on error
    return { allowed: false, error: "Rate limit check failed", unavailable: true };
  }
}

/**
 * Enforces the budget configured for `kind` (rate-limit-config.ts). Returns the 429 response to send
 * (with Retry-After) or null to continue. Pass the verified uid for authenticated routes; omit it to key by IP.
 * Policies marked `onError: "open"` let the request through when the limiter itself is unavailable, so a
 * Firestore outage never turns routes that did not have a limiter before into 429s.
 */
export async function enforceRateLimit(req: NextRequest, kind: RateLimitKind, uid?: string | null): Promise<NextResponse | null> {
  const policy: RateLimitPolicy = RATE_LIMITS[kind];
  if (!uid && !getClientIp(req.headers) && policy.noIp !== undefined) {
    // No trusted IP (not behind Vercel): per-IP limiting is impossible, so never share a tiny bucket.
    if (policy.noIp === "skip") return null;
    const anon = await checkRateLimit(req, "anon", `anon_${kind}`, { windowMs: policy.windowMs, maxRequests: policy.noIp });
    if (anon.allowed || anon.unavailable) return null;
    return NextResponse.json(
      { error: anon.error },
      { status: 429, headers: anon.retryAfterSeconds ? { "Retry-After": String(anon.retryAfterSeconds) } : undefined }
    );
  }
  const result = await checkRateLimit(req, uid, kind, policy);
  if (result.allowed) return null;
  if (result.unavailable && policy.onError === "open") return null;
  return NextResponse.json(
    { error: result.error },
    { status: 429, headers: result.retryAfterSeconds ? { "Retry-After": String(result.retryAfterSeconds) } : undefined }
  );
}
