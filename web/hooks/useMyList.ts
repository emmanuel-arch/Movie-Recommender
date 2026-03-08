'use client';
import { useState, useCallback, useEffect } from 'react';
import { Movie } from '@/types';

const STORAGE_KEY = 'birgenai_mylist';

export function useMyList() {
  const [myList, setMyList] = useState<Movie[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setMyList(JSON.parse(stored));
      }
    } catch {}
  }, []);

  const save = (list: Movie[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  };

  const addToList = useCallback((movie: Movie) => {
    setMyList((prev) => {
      if (prev.some((m) => m.movieId === movie.movieId)) return prev;
      const next = [...prev, movie];
      save(next);
      return next;
    });
  }, []);

  const removeFromList = useCallback((movieId: number) => {
    setMyList((prev) => {
      const next = prev.filter((m) => m.movieId !== movieId);
      save(next);
      return next;
    });
  }, []);

  const isInList = useCallback(
    (movieId: number) => myList.some((m) => m.movieId === movieId),
    [myList],
  );

  const reorder = useCallback((fromIndex: number, toIndex: number) => {
    setMyList((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      save(next);
      return next;
    });
  }, []);

  return { myList, addToList, removeFromList, isInList, reorder, count: myList.length };
}
