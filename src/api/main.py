from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import pandas as pd
import numpy as np
import joblib
from recommender import Recommender

app = FastAPI(title="BirgenAI Movie Recommender", version="1.0")

# Allow requests from movies.birgenai.com and localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://movies.birgenai.com",
        "https://birgenai.com",
        "http://localhost:3000"
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model and data at startup (once) - Model bootstrapping as it runs the __init__() method
recommender = Recommender()

# ── Pydantic schemas ─────────────────────────────────────────────────
class RatingInput(BaseModel):
    movieId: int
    rating: float  # 0.5 – 5.0

class RecommendRequest(BaseModel):
    ratings: List[RatingInput]  # Movies the user has rated
    n: int = 10                 # How many recommendations to return

class MovieResult(BaseModel):
    movieId: int
    title: str
    genres: str
    predicted_rating: float
    poster_url: Optional[str]
    year: Optional[str]

# ── Endpoints ────────────────────────────────────────────────────────
@app.get("/")
def health():
    return {"status": "ok", "model": "SVD"}

@app.post("/recommend", response_model=List[MovieResult])
def recommend(req: RecommendRequest):
    if not req.ratings:
        raise HTTPException(400, "Provide at least one rating")
    if len(req.ratings) < 3:
        raise HTTPException(400, "Rate at least 3 movies for good recommendations")
    
    try:
        recs = recommender.get_recommendations(
            user_ratings=[(r.movieId, r.rating) for r in req.ratings],
            n=req.n
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