'use client';
import { useCallback } from 'react';

const STORAGE_KEY = 'birgenai_playback';

interface PlaybackRecord {
  /** Current playback position in seconds */
  position: number;
  /** Total duration of the video in seconds */
  duration: number;
  /** Timestamp when this was last updated */
  updatedAt: number;
}

type PlaybackMap = Record<number, PlaybackRecord>;

function getMap(): PlaybackMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveMap(map: PlaybackMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage full or unavailable
  }
}

/**
 * Hook for tracking video playback progress.
 * Persists position to localStorage so users can resume where they left off.
 */
export function usePlaybackProgress() {
  /** Get saved position (in seconds) for a movie. Returns 0 if none. */
  const getPosition = useCallback((movieId: number): number => {
    const map = getMap();
    const record = map[movieId];
    if (!record) return 0;
    // If the user was within 30s of the end, start from beginning
    if (record.duration > 0 && record.duration - record.position < 30) return 0;
    return record.position;
  }, []);

  /** Get progress as a percentage (0-100) for a movie. */
  const getProgress = useCallback((movieId: number): number => {
    const map = getMap();
    const record = map[movieId];
    if (!record || !record.duration) return 0;
    return Math.min(100, (record.position / record.duration) * 100);
  }, []);

  /** Save current playback position. Call this on timeupdate events. */
  const savePosition = useCallback((movieId: number, position: number, duration: number) => {
    const map = getMap();
    map[movieId] = { position, duration, updatedAt: Date.now() };
    saveMap(map);
  }, []);

  /** Clear progress for a specific movie. */
  const clearPosition = useCallback((movieId: number) => {
    const map = getMap();
    delete map[movieId];
    saveMap(map);
  }, []);

  /** Get all movies that have been partially watched (for "Continue Watching" row). */
  const getContinueWatching = useCallback((): Array<{ movieId: number; progress: number }> => {
    const map = getMap();
    return Object.entries(map)
      .filter(([, record]) => {
        // Include only if between 2% and 95% watched
        if (!record.duration) return false;
        const pct = (record.position / record.duration) * 100;
        return pct > 2 && pct < 95;
      })
      .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
      .map(([id, record]) => ({
        movieId: Number(id),
        progress: Math.min(100, (record.position / record.duration) * 100),
      }));
  }, []);

  return { getPosition, getProgress, savePosition, clearPosition, getContinueWatching };
}
