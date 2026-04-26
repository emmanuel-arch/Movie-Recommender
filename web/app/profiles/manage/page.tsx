'use client';
/**
 * /profiles/manage — Netflix-style "Manage profile and preferences".
 *
 * Two views, switched on `?edit=<profileId>`:
 *
 *   1. Picker (no query param). A simple list of every watching profile
 *      with avatar + name + chevron. Click a row to drill into the full
 *      manage page for that profile. An "Add profile" entry sits at the
 *      bottom (capped at 5 by the DB trigger).
 *
 *   2. Editor (`?edit=<id>`). A stacked card layout:
 *        • Profile           — avatar + name + kids/default toggles
 *        • Profile Lock      — set / change / remove a 4-digit PIN
 *        • Languages         — audio + subtitle language defaults
 *        • Parental Controls — kids tone + maturity level
 *        • Subtitle appearance — size + background style w/ live preview
 *        • Playback settings — autoplay next / autoplay previews
 *        • Delete profile    — destructive, last item.
 *
 * The four "preference" cards (Languages, Subtitles, Playback, Maturity)
 * write to localStorage via `lib/profilePrefs` — they're per-device until
 * we decide to sync. Avatar / name / kids / default / PIN write to Supabase.
 *
 * Deep links (while editing, append to the URL): #profile, #lock, #languages,
 * #parental, #subtitles, #playback — opens that section and scrolls to it.
 */

import { useEffect, useMemo, useState, Suspense, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Trash2,
  Check,
  Shield,
  Lock,
  Languages as LanguagesIcon,
  AlertTriangle,
  Subtitles,
  Play,
  ChevronRight,
  Plus,
  Pencil,
  X,
  LogOut,
  LifeBuoy,
} from 'lucide-react';
import Avatar from '@/components/Avatar';
import { AVATARS, AVATAR_CATEGORIES, avatarsByCategory } from '@/lib/avatars';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  DEFAULT_PROFILE_PREFS,
  LANGUAGE_OPTIONS,
  ProfilePrefs,
  SubsSize,
  SubsBackground,
  MaturityLevel,
  getProfilePrefs,
  setProfilePrefs,
} from '@/lib/profilePrefs';

// ───────────────────────── Picker view ──────────────────────────────────────

