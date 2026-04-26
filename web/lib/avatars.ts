/**
 * BirgenAI watching-profile avatar catalogue.
 *
 * Art files live in `web/public/Images/avatars/`. The `key` (stored in
 * `watching_profiles.avatar_key`) is stable, lowercase, and URL-safe; the
 * `image` path's filename must match the PNG on disk (case-sensitive on Linux).
 *
 * This catalogue is filled from Netflix-style character tiles in
 * `Images/avatars/` (see filenames below). If an image 404s, the `glyph` shows
 * on the `gradient` tile.
 */

export type AvatarTone = 'adult' | 'kids';
export type AvatarCategory = 'classic' | 'heroes' | 'animation' | 'cinema' | 'kids';

export interface AvatarDef {
  key: string;
  label: string;
  category: AvatarCategory;
  tone: AvatarTone;
  gradient: [string, string];
  glyph: string;
  image?: string;
}

const A = (path: string) => `/Images/avatars/${path}`;

/**
 * 17 avatars, grouped in the UI as:
 *   • Classic  — the five “classic” slot images
 *   • Kids     — family / younger-skewing faces (for the Kids *section*, not
 *                always `tone: 'kids'`, to avoid a KIDS tag on every tile)
 *   • Series & film — live-action and mature series (cinema row)
 */
export const AVATARS: AvatarDef[] = [
  // Classic (5)
  { key: 'classic1', label: 'Classic 1', category: 'classic', tone: 'adult', gradient: ['#1f2937', '#0b1220'], glyph: '1', image: A('classic1.png') },
  { key: 'classic2', label: 'Classic 2', category: 'classic', tone: 'adult', gradient: ['#1e3a8a', '#0f1f4d'], glyph: '2', image: A('classic2.png') },
  { key: 'classic3', label: 'Classic 3', category: 'classic', tone: 'adult', gradient: ['#d97706', '#7c2d12'], glyph: '3', image: A('classic3.png') },
  { key: 'classic4', label: 'Classic 4', category: 'classic', tone: 'adult', gradient: ['#a855f7', '#3b0764'], glyph: '4', image: A('classic4.png') },
  { key: 'classic5', label: 'Classic 5', category: 'classic', tone: 'adult', gradient: ['#047857', '#022c22'], glyph: '5', image: A('classic5.png') },

  // Kids (4) — section for avatars you grouped as “kid-leaning”
  { key: 'airbender', label: 'Airbender', category: 'kids', tone: 'adult', gradient: ['#0ea5e9', '#1e3a8a'], glyph: 'A', image: A('Airbender.png') },
  { key: 'beauty-in-black', label: 'Beauty in black', category: 'kids', tone: 'adult', gradient: ['#1e293b', '#312e81'], glyph: 'B', image: A('Beauty-in-black.png') },
  { key: 'wednesday', label: 'Wednesday', category: 'kids', tone: 'adult', gradient: ['#1f2937', '#0f172a'], glyph: 'W', image: A('wednesday.png') },
  { key: 'squid', label: 'Squid icon', category: 'kids', tone: 'adult', gradient: ['#e11d48', '#881337'], glyph: 'S', image: A('squid.png') },

  // Series & film (8)
  { key: 'thomas-shelby', label: 'Thomas Shelby', category: 'cinema', tone: 'adult', gradient: ['#292524', '#0c0a09'], glyph: 'T', image: A('thomas-shelby.png') },
  { key: 'the-witcher', label: 'The Witcher', category: 'cinema', tone: 'adult', gradient: ['#3f3f46', '#18181b'], glyph: 'W', image: A('The-witcher.png') },
  { key: 'stranger-things', label: 'Stranger Things', category: 'cinema', tone: 'adult', gradient: ['#dc2626', '#1c1917'], glyph: 'S', image: A('stranger-things.png') },
  { key: 'money-heist', label: 'Money Heist', category: 'cinema', tone: 'adult', gradient: ['#b91c1c', '#422006'], glyph: 'M', image: A('money-heist.png') },
  { key: 'blackmirror', label: 'Black Mirror', category: 'cinema', tone: 'adult', gradient: ['#0f172a', '#000000'], glyph: 'B', image: A('blackmirror.png') },
  { key: 'outer_banks', label: 'Outer Banks', category: 'cinema', tone: 'adult', gradient: ['#0284c7', '#14532d'], glyph: 'O', image: A('outer_banks.png') },
  { key: 'outer_banks2', label: 'Outer Banks 2', category: 'cinema', tone: 'adult', gradient: ['#0369a1', '#166534'], glyph: '2', image: A('outer_banks2.png') },
  { key: 'squid-game', label: 'Squid Game', category: 'cinema', tone: 'adult', gradient: ['#e11d48', '#0f172a'], glyph: 'G', image: A('squid-game.png') },
];

export const AVATAR_CATEGORIES: { id: AvatarCategory; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'kids', label: 'Kids' },
  { id: 'cinema', label: 'Series & film' },
  { id: 'animation', label: 'Animation' },
  { id: 'heroes', label: 'Heroes' },
];

export function getAvatar(key: string | null | undefined): AvatarDef {
  if (!key) return AVATARS[0];
  return AVATARS.find((a) => a.key === key) ?? AVATARS[0];
}

export function avatarsByCategory(): Record<AvatarCategory, AvatarDef[]> {
  const out = { classic: [], heroes: [], animation: [], cinema: [], kids: [] } as Record<AvatarCategory, AvatarDef[]>;
  for (const a of AVATARS) out[a.category].push(a);
  return out;
}
