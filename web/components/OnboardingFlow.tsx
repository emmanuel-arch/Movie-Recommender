'use client'
import { useState, useEffect } from 'react'

type Movie = { movieId: number; title: string; genres: string; avg_rating?: number }
type RatingEntry = { title: string; rating: number }
type RatingsMap = Record<number, RatingEntry>
type UserRating = { movieId: number; title: string; rating: number }

const STEPS = ['Welcome', 'Rate Movies', 'Getting Recs']
const API = process.env.NEXT_PUBLIC_API_URL

export default function OnboardingFlow({ onComplete, loading }: { onComplete: (ratings: UserRating[]) => void; loading: boolean }) {
  const [step, setStep] = useState(0)
  const [popularMovies, setPopularMovies] = useState<Movie[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Movie[]>([])
  const [ratings, setRatings] = useState<RatingsMap>({})  // { movieId: { title, rating } }

  useEffect(() => {
    fetch(`${API}/movies/popular?n=60`)
      .then(r => r.json()).then(setPopularMovies)
  }, [])

  const handleSearch = async (q: string) => {
    setSearchQuery(q)
    if (q.length < 2) { setSearchResults([]); return }
    const res = await fetch(`${API}/movies/search?q=${q}`)
    setSearchResults(await res.json())
  }

  const rateMovie = (movieId: number, title: string, rating: number) => {
    setRatings((prev: RatingsMap) => ({ ...prev, [movieId]: { title, rating } }))
  }

  const ratedMovies = Object.entries(ratings).map(([id, val]) => ({
    movieId: +id, title: val.title, rating: val.rating
  }))

  if (step === 0) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-purple-950 text-white p-8">
      <div className="text-center max-w-xl">
        <div className="text-7xl mb-6">🎬</div>
        <h1 className="text-5xl font-bold mb-4">BirgenAI Movies</h1>
        <p className="text-xl text-slate-300 mb-8">
          Tell us a few movies you love (or hate) — and we'll surface your next
          obsession from 60,000+ titles, powered by machine learning.
        </p>
        <button onClick={() => setStep(1)}
          className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-4 px-10 rounded-full text-lg transition-all">
          Get Started →
        </button>
        <p className="mt-4 text-slate-500 text-sm">Rate just 5+ movies to get personalized picks</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <h2 className="text-xl font-bold text-purple-400">🎬 BirgenAI Movies</h2>
          <div className="flex items-center gap-4">
            <span className="text-slate-400 text-sm">{ratedMovies.length} rated</span>
            <button
              onClick={() => ratedMovies.length >= 3 && onComplete(ratedMovies)}
              disabled={ratedMovies.length < 3 || loading}
              className="bg-purple-600 disabled:opacity-40 hover:bg-purple-500 font-bold py-2 px-6 rounded-full transition-all">
              {loading ? 'Finding Picks…' : 'Get Recommendations →'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* Search */}
        <div className="mb-8">
          <input
            placeholder="Search for a specific movie..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-5 py-3 text-white placeholder:text-slate-500 text-lg focus:outline-none focus:border-purple-500"
          />
          {searchResults.length > 0 && (
            <div className="mt-2 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              {searchResults.map(m => (
                <SearchResultRow key={m.movieId} movie={m} onRate={rateMovie} rated={ratings[m.movieId]} />
              ))}
            </div>
          )}
        </div>

        <h3 className="text-xl font-bold mb-4 text-slate-300">⭐ Rate movies you've seen</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {popularMovies.map(m => (
            <MovieCard key={m.movieId} movie={m} onRate={rateMovie} currentRating={ratings[m.movieId]?.rating} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SearchResultRow({ movie, onRate, rated }: { movie: Movie; onRate: (id: number, title: string, rating: number) => void; rated?: RatingEntry }) {
  const stars = [1, 2, 3, 4, 5]
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700 last:border-0">
      <div>
        <p className="text-sm font-medium text-white">{movie.title}</p>
        <p className="text-xs text-slate-500">{movie.genres}</p>
      </div>
      <div className="flex gap-0.5">
        {stars.map(s => (
          <button key={s} onClick={() => onRate(movie.movieId, movie.title, s)}
            className={`text-lg hover:scale-110 transition-transform ${s <= (rated?.rating || 0) ? 'text-yellow-400' : 'text-slate-600'}`}>★</button>
        ))}
      </div>
    </div>
  )
}

function MovieCard({ movie, onRate, currentRating }: { movie: Movie; onRate: (id: number, title: string, rating: number) => void; currentRating?: number }) {
  const stars = [1, 2, 3, 4, 5]
  return (
    <div className={`bg-slate-800 rounded-xl p-3 border ${currentRating ? 'border-purple-500' : 'border-slate-700'} hover:border-slate-500 transition-all`}>
      <div className="aspect-[2/3] bg-slate-700 rounded-lg mb-2 flex items-center justify-center text-4xl">🎬</div>
      <p className="text-xs font-medium text-white mb-1 line-clamp-2">{movie.title}</p>
      <p className="text-xs text-slate-500 mb-2">{movie.genres.split('|')[0]}</p>
      <div className="flex gap-0.5">
        {stars.map(s => (
          <button key={s} onClick={() => onRate(movie.movieId, movie.title, s)}
            className={`text-lg hover:scale-110 transition-transform ${s <= (currentRating || 0) ? 'text-yellow-400' : 'text-slate-600'}`}>★</button>
        ))}
      </div>
    </div>
  )
}