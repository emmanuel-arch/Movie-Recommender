/**
 * BirgenAI watching-profile avatar catalogue.
 *
 * Each entry is a self-contained visual recipe (gradient background + glyph)
 * so we don't need to ship separate image files. The <Avatar> component
 * renders these as SVG. Keys are stored in `watching_profiles.avatar_key`.
 *
 * Keep this list stable — adding new avatars is fine; renaming keys breaks
 * existing rows.
 */

export type AvatarTone = 'adult' | 'kids';

export interface AvatarDef {
  key: string;
  label: string;
  glyph: string;                 // single grapheme; rendered centered
  gradient: [string, string];    // [from, to] hex
  tone: AvatarTone;
}

export const AVATARS: AvatarDef[] = [
  { key: 'ember',     label: 'Ember',     glyph: 'B',  gradient: ['#E50914', '#7a0007'], tone: 'adult' },
  { key: 'horizon',   label: 'Horizon',   glyph: 'H',  gradient: ['#1e3a8a', '#0f1f4d'], tone: 'adult' },
  { key: 'savanna',   label: 'Savanna',   glyph: 'S',  gradient: ['#d97706', '#7c2d12'], tone: 'adult' },
  { key: 'midnight',  label: 'Midnight',  glyph: 'M',  gradient: ['#1f2937', '#0b1220'], tone: 'adult' },
  { key: 'neon',      label: 'Neon',      glyph: 'N',  gradient: ['#a855f7', '#3b0764'], tone: 'adult' },
  { key: 'forest',    label: 'Forest',    glyph: 'F',  gradient: ['#047857', '#022c22'], tone: 'adult' },
  { key: 'sunset',    label: 'Sunset',    glyph: 'U',  gradient: ['#f43f5e', '#7f1d1d'], tone: 'adult' },
  { key: 'ocean',     label: 'Ocean',     glyph: 'O',  gradient: ['#0891b2', '#0c4a6e'], tone: 'adult' },
  { key: 'kids-sky',  label: 'Sky Kids',  glyph: '★',  gradient: ['#60a5fa', '#1e40af'], tone: 'kids'  },
  { key: 'kids-lime', label: 'Lime Kids', glyph: '☻',  gradient: ['#84cc16', '#365314'], tone: 'kids'  },
];

export function getAvatar(key: string | null | undefined): AvatarDef {
  if (!key) return AVATARS[0];
  return AVATARS.find((a) => a.key === key) ?? AVATARS[0];
}
