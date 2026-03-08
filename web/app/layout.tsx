import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'BirgenAI Movies - Personalized Picks, Powered by AI',
  description:
    'Discover movies tailored to your taste. BirgenAI uses machine learning to recommend what you\'ll love next.',
  keywords: 'movie recommendations, AI movies, personalized picks, BirgenAI',
  openGraph: {
    title: 'BirgenAI Movies - Personalized Picks, Powered by AI',
    description: 'AI-powered movie recommendations just for you.',
    url: 'https://movies.birgenai.com',
    siteName: 'BirgenAI Movies',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BirgenAI Movies - Personalized Picks, Powered by AI',
    description: 'AI-powered movie recommendations just for you.',
  },
  icons: {
    icon: '/Images/logo.png',
    apple: '/Images/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-birgen-black font-body antialiased">
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1A1A1A',
              color: '#fff',
              border: '1px solid #2A2A2A',
            },
            success: {
              iconTheme: { primary: '#E50914', secondary: '#fff' },
            },
          }}
        />
        {children}
      </body>
    </html>
  );
}
