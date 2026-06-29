'use client';
/**
 * /profiles/new — Create a new watching profile.
 *
 * Used in two places:
 *   1. First-time onboarding (?initial=1) right after signup. When this is
 *      the first profile, we flag it as `is_default` so the rest of the app
 *      has a sane auto-pick.
 *   2. Adding a 2nd–5th profile via the "Add Profile" tile on /profiles.
 *
 * Picks an avatar from `lib/avatars.ts`, a display name, and optional "Kids"
 * flag. Saves to `watching_profiles` with the authenticated user as owner.
 */

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, ChevronLeft, Loader2 } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { AVATARS, AVATAR_CATEGORIES, avatarsByCategory } from '@/lib/avatars';
import { useAuth } from '@/components/AuthProvider';

function NewProfileForm() {
  const router = useRouter();
  const params = useSearchParams();
  const isInitial = params.get('initial') === '1';

  const { user, watchingProfiles, loading, refreshWatchingProfiles, setActiveWatchingProfile } =
    useAuth();

  const [name, setName] = useState('');
  const [avatarKey, setAvatarKey] = useState<string>(AVATARS[0].key);
  const [isKids, setIsKids] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/welcome');
  }, [loading, user, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give this profile a name.');
      return;
    }
    if (!user) return;

    setSaving(true);
    const shouldBeDefault = watchingProfiles.length === 0;

    const res = await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: trimmed,
        avatar_key: avatarKey,
        is_kids: isKids,
        is_default: shouldBeDefault,
      }),
    });
    const body = await res.json().catch(() => ({}));

    setSaving(false);

    if (!res.ok) {
      setError(body?.error ?? 'Could not create profile.');
      return;
    }

    const data = body?.profile;
    await refreshWatchingProfiles();
    if (data) setActiveWatchingProfile(data.id);
    const dest = isInitial || shouldBeDefault ? '/' : '/profiles';
    // Hard navigation when landing on `/`: that route's middleware gate reads the
    // birgenai_wp cookie we just wrote, and a soft navigation races the write —
    // the gate would see no active profile and bounce back to /profiles.
    if (dest === '/') {
      window.location.assign('/');
    } else {
      router.replace(dest);
    }
  };

  return (
    <div className="min-h-screen bg-birgen-black flex flex-col">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center px-6 sm:px-10 py-6 gap-4">
        <div className="justify-self-start">
          {!isInitial ? (
            <Link
              href="/profiles"
              className="inline-flex items-center gap-1.5 text-sm text-birgen-silver hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden />
              Back to profiles
            </Link>
          ) : null}
        </div>
        <Link href="/" className="justify-self-center">
          <Image
            src="/Images/birgenaihub.png"
            alt="BirgenAI"
            width={140}
            height={32}
            className="h-8 w-auto object-contain"
            priority
          />
        </Link>
        <div aria-hidden className="justify-self-end w-[140px]" />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-3xl">
          <h1 className="font-display text-[40px] sm:text-[56px] text-white tracking-wide text-center mb-2">
            {isInitial ? 'Create your profile' : 'Add a Profile'}
          </h1>
          <p className="text-birgen-silver text-center mb-10">
            Profiles let everyone in your household have their own watchlist, ratings, and
            continue-watching row.
          </p>

          <form onSubmit={handleSave}>
            <div className="flex flex-col sm:flex-row items-center gap-8 justify-center border-y border-birgen-border py-8">
              {/* Avatar preview */}
              <div className="flex flex-col items-center gap-3">
                <Avatar avatarKey={avatarKey} size={140} rounded="md" />
                <span className="text-birgen-silver text-xs uppercase tracking-widest">
                  {AVATARS.find((a) => a.key === avatarKey)?.label}
                </span>
              </div>

              {/* Form */}
              <div className="flex-1 w-full max-w-sm space-y-4">
                <label className="block">
                  <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-birgen-silver mb-1.5">
                    Name
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Faith"
                    maxLength={32}
                    className="w-full h-11 px-3.5 bg-white/[0.04] border border-white/10 focus:border-birgen-red/70 rounded-md text-white text-base placeholder-birgen-muted outline-none transition-all"
                    autoFocus
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
                      Only age-appropriate titles appear. No ratings prompts.
                    </p>
                  </div>
                </label>

                {error && (
                  <p className="text-red-400 text-xs" role="alert">
                    {error}
                  </p>
                )}
              </div>
            </div>

            {/* Avatar picker — grouped by category */}
            <div className="mt-8 space-y-7">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-birgen-silver">
                Choose an avatar
              </h2>
              {AVATAR_CATEGORIES.map((cat) => {
                const items = avatarsByCategory()[cat.id];
                if (items.length === 0) return null;
                return (
                  <div key={cat.id}>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 mb-3">
                      {cat.label}
                      <span className="ml-2 text-birgen-muted font-normal">{items.length}</span>
                    </h3>
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                      {items.map((a) => (
                        <button
                          key={a.key}
                          type="button"
                          onClick={() => setAvatarKey(a.key)}
                          className={`relative rounded-[10px] transition-all ${
                            avatarKey === a.key
                              ? 'ring-2 ring-white scale-[1.04]'
                              : 'ring-0 hover:scale-[1.04]'
                          }`}
                          aria-label={`Pick ${a.label} avatar`}
                          title={a.label}
                        >
                          <Avatar avatarKey={a.key} size={72} rounded="md" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-10">
              <Link
                href="/profiles"
                className="px-5 py-2.5 text-birgen-silver hover:text-white text-sm tracking-[0.1em] uppercase transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 bg-birgen-red hover:bg-birgen-red-light disabled:bg-birgen-red/40 text-white font-semibold text-sm rounded-md flex items-center gap-2 transition-all"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {isInitial ? 'Start watching' : 'Save profile'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

export default function NewProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-birgen-black" />}>
      <NewProfileForm />
    </Suspense>
  );
}
