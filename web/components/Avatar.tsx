'use client';
/**
 * Netflix-style avatar tile. Accepts either an `avatarKey` (recipe from
 * `lib/avatars.ts`) or a raw `src` URL (for OAuth profile photos). Falls
 * back to the default ember recipe when neither is provided.
 *
 * Sizes are square; the border radius matches Netflix's subtle rounding.
 */
import Image from 'next/image';
import { getAvatar } from '@/lib/avatars';

export interface AvatarProps {
  avatarKey?: string | null;
  src?: string | null;
  size?: number;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
  alt?: string;
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
}: AvatarProps) {
  const radius = RADIUS[rounded];

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
  const [from, to] = avatar.gradient;

  return (
    <div
      className={`relative overflow-hidden ${radius} ${className}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
      }}
      aria-label={`${avatar.label} avatar`}
    >
      <div
        className="absolute inset-0 flex items-center justify-center font-display text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]"
        style={{ fontSize: Math.round(size * 0.55) }}
      >
        {avatar.glyph}
      </div>
      {avatar.tone === 'kids' && size >= 64 && (
        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-birgen-red text-white text-[9px] font-bold tracking-wider leading-none">
          KIDS
        </span>
      )}
    </div>
  );
}
