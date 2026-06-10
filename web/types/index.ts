export interface Movie {
  movieId: number;
  title: string;
  genres: string;
  avg_rating?: number;
  predicted_rating?: number;
  poster_url?: string | null;
  backdrop_url?: string | null;
  /** Cinematic card art with the title baked in (playable titles only). Falls back to backdrop. */
  card_url?: string | null;
  year?: string | null;
  overview?: string;
  tmdb_id?: number;
  stream_url?: string | null;
  trailer_url?: string | null;
  /** Birgen catalogue slug → `/movie/[slug]` + `/watch/[slug]` when playable. */
  slug?: string;
  playable?: boolean;
  comingSoon?: boolean;
  runtimeMinutes?: number;
  maturity?: string;
}

export interface RatingInput {
  movieId: number;
  rating: number;
}

export interface RecommendRequest {
  ratings: RatingInput[];
  n?: number;
}

export interface RatedMovie {
  movie: Movie;
  rating: number;
}

export type GenreFilter =
  | 'All'
  | 'Action'
  | 'Comedy'
  | 'Drama'
  | 'Horror'
  | 'Sci-Fi'
  | 'Thriller'
  | 'Romance'
  | 'Animation'
  | 'Documentary';

export interface TMDBMovie {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  release_date: string;
  vote_average: number;
}
