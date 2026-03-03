'use client'
import { useState } from 'react'
import OnboardingFlow from '@/components/OnboardingFlow'
import RecommendationsPage from '@/components/RecommendationsPage'

export type UserRating = { movieId: number; title: string; rating: number }

export default function Home() {
  const [userRatings, setUserRatings] = useState<UserRating[]>([])
  const [recommendations, setRecommendations] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleGetRecs = async (ratings: UserRating[]) => {
    setLoading(true)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const res = await fetch(`${apiUrl}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ratings: ratings.map(r => ({ movieId: r.movieId, rating: r.rating })), n: 20 })
    })
    const data = await res.json()
    setRecommendations(data)
    setLoading(false)
  }

  if (recommendations) {
    return <RecommendationsPage
      recs={recommendations}
      userRatings={userRatings}
      onReset={() => { setRecommendations(null); setUserRatings([]) }}
    />
  }

  return <OnboardingFlow
    onComplete={(ratings) => { setUserRatings(ratings); handleGetRecs(ratings) }}
    loading={loading}
  />
}