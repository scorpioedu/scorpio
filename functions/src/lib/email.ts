import { Resend } from 'resend';
import { render } from '@react-email/components';
import * as React from 'react';
import * as logger from 'firebase-functions/logger';
import { maskEmail } from '../pii';

let resend: Resend | null = null;

const FROM = 'Scorpio <hello@scorpioedu.org>';
/** Resend's batch endpoint takes at most 100 emails per call. */
const BATCH_SIZE = 100;
/** Resend allows a few requests per second per team; space calls and retry when it says to slow down. */
const MIN_GAP_MS = 600;
const RATE_LIMIT_RETRIES = 3;

export interface EmailMessage {
  to: string | string[];
  subject: string;
  react: React.ReactElement;
  /** Where replies go. The From address is send-only: it has no inbox behind it. */
  replyTo?: string;
  /** Which kind of email this is (letters, digits, _ and - only), so Resend can count them apart. */
  tag?: string;
}

/** Resend returns failures as `{ error }` rather than throwing; this turns them into a thrown Error. */
export class EmailSendError extends Error {
  constructor(public readonly code: string, public readonly statusCode: number | null) {
    super(`Resend rejected the email (${code})`);
    this.name = 'EmailSendError';
  }
}

function client(apiKey?: string): Resend | null {
  const finalApiKey = apiKey || process.env.RESEND_API_KEY;
  if (!finalApiKey) {
    logger.warn("No RESEND_API_KEY found. Skipping email send.");
    return null;
  }
  if (!resend) resend = new Resend(finalApiKey);
  return resend;
}

/** A plain-text copy for clients that block HTML; a template that fails to render this way still sends. */
async function plainText(react: React.ReactElement): Promise<string | undefined> {
  return Promise.resolve()
    .then(() => render(react, { plainText: true }))
    .catch(() => undefined);
}

async function payload(message: EmailMessage) {
  const text = await plainText(message.react);
  return {
    from: FROM,
    to: message.to,
    subject: message.subject,
    react: message.react,
    ...(text ? { text } : {}),
    ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    ...(message.tag ? { tags: [{ name: 'type', value: message.tag }] } : {}),
  };
}

type ProviderError = { name?: string; statusCode?: number | null } | null | undefined;

function asError(error: ProviderError): EmailSendError | null {
  if (!error) return null;
  return new EmailSendError(String(error.name ?? 'unknown'), error.statusCode ?? null);
}

const isRateLimit = (e: EmailSendError) => e.statusCode === 429 || e.code === 'rate_limit_exceeded';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let lastCallAt = 0;
/** Runs `call`, keeping calls from this instance apart and retrying when Resend rate-limits. */
async function paced<T extends { error?: ProviderError } | undefined>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    const result = await call();
    const error = asError(result?.error);
    if (!error) return result;
    if (!isRateLimit(error) || attempt >= RATE_LIMIT_RETRIES) throw error;
    await sleep(1000 * 2 ** attempt);
  }
}

export async function sendEmail({ apiKey, ...message }: EmailMessage & { apiKey?: string }) {
  const resendClient = client(apiKey);
  if (!resendClient) return;
  const body = await payload(message);
  try {
    const data = await paced(() => resendClient.emails.send(body));
    logger.info(`Email sent successfully to ${maskEmail(message.to)}`, { id: data?.data?.id });
    return data;
  } catch (error) {
    logger.error(`Failed to send email to ${maskEmail(message.to)}`, {
      error: error instanceof EmailSendError ? error.code : error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
}

/**
 * Sends many emails (one per recipient) through Resend's batch endpoint, 100 per call, so a whole
 * class goes out in a few requests instead of tripping the rate limit. A failed chunk is logged and
 * the rest still go. Returns how many were accepted.
 */
export async function sendEmailBatch({ apiKey, messages }: { apiKey?: string; messages: EmailMessage[] }) {
  if (messages.length === 0) return 0;
  const resendClient = client(apiKey);
  if (!resendClient) return 0;
  let sent = 0;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);
    try {
      const bodies = await Promise.all(chunk.map(payload));
      // Permissive: one malformed address is skipped instead of failing the whole class.
      const result = await paced(() => resendClient.batch.send(bodies, { batchValidation: 'permissive' }));
      const rejected = result?.data?.errors?.length ?? 0;
      if (rejected > 0) logger.warn(`Resend skipped ${rejected} of ${chunk.length} emails in a batch`);
      sent += chunk.length - rejected;
    } catch (error) {
      logger.error(`Failed to send ${chunk.length} emails`, {
        error: error instanceof EmailSendError ? error.code : error instanceof Error ? error.name : "unknown",
      });
    }
  }
  logger.info(`Batch email sent`, { requested: messages.length, sent });
  return sent;
}
