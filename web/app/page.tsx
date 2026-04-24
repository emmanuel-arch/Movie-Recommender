import { Suspense } from 'react';
import Image from 'next/image';
import Navbar from '@/components/Navbar';
import HeroBanner from '@/components/HeroBanner';
import Top5Kenya from '@/components/Top5Kenya';
import ScreenTimeBanner from '@/components/ScreenTimeBanner';
import HomeClient from './HomeClient';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-birgen-black">
      <Navbar />
      <ScreenTimeBanner />
      <HeroBanner />
      <Top5Kenya />
      <Suspense fallback={null}>
        <HomeClient />
      </Suspense>
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-birgen-border mt-16 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <Image
          src="/Images/birgenaihub.png"
          alt="BirgenAI"
          width={120}
          height={32}
          className="h-7 w-auto object-contain"
        />
        <p className="text-birgen-muted text-sm">
          © 2025 BirgenAI · AI-powered movie recommendations
        </p>
        <div className="flex items-center gap-1 text-birgen-muted text-xs">
          <span>Movie data via</span>
          <span className="text-birgen-silver">TMDB</span>
          <span>·</span>
          <span className="text-birgen-silver">MovieLens</span>
        </div>
      </div>
    </footer>
  );
}