function ManagePicker() {
  const router = useRouter();
  const { watchingProfiles, signOut } = useAuth();
  const canAddMore = watchingProfiles.length < 5;

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h1 className="font-display text-[36px] sm:text-[44px] text-white tracking-wide mb-2">
        Manage profile and preferences
      </h1>
      <p className="text-birgen-silver text-sm mb-8">
        Pick a profile to edit its avatar, lock it with a PIN, or fine-tune playback. Use the links
        at the bottom to sign out or get help.
      </p>

      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-birgen-muted mb-2 px-1">
        Profiles
      </p>
      <ul className="rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/10 overflow-hidden shadow-lg shadow-black/20">
        {watchingProfiles.map((p) => (
          <li key={p.id}>
            <Link
              href={`/profiles/manage?edit=${p.id}`}
              className="flex items-center gap-4 px-4 sm:px-5 py-4 min-h-[72px] hover:bg-white/[0.04] transition-colors"
            >
              <Avatar avatarKey={p.avatar_key} size={64} rounded="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white text-[15px] font-medium truncate">{p.name}</p>
                  {p.is_default && (
                    <span className="text-[10px] uppercase tracking-widest text-birgen-red font-semibold">
                      Default
                    </span>
                  )}
                  {p.is_kids && (
                    <span className="text-[10px] uppercase tracking-widest bg-birgen-red text-white font-semibold px-1.5 py-0.5 rounded">
                      Kids
                    </span>
                  )}
                  {p.pin && <Lock className="w-3.5 h-3.5 text-birgen-silver" aria-label="PIN locked" />}
                </div>
                <p className="text-birgen-muted text-xs mt-0.5">
                  Edit personal info, lock, languages, playback
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-birgen-silver flex-shrink-0" />
            </Link>
          </li>
        ))}

        {canAddMore && (
          <li>
            <Link
              href="/profiles/new"
              className="flex items-center gap-4 px-4 sm:px-5 py-4 min-h-[72px] hover:bg-white/[0.04] transition-colors"
            >
              <div className="w-16 h-16 rounded-[10px] border-2 border-dashed border-white/15 flex items-center justify-center">
                <Plus className="w-6 h-6 text-white/60" />
              </div>
              <div className="flex-1">
                <p className="text-white text-[15px] font-medium">Add profile</p>
                <p className="text-birgen-muted text-xs mt-0.5">
                  Up to 5 — {5 - watchingProfiles.length} remaining
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-birgen-silver" />
            </Link>
          </li>
        )}
      </ul>

      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-birgen-muted mt-8 mb-2 px-1">
        Account
      </p>
      <ul className="rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/10 overflow-hidden">
        <li>
          <Link
            href="/login?help=reset"
            className="flex items-center gap-4 px-4 sm:px-5 py-4 hover:bg-white/[0.04] transition-colors"
          >
            <span className="w-9 h-9 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-birgen-silver">
              <LifeBuoy className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[15px] font-medium">Help & sign-in help</p>
              <p className="text-birgen-muted text-xs mt-0.5">Password reset, account access, and more</p>
            </div>
            <ChevronRight className="w-5 h-5 text-birgen-silver flex-shrink-0" />
          </Link>
        </li>
        <li>
          <Link
            href="/profiles"
            className="flex items-center gap-4 px-4 sm:px-5 py-4 hover:bg-white/[0.04] transition-colors"
          >
            <span className="w-9 h-9 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-birgen-silver">
              <Pencil className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[15px] font-medium">Who's watching</p>
              <p className="text-birgen-muted text-xs mt-0.5">Switch the profile you use to browse</p>
            </div>
            <ChevronRight className="w-5 h-5 text-birgen-silver flex-shrink-0" />
          </Link>
        </li>
        <li>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center gap-4 px-4 sm:px-5 py-4 hover:bg-white/[0.04] transition-colors text-left"
          >
            <span className="w-9 h-9 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-birgen-silver">
              <LogOut className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[15px] font-medium">Sign out of BirgenAI</p>
              <p className="text-birgen-muted text-xs mt-0.5">Signs out on this device</p>
            </div>
            <ChevronRight className="w-5 h-5 text-birgen-silver flex-shrink-0" />
          </button>
        </li>
      </ul>
    </div>
  );
}

// ───────────────────────── Editor view ──────────────────────────────────────

interface EditorProps {
  profileId: string;
}

