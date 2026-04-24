"""
Kenyan Recommendations Bridge
─────────────────────────────
Maps the user's Hollywood taste vector (learned from MovieLens ratings via
SVD + genre weighting) onto the Kenyan catalogue stored in Supabase.

The catalogue is fetched from Supabase REST with the service role key so
this module never has to hold direct DB credentials.

Scoring for a Kenyan movie M given a user's genre weight vector W:
    score(M) = 0.60 * sum(W[g] for g in M.genres)
             + 0.40 * sum(W[t] for t in M.mood_tags)
    score(M) *= (M.birgen_rating / 5.0)      # editorial quality boost
    score(M) *= 1.10 if M.language == user_language else 1.0

The 0.60 / 0.40 split is deliberately genre-heavy because genres are the
signal MovieLens already knows. Mood tags come online as we add more
Kenyan metadata.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import httpx


SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_TIMEOUT_S = float(os.getenv("SUPABASE_TIMEOUT_S", "5"))


@dataclass(frozen=True)
class KenyanMovie:
    id: str
    slug: str
    title: str
    description: str
    genres: List[str]
    mood_tags: List[str]
    year: Optional[int]
    duration_minutes: Optional[int]
    backdrop_url: Optional[str]
    poster_url: Optional[str]
    trailer_url: Optional[str]
    hls_master_url: Optional[str]
    birgen_rating: float
    language: str
    maturity: str

    @classmethod
    def from_row(cls, row: Dict[str, Any]) -> "KenyanMovie":
        return cls(
            id=row.get("id", ""),
            slug=row.get("slug", ""),
            title=row.get("title", ""),
            description=row.get("description") or "",
            genres=list(row.get("genres") or []),
            mood_tags=list(row.get("mood_tags") or []),
            year=row.get("year"),
            duration_minutes=row.get("duration_minutes"),
            backdrop_url=row.get("backdrop_url"),
            poster_url=row.get("poster_url"),
            trailer_url=row.get("trailer_url"),
            hls_master_url=row.get("hls_master_url"),
            birgen_rating=float(row.get("birgen_rating") or 0) or 0.0,
            language=row.get("language") or "en",
            maturity=row.get("maturity") or "PG-13",
        )


def supabase_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)


def _sb_headers() -> Dict[str, str]:
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


async def fetch_kenyan_catalogue() -> List[KenyanMovie]:
    """Return all published Kenyan movies. Empty list if Supabase is unconfigured."""
    if not supabase_configured():
        return []

    url = f"{SUPABASE_URL}/rest/v1/kenyan_movies"
    params = {
        "select": "id,slug,title,description,genres,mood_tags,year,duration_minutes,"
                  "poster_url,backdrop_url,trailer_url,hls_master_url,birgen_rating,"
                  "language,maturity,sort_weight",
        "is_published": "eq.true",
        "order": "sort_weight.desc",
    }
    async with httpx.AsyncClient(timeout=SUPABASE_TIMEOUT_S) as client:
        res = await client.get(url, params=params, headers=_sb_headers())
        res.raise_for_status()
        rows = res.json() or []
    return [KenyanMovie.from_row(r) for r in rows]


async def fetch_user_ratings(user_id: str) -> List[Tuple[int, float]]:
    """Pull (movie_id, rating) from Supabase for the given auth user."""
    if not (supabase_configured() and user_id):
        return []
    url = f"{SUPABASE_URL}/rest/v1/ratings"
    params = {
        "select": "movie_id,rating",
        "user_id": f"eq.{user_id}",
        "movie_id": "not.is.null",
    }
    async with httpx.AsyncClient(timeout=SUPABASE_TIMEOUT_S) as client:
        res = await client.get(url, params=params, headers=_sb_headers())
        res.raise_for_status()
        rows = res.json() or []
    return [(int(r["movie_id"]), float(r["rating"])) for r in rows if r.get("movie_id") is not None]


# ── scoring ──────────────────────────────────────────────────────────────────
def compute_genre_weights(
    user_ratings: Sequence[Tuple[int, float]],
    movie_genres: Dict[int, List[str]],
    *,
    liked_threshold: float = 3.5,
) -> Dict[str, float]:
    """
    Build a weighted preference vector over genres, normalized to [0, 1].

    Heavier weight for higher ratings:
        weight(genre) = sum( (rating - 3) / 2  for each rating where genre in movie )
    Then min-max normalized.
    """
    if not user_ratings:
        return {}

    raw: Dict[str, float] = {}
    for movie_id, rating in user_ratings:
        if rating < liked_threshold:
            continue
        genres = movie_genres.get(int(movie_id), [])
        # Center around 3 → range [-1.25, 1] for 0.5-5.0 scale
        delta = (rating - 3.0) / 2.0
        for g in genres:
            if not g or g == "(no genres listed)":
                continue
            raw[g] = raw.get(g, 0.0) + max(delta, 0.0)

    if not raw:
        return {}

    max_w = max(raw.values()) or 1.0
    return {g: round(w / max_w, 4) for g, w in raw.items()}


def score_kenyan_movie(
    movie: KenyanMovie,
    genre_weights: Dict[str, float],
    *,
    user_language: Optional[str] = None,
    genre_weight: float = 0.6,
    mood_weight: float = 0.4,
) -> float:
    genre_score = sum(genre_weights.get(g, 0.0) for g in movie.genres)
    mood_score = sum(genre_weights.get(t, 0.0) for t in movie.mood_tags)
    base = (genre_weight * genre_score) + (mood_weight * mood_score)

    quality = (movie.birgen_rating / 5.0) if movie.birgen_rating else 0.7
    score = base * quality

    if user_language and movie.language == user_language:
        score *= 1.1

    return round(score, 4)


def rank_kenyan_movies(
    catalogue: Iterable[KenyanMovie],
    genre_weights: Dict[str, float],
    *,
    user_language: Optional[str] = None,
    n: int = 10,
) -> List[Dict[str, Any]]:
    scored: List[Tuple[KenyanMovie, float]] = [
        (m, score_kenyan_movie(m, genre_weights, user_language=user_language))
        for m in catalogue
    ]
    # If the user has no taste vector yet, fall back to birgen_rating order.
    if all(s == 0 for _, s in scored):
        scored = [(m, m.birgen_rating) for m, _ in scored]
    scored.sort(key=lambda x: x[1], reverse=True)

    out: List[Dict[str, Any]] = []
    for movie, score in scored[:n]:
        out.append({
            "id": movie.id,
            "slug": movie.slug,
            "title": movie.title,
            "description": movie.description,
            "genres": movie.genres,
            "mood_tags": movie.mood_tags,
            "year": movie.year,
            "duration_minutes": movie.duration_minutes,
            "poster_url": movie.poster_url,
            "backdrop_url": movie.backdrop_url,
            "trailer_url": movie.trailer_url,
            "hls_master_url": movie.hls_master_url,
            "birgen_rating": movie.birgen_rating,
            "language": movie.language,
            "maturity": movie.maturity,
            "match_score": round(score, 3),
        })
    return out
