/**
 * Shared HTML shell for BirgenAI transactional email (OTP, alerts, receipts).
 * Table-based layout for broad client support; Netflix-inspired dark + red accent.
 *
 * Pattern: build inner rows with `mainCardRowsHtml`, then wrap with
 * `buildTransactionalDocumentHtml`. Plain-text bodies should mirror the same
 * copy in a dedicated builder next to each HTML builder.
 */

/** Public origin for /Images/* — required for logo in inbox clients */
export function getEmailPublicBaseUrl(): string {
  const raw =
    process.env.EMAIL_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'https://movies.birgenai.com';
  return raw.replace(/\/$/, '');
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const BRAND = {
  red: '#E50914',
  pageBg: '#0B0B0B',
  stripBg: '#000000',
  cardBg: '#141414',
  cardInner: '#1A1A1A',
  border: '#2A2A2A',
  otpBarBg: '#252525',
  text: '#E5E5E5',
  muted: '#A3A3A3',
  legal: '#737373',
} as const;

export { BRAND };

const SUPPORT_MAIL = 'support@birgenai.com';

export type TransactionalShellOptions = {
  pageTitle: string;
  /** One or more `<tr>...</tr>` rows inside the main content card */
  mainCardRowsHtml: string;
  /** HTML fragment for the legal line (escape user-provided fragments) */
  legalFooterInnerHtml: string;
  /** Default: product home + Help match Movies; override per subdomain product */
  primaryCta?: { href: string; label: string };
};

/**
 * Full HTML document: top strip (logo + CTAs), main card, thank-you strip, legal footer.
 */
export function buildTransactionalDocumentHtml({
  pageTitle,
  mainCardRowsHtml,
  legalFooterInnerHtml,
  primaryCta,
}: TransactionalShellOptions): string {
  const base = getEmailPublicBaseUrl();
  const logoUrl = `${base}/Images/logo.png`;
  const aboutUrl = primaryCta?.href ?? `${base}/`;
  const aboutLabel = primaryCta?.label ?? 'Movies home';

  /** Portrait mark (~110×126): cap size so strip stays shallow; wide logos still scale down via max-width */
  const logoW = 40;
  const logoH = 46;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(pageTitle)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.pageBg};-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.pageBg};">
    <tr>
      <td align="center" style="padding:24px 12px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:${BRAND.stripBg};border-radius:12px 12px 0 0;border:1px solid ${BRAND.border};border-bottom:none;">
          <tr>
            <td style="padding:20px 24px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td valign="middle" align="left" style="width:55%;">
                    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:100%;">
                      <tr>
                        <td valign="middle" style="padding:0 14px 0 0;vertical-align:middle;">
                          <img src="${logoUrl}" width="${logoW}" height="${logoH}" alt="BirgenAI" style="display:block;border:0;outline:none;text-decoration:none;width:${logoW}px;height:auto;max-height:${logoH}px;max-width:132px;-ms-interpolation-mode:bicubic;" />
                        </td>
                        <td valign="middle" style="vertical-align:middle;">

                        </td>
                      </tr>
                    </table>
                  </td>
                  <td valign="middle" align="right" style="width:45%;white-space:nowrap;">
                    <a href="${aboutUrl}" style="display:inline-block;margin:4px 0;padding:10px 18px;background:transparent;border:1px solid ${BRAND.red};border-radius:999px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:${BRAND.red};text-decoration:none;">${escapeHtml(aboutLabel)}</a>
                    <a href="mailto:${SUPPORT_MAIL}" style="display:inline-block;margin:4px 0 4px 8px;padding:10px 18px;background:${BRAND.red};border-radius:999px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#ffffff;text-decoration:none;">Help</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:${BRAND.cardBg};border:1px solid ${BRAND.border};border-top:1px solid ${BRAND.border};">
          ${mainCardRowsHtml}
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:${BRAND.cardInner};border:1px solid ${BRAND.border};border-top:none;border-radius:0 0 12px 12px;">
          <tr>
            <td align="center" style="padding:22px 24px;">
              <p style="margin:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.text};">
                Thank you for choosing us.<br />
                <strong style="color:${BRAND.red};">The BirgenAI Team</strong>
              </p>
              <p style="margin:14px 0 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${BRAND.text};">
                <a href="mailto:${SUPPORT_MAIL}" style="color:${BRAND.text};text-decoration:none;">${SUPPORT_MAIL}</a>
                <span style="color:${BRAND.border};"> &nbsp;|&nbsp; </span>
                <a href="${base}" style="color:${BRAND.text};text-decoration:none;">birgenai.com</a>
              </p>
            </td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;">
          <tr>
            <td style="padding:20px 16px 8px;text-align:center;">
              <p style="margin:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:${BRAND.legal};">
                ${legalFooterInnerHtml}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export type OtpEmailContentParams = {
  code: string;
  displayName?: string | null;
  /** Shown in legal line */
  recipientEmail?: string | null;
};

