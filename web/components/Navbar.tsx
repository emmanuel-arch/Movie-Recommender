'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Search, Film, Sparkles, Star, Menu, X, User, LogOut, LogIn } from 'lucide-react';

interface NavbarProps {
  ratingCount?: number;
}

export default function Navbar({ ratingCount = 0 }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const navLinks = [
    { href: '/', label: 'Home', icon: Film },
    { href: '/browse', label: 'Browse', icon: Search },
    { href: '/onboarding', label: 'Rate Movies', icon: Star },
    { href: '/recommendations', label: 'For You', icon: Sparkles },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-birgen-black/95 backdrop-blur-md border-b border-birgen-border' : 'bg-gradient-to-b from-birgen-black/80 to-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo — top left */}
          <Link href="/" className="flex items-center gap-2 group flex-shrink-0">
            <Image
              src="/Images/birgenaihub.png"
              alt="BirgenAI"
              width={140}
              height={36}
              className="h-8 w-auto object-contain"
              priority
            />
          </Link>

          {/* Desktop Nav — center */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const isForYou = href === '/recommendations';
              const ready = isForYou && ratingCount >= 5;

              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    pathname === href
                      ? 'text-white bg-birgen-red/20 border border-birgen-red/30'
                      : ready
                        ? 'text-white bg-birgen-red/10 border border-birgen-red/40 hover:bg-birgen-red/20 animate-for-you-glow'
                        : 'text-birgen-silver hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${ready ? 'text-birgen-red' : ''}`} />
                  {label}
                  {ready && (
                    <span className="relative flex h-2.5 w-2.5 ml-1">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-birgen-red opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-birgen-red" />
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Right side — rating badge + profile icon */}
          <div className="flex items-center gap-3">
            {ratingCount > 0 && (
              <Link href="/recommendations" className="hidden sm:block">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-birgen-red/10 border border-birgen-red/30 text-birgen-red text-sm font-medium hover:bg-birgen-red/20 transition-colors">
                  <Star className="w-3.5 h-3.5 fill-birgen-red" />
                  <span>{ratingCount} rated</span>
                </div>
              </Link>
            )}

            {/* Profile dropdown */}
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="w-8 h-8 rounded bg-birgen-card border border-birgen-border hover:border-birgen-red/40 flex items-center justify-center text-birgen-silver hover:text-white transition-all"
                aria-label="Profile"
              >
                <User className="w-4 h-4" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-birgen-dark border border-birgen-border rounded-lg shadow-2xl overflow-hidden z-50 animate-scale-in">
                  <div className="px-4 py-3 border-b border-birgen-border">
                    <p className="text-white text-sm font-medium">Guest User</p>
                    <p className="text-birgen-muted text-xs">{ratingCount} movies rated</p>
                  </div>
                  <div className="py-1">
                    <button className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-birgen-silver hover:text-white hover:bg-white/5 transition-colors">
                      <LogIn className="w-4 h-4" />
                      Sign In
                    </button>
                    <button className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-birgen-silver hover:text-white hover:bg-white/5 transition-colors">
                      <LogOut className="w-4 h-4" />
                      Log Out
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 text-birgen-silver hover:text-white transition-colors"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden bg-birgen-dark border-t border-birgen-border">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const isForYou = href === '/recommendations';
              const ready = isForYou && ratingCount >= 5;

              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    pathname === href
                      ? 'text-white bg-birgen-red/20'
                      : ready
                        ? 'text-white bg-birgen-red/10 border border-birgen-red/30 animate-for-you-glow'
                        : 'text-birgen-silver hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${ready ? 'text-birgen-red' : ''}`} />
                  {label}
                  {ready && (
                    <span className="relative flex h-2.5 w-2.5 ml-auto">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-birgen-red opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-birgen-red" />
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
