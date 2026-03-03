'use client'

type MovieRec = { movieId: number; title: string; genres: string; predicted_rating: number; poster_url?: string; year?: string }
type UserRating = { movieId: number; title: string; rating: number }

export default function RecommendationsPage({ recs, userRatings, onReset }: { recs: MovieRec[]; userRatings: UserRating[]; onReset: () => void }) {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-purple-400">🎬 Your Picks</h1>
        <button onClick={onReset} className="text-slate-400 hover:text-white border border-slate-700 rounded-full px-4 py-1.5 text-sm">
          ← Re-rate
        </button>
      </div>
      <div className="max-w-6xl mx-auto p-6">
        <h2 className="text-2xl font-bold mb-2">Recommendations for you</h2>
        <p className="text-slate-400 mb-8">
          Based on your {userRatings.length} ratings, powered by collaborative filtering
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {recs.map((m, i) => (
            <div key={m.movieId} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              <div className="aspect-[2/3] bg-gradient-to-br from-slate-700 to-purple-900 flex items-center justify-center">
                <span className="text-5xl">🎬</span>
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between mb-1">
                  <span className="text-xs text-purple-400 font-bold">#{i+1}</span>
                  <span className="text-xs bg-purple-900 text-purple-200 px-2 py-0.5 rounded-full">
                    ★ {m.predicted_rating}
                  </span>
                </div>
                <p className="font-medium text-sm text-white mb-1 line-clamp-2">{m.title}</p>
                <p className="text-xs text-slate-500">{m.genres.split('|').slice(0,2).join(' · ')}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}