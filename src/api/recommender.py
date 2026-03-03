import pandas as pd
import numpy as np
import joblib
from pathlib import Path

class Recommender:
    def __init__(self):
        base = Path(__file__).parent.parent.parent
        
        print("Loading SVD model...")
        self.svd = joblib.load(base / "models/svd_model.pkl")
        
        print("Loading movie data...")
        self.movies = pd.read_csv(base / "data/movies.csv")
        self.train  = pd.read_csv(base / "data/train.csv")
        
        # Precompute: popularity score for cold-start onboarding
        ratings_count = self.train.groupby('movieId')['rating'].agg(['count', 'mean'])
        ratings_count.columns = ['count', 'avg_rating']
        # Wilson score: balances popularity with quality
        n = ratings_count['count']
        p = ratings_count['avg_rating'] / 5.0
        z = 1.96
        ratings_count['score'] = (
            (p + z**2/(2*n) - z*np.sqrt((p*(1-p)+z**2/(4*n))/n)) /
            (1 + z**2/n)
        )
        self.popularity = ratings_count.reset_index()
        self.movies_with_stats = self.movies.merge(
            self.popularity['score'].reset_index().rename(columns={'index':'movieId'}),
            on='movieId', how='left'
        ).fillna({'score': 0})
        
        # All unique movie IDs in training set
        self.all_movie_ids = set(self.train['movieId'].unique())
        
        # Global fallback
        self.global_mean = self.train['rating'].mean()
        
        print("✅ Recommender ready!")
    
    def get_recommendations(self, user_ratings: list, n: int = 10) -> list:
        """
        Given a list of (movieId, rating) tuples, return top-N recommendations.
        
        Strategy: Since SVD requires a known userId, we use a 'pseudo-user' approach.
        We find the most similar user in the training set and use their SVD vector
        as a proxy, then re-rank using the input ratings as bias corrections.
        """
        rated_ids = {mid for mid, _ in user_ratings}
        
        # Candidate movies: all movies user hasn't rated
        candidates = self.all_movie_ids - rated_ids
        
        # Find nearest neighbor user (simple approach)
        similar_user_id = self._find_similar_user(user_ratings)
        
        # Predict ratings for all candidates
        preds = []
        for mid in candidates:
            pred = self.svd.predict(similar_user_id, mid).est
            preds.append((mid, pred))
        
        # Sort by predicted rating, take top N
        preds.sort(key=lambda x: x[1], reverse=True)
        top_n = preds[:n]
        
        # Fetch movie metadata
        results = []
        for mid, pred_rating in top_n:
            movie_row = self.movies[self.movies['movieId'] == mid]
            if movie_row.empty:
                continue
            m = movie_row.iloc[0]
            title = m['title']
            year = title[title.rfind('(')+1:title.rfind(')')] if '(' in title else None
            results.append({
                "movieId": int(mid),
                "title": title,
                "genres": m['genres'],
                "predicted_rating": round(pred_rating, 2),
                "poster_url": None,  # Fetch from TMDB if you have API key
                "year": year
            })
        return results
    
    def _find_similar_user(self, user_ratings: list) -> int:
        """Find the most similar user in training data using cosine similarity."""
        rated_movies = {mid: r for mid, r in user_ratings}
        common_movies = list(rated_movies.keys())
        
        # Get users who rated at least half of the input movies
        subset = self.train[self.train['movieId'].isin(common_movies)]
        overlap = subset.groupby('userId')['movieId'].count()
        min_overlap = max(2, len(common_movies) // 2)
        candidate_users = overlap[overlap >= min_overlap].index.tolist()
        
        if not candidate_users:
            # Fallback: return most active user
            return self.train.groupby('userId').size().idxmax()
        
        # Compute similarity for candidate users
        user_ratings_df = pd.DataFrame(
            list(rated_movies.items()), columns=['movieId', 'input_rating']
        )
        
        best_user, best_score = candidate_users[0], -1
        for uid in candidate_users[:500]:  # Limit for speed
            user_data = subset[subset['userId'] == uid]
            merged = user_ratings_df.merge(user_data[['movieId', 'rating']], on='movieId')
            if len(merged) < 2:
                continue
            # Pearson correlation as similarity
            corr = merged['input_rating'].corr(merged['rating'])
            if corr > best_score:
                best_score = corr
                best_user = uid
        
        return best_user
    
    def get_popular_movies(self, n: int = 50) -> list:
        """Return popular movies for onboarding (min 100 ratings)."""
        popular = self.movies_with_stats.merge(
            self.popularity[['movieId', 'count', 'avg_rating']], on='movieId', how='left'
        ).fillna(0)
        popular = popular[popular['count'] >= 100]
        popular = popular.sort_values('score', ascending=False).head(n)
        return popular[['movieId', 'title', 'genres', 'avg_rating']].to_dict('records')
    
    def search_movies(self, query: str, limit: int = 10) -> list:
        """Search movies by title (case-insensitive substring match)."""
        mask = self.movies['title'].str.contains(query, case=False, na=False)
        results = self.movies[mask].head(limit)
        return results[['movieId', 'title', 'genres']].to_dict('records')