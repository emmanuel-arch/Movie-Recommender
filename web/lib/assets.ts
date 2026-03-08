/**
 * Asset URL resolver — resolves local asset paths to external CDN URLs in production.
 *
 * In development: /Videos/hero-inception.mp4  →  /Videos/hero-inception.mp4  (local public/)
 * In production:  /Videos/hero-inception.mp4  →  https://assets.birgenai.com/Videos/hero-inception.mp4  (Cloudflare R2)
 *
 * Set NEXT_PUBLIC_R2_PUBLIC_URL in your environment to enable external asset resolution.
 * Example: NEXT_PUBLIC_R2_PUBLIC_URL=https://assets.birgenai.com
 */

const R2_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '';

/**
 * Resolve a local asset path to the appropriate URL.
 * If R2_BASE is set and the path is a local path (starts with /), prepend the R2 base.
 * If the path is already an absolute URL (https://), return as-is.
 */
export function assetUrl(path: string): string {
  if (!path) return path;

  // Already an absolute URL — return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // If R2 base is configured, resolve local paths to R2
  if (R2_BASE) {
    // Ensure path starts with /
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${R2_BASE}${cleanPath}`;
  }

  // No R2 configured — use local path (dev mode)
  return path;
}

/**
 * Resolve a video path specifically.
 * Shorthand: assetUrl(`/Videos/${filename}`)
 */
export function videoUrl(filename: string): string {
  if (filename.startsWith('/') || filename.startsWith('http')) {
    return assetUrl(filename);
  }
  return assetUrl(`/Videos/${filename}`);
}

/**
 * Resolve an image path specifically.
 * Shorthand: assetUrl(`/Images/${filename}`)
 */
export function imageUrl(filename: string): string {
  if (filename.startsWith('/') || filename.startsWith('http')) {
    return assetUrl(filename);
  }
  return assetUrl(`/Images/${filename}`);
}
