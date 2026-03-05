'use client';
import { useState, useCallback, useEffect } from 'react';
import { Movie, RatingInput, RatedMovie } from '@/types';
import { getRecommendations } from '@/lib/api';

const STORAGE_KEY = 'birgenai_ratings';

export function useRatings() {
  const [ratings, setRatings] = useState<Map<number, number>>(new Map());
  const [ratedMovies, setRatedMovies] = useState<RatedMovie[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: RatedMovie[] = JSON.parse(stored);
        setRatedMovies(parsed);
        const map = new Map(parsed.map((r) => [r.movie.movieId, r.rating]));
        setRatings(map);
      }
    } catch {}
  }, []);

  const rateMovie = useCallback((movie: Movie, rating: number) => {
    setRatings((prev) => {
      const next = new Map(prev);
      next.set(movie.movieId, rating);
      return next;
    });
    setRatedMovies((prev) => {
      const existing = prev.findIndex((r) => r.movie.movieId === movie.movieId);
      let next: RatedMovie[];
      if (existing >= 0) {
        next = [...prev];
        next[existing] = { movie, rating };
      } else {
        next = [...prev, { movie, rating }];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeRating = useCallback((movieId: number) => {
    setRatings((prev) => {
      const next = new Map(prev);
      next.delete(movieId);
      return next;
    });
    setRatedMovies((prev) => {
      const next = prev.filter((r) => r.movie.movieId !== movieId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearRatings = useCallback(() => {
    setRatings(new Map());
    setRatedMovies([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const getRatingInputs = useCallback((): RatingInput[] => {
    return Array.from(ratings.entries()).map(([movieId, rating]) => ({
      movieId,
      rating,
    }));
  }, [ratings]);

  return {
    ratings,
    ratedMovies,
    rateMovie,
    removeRating,
    clearRatings,
    getRatingInputs,
    count: ratings.size,
    hasEnoughRatings: ratings.size >= 5,
  };
}

export function useRecommendations() {
  const [recommendations, setRecommendations] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommendations = useCallback(async (ratingInputs: RatingInput[], n = 20) => {
    if (ratingInputs.length < 1) return;
    setLoading(true);
    setError(null);
    try {
      const results = await getRecommendations(ratingInputs, n);
      setRecommendations(results);
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch recommendations');
    } finally {
      setLoading(false);
    }
  }, []);

  return { recommendations, loading, error, fetchRecommendations };
}
