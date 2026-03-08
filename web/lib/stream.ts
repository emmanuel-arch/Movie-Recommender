/**
 * Cloudflare Stream integration
 *
 * Setup:
 * 1. Sign up at https://dash.cloudflare.com → Stream
 * 2. Upload your MP4 movies via the dashboard or API
 * 3. Each video gets a unique Video ID (UUID)
 * 4. Add your Customer Subdomain to .env.local:
 *      NEXT_PUBLIC_CF_STREAM_DOMAIN=customer-XXXXX.cloudflarestream.com
 * 5. Map movieId → Cloudflare Video ID in STREAM_MAP below
 *
 * Cloudflare Stream delivers HLS (adaptive bitrate) automatically.
 * Playback URL pattern:
 *   https://customer-{code}.cloudflarestream.com/{video-id}/manifest/video.m3u8
 * Thumbnail URL pattern:
 *   https://customer-{code}.cloudflarestream.com/{video-id}/thumbnails/thumbnail.jpg
 */

const CF_STREAM_DOMAIN = process.env.NEXT_PUBLIC_CF_STREAM_DOMAIN || '';

/**
 * Map MovieLens movieId → Cloudflare Stream Video ID
 *
 * After uploading a movie to Cloudflare Stream, copy the Video ID
 * and add it here. Example:
 *   79132: 'ea95132c15732412d22c1476fa83f27a',  // Inception
 *
 * You can also store this mapping in a database or API.
 */
const STREAM_MAP: Record<number, string> = {
  // ── Featured / Top 5 movies ──────────────────────────────
  // 168250: 'your-cloudflare-video-id-here',  // Get Out (2017)
  // 139644: 'your-cloudflare-video-id-here',  // Sicario (2015)
  // 79132:  'your-cloudflare-video-id-here',  // Inception (2010)
  // 58559:  'your-cloudflare-video-id-here',  // The Dark Knight (2008)
  // 74458:  'your-cloudflare-video-id-here',  // Shutter Island (2010)

  // ── Add more movies as you upload them ───────────────────
  // movieId: 'cloudflare-video-id',
};

/**
 * Get the HLS streaming URL for a movie.
 * Returns null if the movie hasn't been uploaded to Cloudflare Stream.
 */
export function getStreamUrl(movieId: number): string | null {
  const videoId = STREAM_MAP[movieId];
  if (!videoId || !CF_STREAM_DOMAIN) return null;
  return `https://${CF_STREAM_DOMAIN}/${videoId}/manifest/video.m3u8`;
}

/**
 * Get a direct MP4 URL (lower quality, no adaptive bitrate).
 * Useful as a fallback for browsers that don't support HLS natively.
 */
export function getStreamMp4Url(movieId: number): string | null {
  const videoId = STREAM_MAP[movieId];
  if (!videoId || !CF_STREAM_DOMAIN) return null;
  return `https://${CF_STREAM_DOMAIN}/${videoId}/downloads/default.mp4`;
}

/**
 * Get a thumbnail from the stream.
 */
export function getStreamThumbnail(movieId: number, time = '10s'): string | null {
  const videoId = STREAM_MAP[movieId];
  if (!videoId || !CF_STREAM_DOMAIN) return null;
  return `https://${CF_STREAM_DOMAIN}/${videoId}/thumbnails/thumbnail.jpg?time=${time}`;
}

/**
 * Check if a movie has a stream available.
 */
export function hasStream(movieId: number): boolean {
  return !!STREAM_MAP[movieId] && !!CF_STREAM_DOMAIN;
}

/**
 * Get the Cloudflare Stream iframe embed URL.
 * Can be used as an alternative to the HLS URL.
 */
export function getStreamEmbedUrl(movieId: number): string | null {
  const videoId = STREAM_MAP[movieId];
  if (!videoId || !CF_STREAM_DOMAIN) return null;
  return `https://${CF_STREAM_DOMAIN}/${videoId}/iframe`;
}

/**
 * Enrich a movie object with its stream_url if available.
 */
export function enrichWithStreamUrl<T extends { movieId: number; stream_url?: string | null }>(
  movie: T,
): T {
  if (!movie.stream_url) {
    const url = getStreamUrl(movie.movieId);
    if (url) return { ...movie, stream_url: url };
  }
  return movie;
}

/**
 * Batch-enrich an array of movies with stream URLs.
 */
export function enrichMoviesWithStreamUrls<T extends { movieId: number; stream_url?: string | null }>(
  movies: T[],
): T[] {
  return movies.map(enrichWithStreamUrl);
}
