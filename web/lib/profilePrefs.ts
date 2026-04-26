/**
 * Per-watching-profile UI preferences.
 *
 * These are display / playback preferences that don't need to live in the
 * database (yet) — autoplay toggles, default subtitle/audio language,
 * subtitle styling. Stored in localStorage keyed by watching-profile id so
 * each member of the household keeps their own settings on this device.
 *
 * If we later decide to sync these across devices, we add a `profile_prefs`
 * column or table and swap the storage layer here without touching callers.
 */

export type SubsSize = 'sm' | 'md' | 'lg' | 'xl';
export type SubsBackground = 'none' | 'shadow' | 'box';
export type MaturityLevel = 'kids' | 'teen' | 'all';

export interface ProfilePrefs {
  autoplayNext: boolean;
  autoplayPreviews: boolean;
  audioLang: string;
  subsLang: string;
  subsSize: SubsSize;
  subsBackground: SubsBackground;
  /** UI-only mirror of the kids flag, but with finer ratings. */
  maturity: MaturityLevel;
}

export const DEFAULT_PROFILE_PREFS: ProfilePrefs = {
  autoplayNext: true,
  autoplayPreviews: true,
  audioLang: 'en',
  subsLang: 'en',
  subsSize: 'md',
  subsBackground: 'shadow',
  maturity: 'all',
};

export const LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: 'en',    label: 'English' },
  { code: 'sw',    label: 'Kiswahili' },
  { code: 'fr',    label: 'Français' },
  { code: 'es',    label: 'Español' },
  { code: 'pt',    label: 'Português' },
  { code: 'ar',    label: 'العربية' },
  { code: 'hi',    label: 'हिन्दी' },
  { code: 'zh',    label: '中文' },
  { code: 'off',   label: 'Off' },
];

const storageKey = (profileId: string) => `birgenai:profile-prefs:${profileId}`;

export function getProfilePrefs(profileId: string): ProfilePrefs {
  if (typeof window === 'undefined') return DEFAULT_PROFILE_PREFS;
  try {
    const raw = window.localStorage.getItem(storageKey(profileId));
    if (!raw) return DEFAULT_PROFILE_PREFS;
    return { ...DEFAULT_PROFILE_PREFS, ...(JSON.parse(raw) as Partial<ProfilePrefs>) };
  } catch {
    return DEFAULT_PROFILE_PREFS;
  }
}

export function setProfilePrefs(profileId: string, patch: Partial<ProfilePrefs>): ProfilePrefs {
  const next = { ...getProfilePrefs(profileId), ...patch };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(storageKey(profileId), JSON.stringify(next));
  }
  return next;
}

export function clearProfilePrefs(profileId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(storageKey(profileId));
}
