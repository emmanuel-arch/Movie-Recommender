'use client';
/**
 * Netflix-style watching-profile avatar.
 *
 * Render order, top to bottom:
 *
 *   1. A flat dark tile (no per-avatar colour gradient) so PNGs with
 *      white or busy backgrounds do not sit on a clashing fill.
 *   2. If the matching catalogue entry has an `image`, it is letterboxed
 *      (object-contain). If the file is missing or fails to load, fall back.
 *   3. The catalogue's fallback `glyph` centred on the dark tile.
 *   4. A small "KIDS" badge for kid-tone avatars at size ≥ 64.
 *
 * The component accepts either:
 *   - `avatarKey` (entry key from `lib/avatars.ts`), OR
 *   - `src` (raw URL — used for OAuth profile photos).
 *
 * Sizes are square. All callers pass `size`, so the image scales consistently
 * everywhere (picker tile, navbar, manage page, "Who's watching?", etc.).
 */
import { useState } from 'react';
import Image from 'next/image';
import { getAvatar } from '@/lib/avatars';

export interface AvatarProps {
  avatarKey?: string | null;
  src?: string | null;
  size?: number;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
  alt?: string;
  /** Set to false to suppress the auto-rendered KIDS badge. */
  showKidsBadge?: boolean;
}

const RADIUS: Record<NonNullable<AvatarProps['rounded']>, string> = {
  sm: 'rounded-[6px]',
  md: 'rounded-[10px]',
  lg: 'rounded-[14px]',
  full: 'rounded-full',
};

export default function Avatar({
  avatarKey,
  src,
  size = 96,
  rounded = 'md',
  className = '',
  alt = 'Profile avatar',
  showKidsBadge = true,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const radius = RADIUS[rounded];

  // Direct URL path (OAuth photos). Just render it cropped to a square.
  if (src) {
    return (
      <div
        className={`relative overflow-hidden bg-birgen-card ${radius} ${className}`}
        style={{ width: size, height: size }}
      >
        <Image src={src} alt={alt} fill sizes={`${size}px`} className="object-cover" />
      </div>
    );
  }

  const avatar = getAvatar(avatarKey);
  const showImage = !!avatar.image && !imgError;

  return (
    <div
      className={`relative overflow-hidden bg-birgen-card ${radius} ${className}`}
      style={{ width: size, height: size }}
      aria-label={`${avatar.label} avatar`}
    >
      {showImage ? (
        <div className="absolute inset-0 p-[5%] sm:p-[6%]">
          <div className="relative h-full w-full">
            <Image
              src={avatar.image!}
              alt={alt}
              fill
              sizes={`${size}px`}
              className="object-contain object-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
              onError={() => setImgError(true)}
            />
          </div>
        </div>
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center font-display text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]"
          style={{ fontSize: Math.round(size * 0.5) }}
        >
          {avatar.glyph}
        </div>
      )}

      {showKidsBadge && avatar.tone === 'kids' && size >= 64 && (
        <span className="absolute bottom-1 right-1 z-10 px-1.5 py-0.5 rounded bg-birgen-red text-white text-[9px] font-bold tracking-wider leading-none">
          KIDS
        </span>
      )}
    </div>
  );
}
