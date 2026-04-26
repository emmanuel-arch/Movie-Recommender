import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BirgenAI — Unlimited movies, TV shows, and more',
  description:
    'Starts at Ksh 50. Cancel anytime. Create a BirgenAI account for AI-powered movie recommendations.',
  openGraph: {
    title: 'BirgenAI — Unlimited movies, TV shows, and more',
    description: 'Ready to watch? Enter your email to get started.',
  },
};

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
