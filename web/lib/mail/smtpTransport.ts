import nodemailer from 'nodemailer';

export type SmtpAuth = {
  user: string;
  pass: string;
};

export function getSharedSmtpOptions() {
  const host = process.env.SMTP_HOST ?? 'smtp.zoho.com';
  const port = Number(process.env.SMTP_PORT ?? '465');
  let secure = port === 465;
  if (process.env.SMTP_SECURE === 'true') secure = true;
  if (process.env.SMTP_SECURE === 'false') secure = false;

  return {
    host,
    port,
    secure,
    ...(port === 587 ? { requireTLS: true as const } : {}),
  };
}

export function createSmtpTransport(auth: SmtpAuth) {
  const { host, port, secure, requireTLS } = getSharedSmtpOptions();
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: auth.user, pass: auth.pass },
    ...(requireTLS ? { requireTLS: true } : {}),
  });
}
