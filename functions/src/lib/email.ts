import { Resend } from 'resend';
import { render } from '@react-email/components';
import * as React from 'react';
import * as logger from 'firebase-functions/logger';
import { maskEmail } from '../pii';

let resend: Resend | null = null;

export async function sendEmail({
  apiKey,
  to,
  subject,
  react,
  replyTo,
  tag
}: {
  apiKey?: string;
  to: string | string[];
  subject: string;
  react: React.ReactElement;
  /** Where replies go. The From address is send-only: it has no inbox behind it. */
  replyTo?: string;
  /** Which kind of email this is (letters, digits, _ and - only), so Resend can count them apart. */
  tag?: string;
}) {
  const finalApiKey = apiKey || process.env.RESEND_API_KEY;
  if (!finalApiKey) {
    logger.warn("No RESEND_API_KEY found. Skipping email send.");
    return;
  }
  
  if (!resend) {
    resend = new Resend(finalApiKey);
  }
  
  // A plain-text copy for clients that block HTML; a template that fails to render this way still sends.
  const text = await Promise.resolve()
    .then(() => render(react, { plainText: true }))
    .catch(() => undefined);

  try {
    const data = await resend.emails.send({
      from: 'Scorpio <hello@scorpioedu.org>',
      to,
      subject,
      react,
      ...(text ? { text } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(tag ? { tags: [{ name: 'type', value: tag }] } : {}),
    });
    logger.info(`Email sent successfully to ${maskEmail(to)}`, { id: data?.data?.id });
    return data;
  } catch (error) {
    logger.error(`Failed to send email to ${maskEmail(to)}`, { error: error instanceof Error ? error.name : "unknown" });
    throw error;
  }
}
