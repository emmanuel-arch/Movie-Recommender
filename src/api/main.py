from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional

# Load local .env for dev. No-op in Cloud Run where env vars are injected.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from recommender import Recommender
from kenyan_bridge import (
    compute_genre_weights,
    fetch_kenyan_catalogue,
    fetch_user_ratings,
    rank_kenyan_movies,
    supabase_configured,
)

app = FastAPI(title="BirgenAI Movie Recommender", version="1.1")

# CORS — production origins + local dev. The Cloudflare Worker in front also
# handles CORS, but keep this permissive so direct hits during staging work.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://movies.birgenai.com",
        "https://birgenai.com",
        "http://localhost:3000",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

recommender = Recommender()

# ── Pydantic schemas ─────────────────────────────────────────────────
class RatingInput(BaseModel):
    movieId: int
    rating: float = Field(ge=0.5, le=5.0)


class RecommendRequest(BaseModel):
    ratings: List[RatingInput]
    n: int = 10


class MovieResult(BaseModel):
    movieId: int
    title: str
    genres: str
    predicted_rating: float
    poster_url: Optional[str] = None
    year: Optional[str] = None


class KenyanRequest(BaseModel):
    ratings: List[RatingInput]
    n: int = 10
    language: Optional[str] = None


class KenyanMovieResult(BaseModel):
    id: str
    slug: str
    title: str
    description: Optional[str] = None
    genres: List[str] = []
    mood_tags: List[str] = []
    year: Optional[int] = None
    duration_minutes: Optional[int] = None
    poster_url: Optional[str] = None
    backdrop_url: Optional[str] = None
    trailer_url: Optional[str] = None
    hls_master_url: Optional[str] = None
    birgen_rating: float = 0
    language: str = "en"
    maturity: str = "PG-13"
    match_score: float = 0


# ── Endpoints ────────────────────────────────────────────────────────
@app.get("/")
def health():
    return {
        "status": "ok",
        "model": "SVD",
        "supabase": supabase_configured(),
    }


@app.post("/recommend", response_model=List[MovieResult])
def recommend(req: RecommendRequest):
    if not req.ratings:
        raise HTTPException(400, "Provide at least one rating")
    if len(req.ratings) < 3:
        raise HTTPException(400, "Rate at least 3 movies for good recommendations")

    try:
        recs = recommender.get_recommendations(
            user_ratings=[(r.movieId, r.rating) for r in req.ratings],
            n=req.n,
        )
        return recs
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/movies/popular")
def popular_movies(n: int = 50):
    """Return popular movies for the onboarding screen."""
    return recommender.get_popular_movies(n)


@app.get("/movies/search")
def search_movies(q: str, limit: int = 10):
    """Search movies by title."""
    return recommender.search_movies(q, limit)


# ── Kenyan algorithm bridge ──────────────────────────────────────────
@app.post("/kenyan/recommendations", response_model=List[KenyanMovieResult])
async def kenyan_recommendations_by_ratings(req: KenyanRequest):
    """Rank the Kenyan catalogue against a provided ratings list.

    Intended for guest users (no Supabase row yet) — the client just
    forwards localStorage ratings so we can still personalise.
    """
    user_ratings = [(r.movieId, r.rating) for r in req.ratings]
    genres_map = recommender.get_movie_genres_map([mid for mid, _ in user_ratings])
    weights = compute_genre_weights(user_ratings, genres_map)

    catalogue = await fetch_kenyan_catalogue()
    if not catalogue:
        return []

    return rank_kenyan_movies(
        catalogue,
        weights,
        user_language=req.language,
        n=req.n,
    )


@app.get("/kenyan/recommendations/{user_id}", response_model=List[KenyanMovieResult])
async def kenyan_recommendations_by_user(
    user_id: str,
    n: int = Query(10, ge=1, le=50),
    language: Optional[str] = None,
):
    """Signed-in path: pull the user's ratings from Supabase, then score."""
    if not supabase_configured():
        raise HTTPException(503, "Supabase is not configured on the server.")

    user_ratings = await fetch_user_ratings(user_id)
    genres_map = recommender.get_movie_genres_map([mid for mid, _ in user_ratings])
    weights = compute_genre_weights(user_ratings, genres_map)

    catalogue = await fetch_kenyan_catalogue()
    if not catalogue:
        return []

    return rank_kenyan_movies(
        catalogue,
        weights,
        user_language=language,
        n=n,
    )


@app.get("/kenyan/catalogue", response_model=List[KenyanMovieResult])
async def kenyan_catalogue():
    """Full published Kenyan catalogue — used for the Browse page's
    'Kenyan Originals' row."""
    catalogue = await fetch_kenyan_catalogue()
    return [
        {
            "id": m.id,
            "slug": m.slug,
            "title": m.title,
            "description": m.description,
            "genres": m.genres,
            "mood_tags": m.mood_tags,
            "year": m.year,
            "duration_minutes": m.duration_minutes,
            "poster_url": m.poster_url,
            "backdrop_url": m.backdrop_url,
            "trailer_url": m.trailer_url,
            "hls_master_url": m.hls_master_url,
            "birgen_rating": m.birgen_rating,
            "language": m.language,
            "maturity": m.maturity,
            "match_score": 0.0,
        }
        for m in catalogue
    ]