export function buildOtpVerificationEmailParts(params: OtpEmailContentParams): {
  subject: string;
  text: string;
  html: string;
} {
  const digits = params.code.replace(/\D/g, '').slice(0, 6).padStart(6, '0');
  const codeHtml = escapeHtml(digits);
  const safeGreetingLine = params.displayName?.trim()
    ? `Hi ${escapeHtml(params.displayName.trim())},`
    : 'Hello,';
  const textGreeting = params.displayName?.trim()
    ? `Hi ${params.displayName.trim()},`
    : 'Hello,';

  const supportMail = SUPPORT_MAIL;
  const securityMail = 'auth@birgenai.com';

  const subject = `${digits} is your BirgenAI verification code`;

  const text = [
    textGreeting,
    '',
    'Use this one-time code to verify your identity and continue to BirgenAI Movies:',
    '',
    `Code: ${digits}`,
    '',
    'This code expires in 10 minutes.',
    `Need help? ${supportMail}`,
    '',
    `— BirgenAI Security · ${securityMail}`,
    '',
    params.recipientEmail
      ? `This email was sent to ${params.recipientEmail} for BirgenAI account security.`
      : '',
  ]
    .filter((line) => line !== '')
    .join('\n');

  const mainCardRowsHtml = `
          <tr>
            <td style="padding:28px 28px 8px;">
              <h1 style="margin:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.text};">
                Account verification
              </h1>
              <p style="margin:14px 0 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:${BRAND.muted};">
                ${safeGreetingLine}<br /><br />
                To continue signing in to <strong style="color:${BRAND.text};">BirgenAI Movies</strong>, activate this verification code. It confirms that you control this inbox.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.otpBarBg};border-radius:10px;border-left:4px solid ${BRAND.red};">
                <tr>
                  <td align="center" style="padding:22px 16px;">
                    <p style="margin:0 0 8px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:${BRAND.muted};">
                      Your code
                    </p>
                    <p style="margin:0;font-family:'Consolas','Segoe UI Mono','Menlo',Monaco,monospace;font-size:34px;font-weight:700;letter-spacing:0.42em;color:${BRAND.text};">
                      ${codeHtml}
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;color:${BRAND.muted};">
                This code expires in <strong style="color:${BRAND.text};">10 minutes</strong>. If you didn’t request this, you can ignore this email — your account stays protected.
              </p>
              <p style="margin:14px 0 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;color:${BRAND.muted};">
                Questions? <a href="mailto:${supportMail}" style="color:${BRAND.red};text-decoration:none;font-weight:600;">Contact support</a>
              </p>
            </td>
          </tr>`;

  const legalFooterInnerHtml = `This email was sent by BirgenAI Security (${securityMail}) for sign-in and account protection.${params.recipientEmail ? ` Sent to <span style="color:${BRAND.muted};">${escapeHtml(params.recipientEmail)}</span>.` : ''}`;

  const html = buildTransactionalDocumentHtml({
    pageTitle: 'BirgenAI — Verification',
    mainCardRowsHtml,
    legalFooterInnerHtml,
  });

  return { subject, text, html };
}
