'use client';
/**
 * /profiles — "Who's watching?" picker (Netflix-style).
 *
 * Flow:
 *   • Unauthenticated → bounce to /welcome.
 *   • Authenticated with 0 watching_profiles → bounce to /profiles/new
 *     (first-time setup).
 *   • Authenticated with ≥1 profiles → show the picker. Clicking a tile
 *     writes the active profile to cookie + localStorage and routes home.
 *   • The "Manage Profiles" button opens /profiles/manage for add/edit/delete.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { useAuth } from '@/components/AuthProvider';

export default function ProfilesPage() {
  const router = useRouter();
  const {
    user,
    watchingProfiles,
    loading,
    accountReady,
    configured,
    setActiveWatchingProfile,
  } = useAuth();
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (loading || !configured || !accountReady) return;
    if (!user) {
      router.replace('/welcome');
      return;
    }
    if (watchingProfiles.length === 0) {
      router.replace('/profiles/new?initial=1');
    }
  }, [loading, configured, accountReady, user, watchingProfiles, router]);

  const pick = (id: string) => {
    if (editMode) {
      router.push(`/profiles/manage?edit=${id}`);
      return;
    }
    setActiveWatchingProfile(id);
    // Hard navigation (not router.push): the middleware gate for `/` reads the
    // birgenai_wp cookie we just wrote. A soft client navigation races that
    // cookie write — the RSC request for `/` can go out without it, so the gate
    // sees no active profile and bounces straight back here ("nothing happens").
    window.location.assign('/');
  };

  const canAddMore = watchingProfiles.length < 5;

  return (
    <div className="min-h-screen bg-birgen-black flex flex-col">
      <header className="px-6 sm:px-10 py-6">
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
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <h1 className="font-display text-[44px] sm:text-[64px] text-white tracking-wide text-center mb-12">
          Who's watching?
        </h1>

        {watchingProfiles.length === 0 && accountReady && !loading ? (
          <div className="text-center">
            <p className="text-birgen-silver mb-6">No profiles yet.</p>
            <Link
              href="/profiles/new?initial=1"
              className="inline-flex items-center gap-2 px-6 py-3 bg-birgen-red hover:bg-birgen-red-light text-white font-semibold rounded-md transition-all"
            >
              <Plus className="w-4 h-4" />
              Create your first profile
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex flex-wrap items-start justify-center gap-6 sm:gap-10 max-w-4xl">
              {watchingProfiles.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => pick(p.id)}
                    className="group flex flex-col items-center gap-3 focus:outline-none"
                    aria-label={editMode ? `Edit ${p.name}` : `Watch as ${p.name}`}
                  >
                    <div className="relative">
                      <Avatar
                        avatarKey={p.avatar_key}
                        size={128}
                        rounded="md"
                        className="ring-0 group-hover:ring-2 group-hover:ring-white transition-all"
                      />
                      {editMode && (
                        <div className="absolute inset-0 rounded-[10px] bg-black/65 flex items-center justify-center">
                          <Pencil className="w-6 h-6 text-white" />
                        </div>
                      )}
                    </div>
                    <span className="text-birgen-silver group-hover:text-white text-[15px] transition-colors">
                      {p.name}
                    </span>
                  </button>
                </li>
              ))}

              {canAddMore && !editMode && (
                <li>
                  <Link
                    href="/profiles/new"
                    className="group flex flex-col items-center gap-3"
                    aria-label="Add profile"
                  >
                    <div className="w-32 h-32 rounded-[10px] border-2 border-dashed border-white/15 group-hover:border-white/40 flex items-center justify-center transition-colors">
                      <Plus className="w-10 h-10 text-white/60 group-hover:text-white transition-colors" />
                    </div>
                    <span className="text-birgen-silver group-hover:text-white text-[15px] transition-colors">
                      Add Profile
                    </span>
                  </Link>
                </li>
              )}
            </ul>

            <button
              onClick={() => setEditMode((v) => !v)}
              className="mt-12 px-6 py-2.5 border border-birgen-silver/40 text-birgen-silver hover:text-white hover:border-white text-sm tracking-[0.12em] uppercase transition-colors"
            >
              {editMode ? 'Done' : 'Manage Profiles'}
            </button>
          </>
        )}
      </main>
    </div>
  );
}
