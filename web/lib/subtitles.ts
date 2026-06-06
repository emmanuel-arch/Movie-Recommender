/**
 * Subtitle (WebVTT) track resolution.
 *
 * R2 layout (mirrors the HLS layout):
 *   Subtitles/en/<assetKey>-en.vtt   — English (accessibility / hearing-impaired)
 *   Subtitles/sw/<assetKey>-sw.vtt   — Kiswahili (our differentiator)
 *   Subtitles/fr/<assetKey>-fr.vtt   — Français (francophone diaspora)
 *
 * e.g. Subtitles/sw/get-out-2017-sw.vtt
 *
 * Generate the .vtt files with scripts/subtitles/generate_subs.py, upload them
 * to the R2 bucket under the paths above, then the player picks them up
 * automatically for any slug that has a catalogue assetKey.
 */

import { getCatalogEntryBySlug } from '@/lib/catalog';

const R2_BASE = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? '').replace(/\/$/, '');
/** R2 folder holding the subtitle tree. Override only if your bucket differs. */
const SUBS_ROOT = (process.env.NEXT_PUBLIC_SUBS_ROOT ?? 'Subtitles').replace(/\/$/, '');

export interface SubtitleTrack {
  /** BCP-47 language code used on the <track srclang>. */
  lang: string;
  /** Human label shown in the CC menu. */
  label: string;
  /** Absolute VTT URL. */
  src: string;
  /** Whether this track should be shown by default. */
  default?: boolean;
}

/** Languages we publish, in menu order. English is the default track. */
const SUB_LANGS: Array<{ lang: string; label: string; default?: boolean }> = [
  { lang: 'en', label: 'English', default: true },
  { lang: 'sw', label: 'Kiswahili' },
  { lang: 'fr', label: 'Français' },
];

/** Build the VTT URL for a given asset key + language. */
export function getSubtitleUrl(assetKey: string, lang: string): string | null {
  if (!R2_BASE || !assetKey) return null;
  return `${R2_BASE}/${SUBS_ROOT}/${lang}/${assetKey}-${lang}.vtt`;
}

/**
 * Resolve the subtitle tracks for a watch slug. Returns [] when R2 isn't
 * configured or the slug isn't in the catalogue. The player tolerates a 404 on
 * any individual track (the browser simply won't surface that language), so we
 * advertise all published languages and let uploads light them up.
 */
export function getSubtitleTracksForSlug(slug: string): SubtitleTrack[] {
  const entry = getCatalogEntryBySlug(slug);
  if (!entry || !R2_BASE) return [];
  return SUB_LANGS.flatMap(({ lang, label, default: def }) => {
    const src = getSubtitleUrl(entry.assetKey, lang);
    return src ? [{ lang, label, src, default: def }] : [];
  });
}
