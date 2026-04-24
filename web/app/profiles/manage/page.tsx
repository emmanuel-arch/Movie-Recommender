'use client';
/**
 * /profiles/manage — edit or delete an existing watching profile.
 *
 * Accepts `?edit=<profileId>` to pre-select a specific profile. Without a
 * query param we show the profile grid with an edit pencil on each tile
 * (same as `/profiles` in edit-mode) so the user can pick one.
 */

import { useEffect, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Trash2, Check, Shield } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { AVATARS } from '@/lib/avatars';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase/client';

function ManageForm() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get('edit');

  const { user, watchingProfiles, loading, refreshWatchingProfiles, setActiveWatchingProfile } =
    useAuth();

  const editing = useMemo(
    () => watchingProfiles.find((p) => p.id === editId) ?? null,
    [watchingProfiles, editId],
  );

  const [name, setName] = useState('');
  const [avatarKey, setAvatarKey] = useState<string>(AVATARS[0].key);
  const [isKids, setIsKids] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setAvatarKey(editing.avatar_key);
      setIsKids(editing.is_kids);
      setIsDefault(editing.is_default);
    }
  }, [editing]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!editing || !user) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name cannot be empty.');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) return;

    setSaving(true);

    // If we're turning THIS profile into the default, clear the flag on
    // others first so the partial unique index is happy.
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
    router.replace('/profiles');
  };

  const handleDelete = async () => {
    if (!editing || !user) return;
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

    // If we just deleted the active profile, clear it so the picker reopens.
    setActiveWatchingProfile(null);
    await refreshWatchingProfiles();
    router.replace('/profiles');
  };

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
          href="/profiles"
          className="inline-flex items-center gap-2 text-birgen-silver hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-3xl">
          <h1 className="font-display text-[40px] sm:text-[56px] text-white tracking-wide mb-2">
            Edit Profile
          </h1>

          {!editing ? (
            <>
              <p className="text-birgen-silver mb-8">Select a profile to edit.</p>
              <ul className="flex flex-wrap gap-6">
                {watchingProfiles.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/profiles/manage?edit=${p.id}`}
                      className="flex flex-col items-center gap-2 group"
                    >
                      <Avatar
                        avatarKey={p.avatar_key}
                        size={120}
                        rounded="md"
                        className="group-hover:ring-2 group-hover:ring-white transition-all"
                      />
                      <span className="text-birgen-silver group-hover:text-white text-sm transition-colors">
                        {p.name}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <form onSubmit={handleSave}>
              <div className="flex flex-col sm:flex-row items-center gap-8 justify-center border-y border-birgen-border py-8">
                <div className="flex flex-col items-center gap-3">
                  <Avatar avatarKey={avatarKey} size={140} rounded="md" />
                  <span className="text-birgen-silver text-xs uppercase tracking-widest">
                    {AVATARS.find((a) => a.key === avatarKey)?.label}
                  </span>
                </div>

                <div className="flex-1 w-full max-w-sm space-y-4">
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
                        Restricts the catalogue to age-appropriate titles.
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

                  {error && (
                    <p className="text-red-400 text-xs" role="alert">
                      {error}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-8">
                <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-birgen-silver mb-3">
                  Avatar
                </h2>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-10 gap-3">
                  {AVATARS.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => setAvatarKey(a.key)}
                      className={`rounded-[10px] transition-all ${
                        avatarKey === a.key ? 'ring-2 ring-white scale-[1.04]' : 'hover:scale-[1.04]'
                      }`}
                    >
                      <Avatar avatarKey={a.key} size={72} rounded="md" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between mt-10 gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 border border-red-500/40 text-red-400 hover:text-white hover:bg-red-500/10 text-sm tracking-[0.1em] uppercase rounded-md transition-colors"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete
                </button>

                <div className="flex items-center gap-3 ml-auto">
                  <Link
                    href="/profiles"
                    className="px-5 py-2.5 text-birgen-silver hover:text-white text-sm tracking-[0.1em] uppercase transition-colors"
                  >
                    Cancel
                  </Link>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-birgen-red hover:bg-birgen-red-light disabled:bg-birgen-red/40 text-white font-semibold text-sm rounded-md transition-all"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

export default function ManageProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-birgen-black" />}>
      <ManageForm />
    </Suspense>
  );
}
