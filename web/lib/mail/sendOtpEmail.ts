import { buildOtpVerificationEmailParts } from './birgenTransactionalLayout';
import { sendTransactionalMail } from './sendTransactionalMail';

export type SendOtpParams = {
  to: string;
  code: string;
  displayName?: string | null;
};

/**
 * Sends OTP using the shared BirgenAI transactional HTML template (Zoho SMTP).
 */
export async function sendOtpEmail({ to, code, displayName }: SendOtpParams): Promise<void> {
  const { subject, text, html } = buildOtpVerificationEmailParts({
    code,
    displayName,
    recipientEmail: to,
  });

  await sendTransactionalMail({
    to,
    subject,
    text,
    html,
    channel: 'auth',
  });
}