function ManageEditor({ profileId }: EditorProps) {
  const router = useRouter();
  const { user, watchingProfiles, refreshWatchingProfiles, setActiveWatchingProfile } = useAuth();
  const editing = useMemo(
    () => watchingProfiles.find((p) => p.id === profileId) ?? null,
    [watchingProfiles, profileId],
  );

  // ── Profile (DB) ────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [avatarKey, setAvatarKey] = useState<string>(AVATARS[0].key);
  const [isKids, setIsKids] = useState(false);
  const [isDefault, setIsDefault] = useState(false);

  // ── PIN (DB) ────────────────────────────────────────────────────────────
  const [pin, setPin] = useState<string>('');           // current saved PIN
  const [pinDraft, setPinDraft] = useState<string>(''); // staged change
  const [pinEditing, setPinEditing] = useState(false);

  // ── Preferences (localStorage) ──────────────────────────────────────────
  const [prefs, setPrefs] = useState<ProfilePrefs>(DEFAULT_PROFILE_PREFS);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setAvatarKey(editing.avatar_key);
      setIsKids(editing.is_kids);
      setIsDefault(editing.is_default);
      setPin(editing.pin ?? '');
      setPinDraft(editing.pin ?? '');
      setPrefs(getProfilePrefs(editing.id));
    }
  }, [editing]);

  if (!editing) {
    // Profile id from the URL doesn't exist (deleted, or not loaded yet).
    return (
      <div className="text-center py-12">
        <p className="text-birgen-silver mb-4">That profile isn't available.</p>
        <Link href="/profiles/manage" className="text-white underline">
          Back to profiles
        </Link>
      </div>
    );
  }

  // ── Mutators ────────────────────────────────────────────────────────────
  const updatePrefs = (patch: Partial<ProfilePrefs>) => {
    const next = setProfilePrefs(editing.id, patch);
    setPrefs(next);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name cannot be empty.');
      return;
    }
    if (!user) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    setSaving(true);

    if (isDefault && !editing.is_default) {
      await supabase
        .from('watching_profiles')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .neq('id', editing.id);
    }

    const { error: dbErr } = await supabase
      .from('watching_profiles')
      .update({
        name: trimmed,
        avatar_key: avatarKey,
        is_kids: isKids,
        is_default: isDefault,
      })
      .eq('id', editing.id);

    setSaving(false);

    if (dbErr) {
      setError(dbErr.message);
      return;
    }

    await refreshWatchingProfiles();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  const handleDelete = async () => {
    if (!user) return;
    if (watchingProfiles.length === 1) {
      setError('You need at least one profile. Create another one first.');
      return;
    }
    if (!window.confirm(`Delete profile "${editing.name}"? This can't be undone.`)) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    setDeleting(true);
    const { error: dbErr } = await supabase
      .from('watching_profiles')
      .delete()
      .eq('id', editing.id);
    setDeleting(false);

    if (dbErr) {
      setError(dbErr.message);
      return;
    }

    setActiveWatchingProfile(null);
    await refreshWatchingProfiles();
    router.replace('/profiles');
  };

  const handlePinSave = async () => {
    setError(null);
    if (!user) return;
    if (pinDraft && !/^\d{4}$/.test(pinDraft)) {
      setError('PIN must be exactly 4 digits.');
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const value = pinDraft.length === 0 ? null : pinDraft;
    const { error: dbErr } = await supabase
      .from('watching_profiles')
      .update({ pin: value })
      .eq('id', editing.id);

    if (dbErr) {
      setError(dbErr.message);
      return;
    }

    setPin(value ?? '');
    setPinEditing(false);
    await refreshWatchingProfiles();
  };

  const handlePinRemove = async () => {
    if (!window.confirm('Remove the PIN from this profile?')) return;
    setPinDraft('');
    await new Promise((r) => setTimeout(r, 0));
    handlePinSave();
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSave} className="w-full max-w-3xl mx-auto pb-20">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-[34px] sm:text-[42px] text-white tracking-wide">
          Manage profile
        </h1>
        {savedFlash && (
          <span className="inline-flex items-center gap-1.5 text-green-400 text-sm">
            <Check className="w-4 h-4" /> Saved
          </span>
        )}
      </div>

      {/* ── 1. Profile (avatar + name + kids/default) ────────────────────── */}
      <Section
        sectionId="profile"
        icon={<Pencil className="w-4 h-4" />}
        title={editing.name || 'Profile'}
        subtitle="Edit personal and contact info"
        defaultOpen
      >
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <Avatar avatarKey={avatarKey} size={120} rounded="md" />
            <span className="text-birgen-silver text-[11px] uppercase tracking-widest">
              {AVATARS.find((a) => a.key === avatarKey)?.label}
            </span>
          </div>

          <div className="flex-1 w-full space-y-3">
            <label className="block">
              <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-birgen-silver mb-1.5">
                Name
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={32}
                className="w-full h-11 px-3.5 bg-white/[0.04] border border-white/10 focus:border-birgen-red/70 rounded-md text-white text-base outline-none transition-all"
              />
            </label>

            <label className="flex items-start gap-3 cursor-pointer select-none p-3 rounded-md bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
              <input
                type="checkbox"
                checked={isKids}
                onChange={(e) => setIsKids(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-birgen-red"
              />
              <div>
                <p className="text-white text-sm font-medium">Kids profile</p>
                <p className="text-birgen-silver text-xs">
                  Restricts the catalogue to age-appropriate titles and adds a KIDS badge.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer select-none p-3 rounded-md bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-birgen-red"
              />
              <div>
                <p className="text-white text-sm font-medium flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-birgen-red" /> Default profile
                </p>
                <p className="text-birgen-silver text-xs">
                  Auto-selected when you open BirgenAI on a new device.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Avatar picker — grouped by category */}
        <div className="mt-7 space-y-6">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-birgen-silver">
            Avatar
          </h3>
          {AVATAR_CATEGORIES.map((cat) => {
            const items = avatarsByCategory()[cat.id];
            if (items.length === 0) return null;
            return (
              <div key={cat.id}>
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 mb-2.5">
                  {cat.label}
                </h4>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2.5">
                  {items.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => setAvatarKey(a.key)}
                      title={a.label}
                      className={`rounded-[10px] transition-all ${
                        avatarKey === a.key ? 'ring-2 ring-white scale-[1.04]' : 'hover:scale-[1.04]'
                      }`}
                    >
                      <Avatar avatarKey={a.key} size={64} rounded="md" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── 2. Profile Lock ──────────────────────────────────────────────── */}
      <Section
        sectionId="lock"
        icon={<Lock className="w-4 h-4" />}
        title="Profile Lock"
        subtitle={pin ? 'PIN required to enter this profile' : 'Require a PIN to access this profile'}
        rightSlot={
          pin && !pinEditing ? (
            <span className="text-[10px] uppercase tracking-widest bg-green-500/15 text-green-400 px-2 py-0.5 rounded">
              On
            </span>
          ) : null
        }
      >
        {!pinEditing ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setPinDraft(pin);
                setPinEditing(true);
              }}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-white text-sm transition-colors"
            >
              {pin ? 'Change PIN' : 'Set up PIN'}
            </button>
            {pin && (
              <button
                type="button"
                onClick={handlePinRemove}
                className="px-4 py-2 text-red-400 hover:text-white hover:bg-red-500/10 border border-red-500/30 rounded-md text-sm transition-colors"
              >
                Remove PIN
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-birgen-silver text-xs">
              Enter a 4-digit PIN. Leave blank and save to remove the lock.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                value={pinDraft}
                onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                className="w-32 h-11 px-3.5 bg-white/[0.04] border border-white/10 focus:border-birgen-red/70 rounded-md text-white text-center text-xl tracking-[0.4em] outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={handlePinSave}
                className="px-4 py-2 bg-birgen-red hover:bg-birgen-red-light text-white text-sm font-medium rounded-md transition-colors"
              >
                Save PIN
              </button>
              <button
                type="button"
                onClick={() => {
                  setPinDraft(pin);
                  setPinEditing(false);
                }}
                className="px-3 py-2 text-birgen-silver hover:text-white text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* ── Preferences group ───────────────────────────────────────────── */}
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 mt-10 mb-3 px-1">
        Preferences
      </h2>

      {/* ── 3. Languages ─────────────────────────────────────────────────── */}
      <Section
        sectionId="languages"
        icon={<LanguagesIcon className="w-4 h-4" />}
        title="Languages"
        subtitle="Set languages for display, audio and subtitles"
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Audio"
            value={prefs.audioLang}
            onChange={(v) => updatePrefs({ audioLang: v })}
            options={LANGUAGE_OPTIONS.filter((l) => l.code !== 'off').map((l) => ({
              value: l.code,
              label: l.label,
            }))}
          />
          <SelectField
            label="Subtitles"
            value={prefs.subsLang}
            onChange={(v) => updatePrefs({ subsLang: v })}
            options={LANGUAGE_OPTIONS.map((l) => ({ value: l.code, label: l.label }))}
          />
        </div>
      </Section>

      {/* ── 4. Parental Controls ─────────────────────────────────────────── */}
      <Section
        sectionId="parental"
        icon={<AlertTriangle className="w-4 h-4" />}
        title="Adjust parental controls"
        subtitle="Edit maturity rating and title restrictions"
      >
        <div className="space-y-2">
          {(
            [
              { id: 'kids', label: 'Kids', desc: 'G-rated only — same as the Kids toggle.' },
              { id: 'teen', label: 'Teen', desc: 'Up to PG-13.' },
              { id: 'all', label: 'All maturity ratings', desc: 'No restrictions.' },
            ] as { id: MaturityLevel; label: string; desc: string }[]
          ).map((opt) => (
            <label
              key={opt.id}
              className={`flex items-start gap-3 cursor-pointer select-none p-3 rounded-md border transition-colors ${
                prefs.maturity === opt.id
                  ? 'border-birgen-red/50 bg-birgen-red/5'
                  : 'border-white/5 bg-white/[0.02] hover:border-white/10'
              }`}
            >
              <input
                type="radio"
                name="maturity"
                checked={prefs.maturity === opt.id}
                onChange={() => updatePrefs({ maturity: opt.id })}
                className="mt-0.5 w-4 h-4 accent-birgen-red"
              />
              <div>
                <p className="text-white text-sm font-medium">{opt.label}</p>
                <p className="text-birgen-silver text-xs">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </Section>

      {/* ── 5. Subtitle appearance ───────────────────────────────────────── */}
      <Section
        sectionId="subtitles"
        icon={<Subtitles className="w-4 h-4" />}
        title="Subtitle appearance"
        subtitle="Customise the way subtitles appear"
      >
        <div className="space-y-5">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-birgen-silver mb-2">
              Size
            </p>
            <div className="inline-flex rounded-md border border-white/10 bg-white/[0.03] p-0.5">
              {(['sm', 'md', 'lg', 'xl'] as SubsSize[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => updatePrefs({ subsSize: s })}
                  className={`px-3 py-1.5 text-xs uppercase tracking-widest rounded-[5px] transition-colors ${
                    prefs.subsSize === s ? 'bg-birgen-red text-white' : 'text-birgen-silver hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-birgen-silver mb-2">
              Background
            </p>
            <div className="inline-flex rounded-md border border-white/10 bg-white/[0.03] p-0.5">
              {(
                [
                  { id: 'none', label: 'None' },
                  { id: 'shadow', label: 'Shadow' },
                  { id: 'box', label: 'Box' },
                ] as { id: SubsBackground; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => updatePrefs({ subsBackground: opt.id })}
                  className={`px-3 py-1.5 text-xs rounded-[5px] transition-colors ${
                    prefs.subsBackground === opt.id
                      ? 'bg-birgen-red text-white'
                      : 'text-birgen-silver hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Live preview */}
          <div className="rounded-md overflow-hidden border border-white/10 relative aspect-video bg-[radial-gradient(ellipse_at_center,#1f2937,#000)]">
            <div className="absolute inset-x-0 bottom-3 sm:bottom-5 flex justify-center px-4">
              <SubsPreview prefs={prefs} />
            </div>
          </div>
        </div>
      </Section>

      {/* ── 6. Playback settings ─────────────────────────────────────────── */}
      <Section
        sectionId="playback"
        icon={<Play className="w-4 h-4" />}
        title="Playback settings"
        subtitle="Set autoplay, audio and video quality"
      >
        <div className="space-y-2">
          <Toggle
            label="Autoplay next episode"
            description="Continue to the next episode automatically when the current one ends."
            checked={prefs.autoplayNext}
            onChange={(v) => updatePrefs({ autoplayNext: v })}
          />
          <Toggle
            label="Autoplay previews while browsing"
            description="Play short trailers as you hover titles."
            checked={prefs.autoplayPreviews}
            onChange={(v) => updatePrefs({ autoplayPreviews: v })}
          />
        </div>
      </Section>

      {/* ── Errors + footer actions ─────────────────────────────────────── */}
      {error && (
        <p className="text-red-400 text-sm mt-6" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between mt-10 gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center gap-2 px-5 py-2.5 border border-red-500/40 text-red-400 hover:text-white hover:bg-red-500/10 text-sm tracking-[0.1em] uppercase rounded-md transition-colors"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          Delete profile
        </button>

        <div className="flex items-center gap-3 ml-auto">
          <Link
            href="/profiles"
            className="px-5 py-2.5 text-birgen-silver hover:text-white text-sm tracking-[0.1em] uppercase transition-colors"
          >
            Done
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-3 bg-birgen-red hover:bg-birgen-red-light disabled:bg-birgen-red/40 text-white font-semibold text-sm rounded-md transition-all"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save changes
          </button>
        </div>
      </div>
    </form>
  );
}

// ───────────────────────── Page wrapper ─────────────────────────────────────

function ManageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get('edit');
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/welcome');
  }, [loading, user, router]);

  return (
    <div className="min-h-screen bg-birgen-black flex flex-col">
      <header className="px-6 sm:px-10 py-6 flex items-center justify-between">
        <Link href="/">
          <Image
            src="/Images/birgenaihub.png"
            alt="BirgenAI"
            width={140}
            height={32}
            className="h-8 w-auto object-contain"
            priority
          />
        </Link>
        <Link
          href={editId ? '/profiles/manage' : '/profiles'}
          className="inline-flex items-center gap-2 text-birgen-silver hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {editId ? 'All profiles' : 'Back'}
        </Link>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-8 sm:py-12">
        {editId ? <ManageEditor profileId={editId} /> : <ManagePicker />}
      </main>
    </div>
  );
}

export default function ManageProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-birgen-black" />}>
      <ManageContent />
    </Suspense>
  );
}

// ───────────────────────── Sub-components ───────────────────────────────────

interface SectionProps {
  /** If set, `/profiles/manage?edit=…#<sectionId>` opens this block and scrolls to it. */
  sectionId?: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({
  sectionId,
  icon,
  title,
  subtitle,
  rightSlot,
  defaultOpen = false,
  children,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionId) return;
    const sync = () => {
      if (typeof window === 'undefined') return;
      if (window.location.hash === `#${sectionId}`) {
        setOpen(true);
        requestAnimationFrame(() => {
          rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [sectionId]);

  return (
    <div
      ref={rootRef}
      id={sectionId}
      className="rounded-md border border-birgen-border bg-white/[0.02] mb-3 overflow-hidden scroll-mt-6"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-4 px-4 sm:px-5 py-4 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className="w-9 h-9 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-white">
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-white text-[15px] font-medium truncate">{title}</p>
          {subtitle && <p className="text-birgen-silver text-xs mt-0.5 truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          {rightSlot}
          {open ? (
            <X className="w-4 h-4 text-birgen-silver" />
          ) : (
            <ArrowRight className="w-4 h-4 text-birgen-silver" />
          )}
        </div>
      </button>
      {open && <div className="px-4 sm:px-5 pb-5 pt-1">{children}</div>}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none p-3 rounded-md bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-birgen-red"
      />
      <div>
        <p className="text-white text-sm font-medium">{label}</p>
        <p className="text-birgen-silver text-xs">{description}</p>
      </div>
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-birgen-silver mb-1.5">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-11 px-3.5 bg-white/[0.04] border border-white/10 focus:border-birgen-red/70 rounded-md text-white text-sm outline-none transition-all"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-birgen-black">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SubsPreview({ prefs }: { prefs: ProfilePrefs }) {
  const sizeMap: Record<SubsSize, string> = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
    xl: 'text-2xl',
  };
  const bgMap: Record<SubsBackground, string> = {
    none: '',
    shadow: 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]',
    box: 'bg-black/70 px-3 py-1 rounded',
  };
  return (
    <span className={`font-medium text-white ${sizeMap[prefs.subsSize]} ${bgMap[prefs.subsBackground]}`}>
      The quick brown fox jumps over the lazy dog.
    </span>
  );
}
