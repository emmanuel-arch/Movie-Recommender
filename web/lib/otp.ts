import { createHash, randomInt } from 'crypto';

export function generateSixDigitOtp(): string {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

export function hashOtp(code: string): string {
  const pepper = process.env.OTP_PEPPER ?? process.env.NEXT_OTP_PEPPER ?? 'birgenai-dev-pepper-change-me';
  return createHash('sha256').update(`${pepper}:${code}`, 'utf8').digest('hex');
}
