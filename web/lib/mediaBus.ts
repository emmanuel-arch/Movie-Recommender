/**
 * Tiny global media coordinator.
 *
 * The hero-section background trailers keep playing (and, once unmuted, keep
 * their audio) even when the user opens a fullscreen movie/trailer player on
 * top of the page. These players live in separate component trees, so instead
 * of threading state through React we use a window-level event: any player that
 * starts playing announces it, and the hero listens and mutes itself.
 */
export const MEDIA_PLAY_EVENT = 'birgen:media-play';

/** Call when a real player starts playback so background trailers can mute. */
export function announceMediaPlay() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(MEDIA_PLAY_EVENT));
}

/** Subscribe to "something started playing". Returns an unsubscribe fn. */
export function onMediaPlay(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(MEDIA_PLAY_EVENT, handler);
  return () => window.removeEventListener(MEDIA_PLAY_EVENT, handler);
}
