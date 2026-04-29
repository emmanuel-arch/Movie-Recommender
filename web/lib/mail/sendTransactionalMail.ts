import type { Attachment } from 'nodemailer/lib/mailer';
import type { MailChannelId } from './mailChannels';
import { getTransportForChannel, smtpNotConfiguredMessage } from './mailChannels';

export type SendTransactionalMailParams = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Defaults to `auth` (security / account mail). */
  channel?: MailChannelId;
  replyTo?: string;
  /** PDF invoices, quotations, etc. */
  attachments?: Attachment[];
};

/**
 * Single entry point for HTML + text transactional mail over Zoho SMTP.
 * Reuse `birgenTransactionalLayout` builders for `html` / `text` so structure stays consistent.
 */
export async function sendTransactionalMail({
  to,
  subject,
  text,
  html,
  channel = 'auth',
  replyTo,
  attachments,
}: SendTransactionalMailParams): Promise<void> {
  const resolved = getTransportForChannel(channel);
  if (!resolved) {
    throw new Error(smtpNotConfiguredMessage());
  }

  const { transport, from } = resolved;

  await transport.sendMail({
    from,
    to,
    subject,
    text,
    html,
    ...(replyTo ? { replyTo } : {}),
    ...(attachments?.length ? { attachments } : {}),
  });
}
