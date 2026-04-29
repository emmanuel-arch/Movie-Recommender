/**
 * Sends a real OTP-style email using the production HTML template.
 * From `web/`:
 *   npm run email:test -- your@email.com
 *   npm run email:test -- your@email.com noreply
 *
 * Second argument selects SMTP channel (see `lib/mail/mailChannels.ts`).
 */
import { buildOtpVerificationEmailParts } from '../lib/mail/birgenTransactionalLayout';
import type { MailChannelId } from '../lib/mail/mailChannels';
import { sendTransactionalMail } from '../lib/mail/sendTransactionalMail';

const CHANNELS = new Set<MailChannelId>(['auth', 'noreply']);

function parseArgs() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const to = args.find((a) => a.includes('@')) ?? 'no-reply@birgenai.com';
  const channelArg = args.find((a) => !a.includes('@'));
  const channel: MailChannelId =
    channelArg && CHANNELS.has(channelArg as MailChannelId)
      ? (channelArg as MailChannelId)
      : 'auth';
  return { to, channel };
}

async function main() {
  const { to, channel } = parseArgs();

  const { subject, text, html } = buildOtpVerificationEmailParts({
    code: '847291',
    displayName: 'Preview',
    recipientEmail: to,
  });

  await sendTransactionalMail({ to, subject, text, html, channel });

  console.log(`OK: sent BirgenAI template to ${to} (channel=${channel})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
