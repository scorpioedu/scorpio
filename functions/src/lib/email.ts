import { Resend } from 'resend';
import * as React from 'react';
import * as logger from 'firebase-functions/logger';
import { maskEmail } from '../pii';

let resend: Resend | null = null;

export async function sendEmail({
  apiKey,
  to,
  subject,
  react,
  replyTo
}: {
  apiKey?: string;
  to: string | string[];
  subject: string;
  react: React.ReactElement;
  /** Where replies go. The From address is send-only: it has no inbox behind it. */
  replyTo?: string;
}) {
  const finalApiKey = apiKey || process.env.RESEND_API_KEY;
  if (!finalApiKey) {
    logger.warn("No RESEND_API_KEY found. Skipping email send.");
    return;
  }
  
  if (!resend) {
    resend = new Resend(finalApiKey);
  }
  
  try {
    const data = await resend.emails.send({
      from: 'Scorpio Platform <hello@scorpioedu.org>', 
      to,
      subject,
      react,
      ...(replyTo ? { replyTo } : {}),
    });
    logger.info(`Email sent successfully to ${maskEmail(to)}`, { id: data?.data?.id });
    return data;
  } catch (error) {
    logger.error(`Failed to send email to ${maskEmail(to)}`, { error: error instanceof Error ? error.name : "unknown" });
    throw error;
  }
}
