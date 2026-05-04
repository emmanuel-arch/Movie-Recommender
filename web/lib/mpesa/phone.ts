export function formatKenyaPhone254(raw: string): string {
  let cleaned = raw.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = `254${cleaned.slice(1)}`;
  if (!cleaned.startsWith('254')) cleaned = `254${cleaned}`;
  return cleaned;
}

export function isValidKenya254(formatted: string): boolean {
  return formatted.length === 12 && formatted.startsWith('254');
}
