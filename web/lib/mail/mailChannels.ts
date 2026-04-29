import { createSmtpTransport, type SmtpAuth } from './smtpTransport';

/**
 * Logical senders — each maps to Zoho SMTP credentials (mailbox + app password).
 * Use `auth` for security-sensitive mail; `noreply` for one-way product notices.
 * Add more channels by extending this type and the resolver below.
 */
export type MailChannelId = 'auth' | 'noreply';

export type ResolvedMailChannel = {
  id: MailChannelId;
  auth: SmtpAuth;
  from: string;
};

/**
 * Resolves SMTP user/pass/from for a channel. Falls back to primary SMTP_* for
 * no-reply when SMTP_NOREPLY_* is omitted (same mailbox — use only if Zoho allows
 * that From address via alias / send-as).
 */
export function resolveMailChannel(
  channel: MailChannelId = 'auth',
): ResolvedMailChannel | null {
  if (channel === 'noreply') {
    const user =
      process.env.SMTP_NOREPLY_USER?.trim() || process.env.SMTP_USER?.trim();
    const pass =
      process.env.SMTP_NOREPLY_PASS?.trim() || process.env.SMTP_PASS?.trim();
    const from =
      process.env.SMTP_NOREPLY_FROM?.trim() ||
      '"BirgenAI" <no-reply@birgenai.com>';
    if (!user || !pass) return null;
    return { id: channel, auth: { user, pass }, from };
  }

  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from =
    process.env.SMTP_FROM?.trim() || '"BirgenAI Security" <auth@birgenai.com>';
  if (!user || !pass) return null;
  return { id: channel, auth: { user, pass }, from };
}

export function getTransportForChannel(channel: MailChannelId = 'auth') {
  const resolved = resolveMailChannel(channel);
  if (!resolved) return null;
  return {
    transport: createSmtpTransport(resolved.auth),
    from: resolved.from,
  };
}

export function smtpNotConfiguredMessage(): string {
  return 'Email is not configured. Set SMTP_USER and SMTP_PASS (Zoho SMTP) in the server environment.';
}
