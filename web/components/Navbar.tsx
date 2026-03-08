'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Search, Bell, Menu, X, User, LogOut, LogIn } from 'lucide-react';

interface NavbarProps {
  ratingCount?: number;
}

export default function Navbar({ ratingCount = 0 }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
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
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/browse', label: 'Browse' },
    { href: '/my-list', label: 'My List' },
    { href: '/onboarding', label: 'Rate Movies' },
    { href: '/recommendations', label: 'For You' },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-birgen-black/95 backdrop-blur-md' : 'bg-gradient-to-b from-birgen-black/90 via-birgen-black/60 to-transparent'
      }`}
    >
      <div className="max-w-[1920px] mx-auto px-4 sm:px-8 lg:px-12">
        <div className="flex items-center h-16 gap-6">
          {/* Logo — far left */}
          <Link href="/" className="flex-shrink-0">
            <Image
              src="/Images/birgenaihub.png"
              alt="BirgenAI"
              width={140}
              height={36}
              className="h-7 w-auto object-contain"
              priority
            />
          </Link>

          {/* Desktop Nav links — next to logo */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ href, label }) => {
              const isForYou = href === '/recommendations';
              const ready = isForYou && ratingCount >= 5;

              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
                    pathname === href
                      ? 'text-white font-semibold'
                      : ready
                        ? 'text-white font-semibold'
                        : 'text-birgen-silver/90 hover:text-white/80'
                  }`}
                >
                  {label}
                  {ready && (
                    <span className="relative inline-flex h-1.5 w-1.5 ml-1.5 -top-0.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-birgen-red opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-birgen-red" />
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right side icons */}
          <div className="flex items-center gap-4">
            {/* Search */}
            <div ref={searchRef} className="relative flex items-center">
              {searchOpen ? (
                <div className="flex items-center bg-birgen-black border border-white/50 rounded-sm animate-fade-in">
                  <Search className="w-4 h-4 text-white ml-2.5" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Titles, people, genres"
                    className="bg-transparent text-white text-sm px-2 py-1.5 w-48 sm:w-56 outline-none placeholder-birgen-muted"
                  />
                  <button
                    onClick={() => setSearchOpen(false)}
                    className="p-1.5 text-white/60 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSearchOpen(true)}
                  className="text-white hover:text-white/70 transition-colors"
                >
                  <Search className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Kids */}
            <Link
              href="/browse"
              className="hidden sm:block text-[13px] font-medium text-white hover:text-white/70 transition-colors"
            >
              Kids
            </Link>

            {/* Notifications bell */}
            <div className="relative">
              <button className="text-white hover:text-white/70 transition-colors">
                <Bell className="w-5 h-5" />
              </button>
              {ratingCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-birgen-red text-white text-[10px] font-bold leading-none px-1">
                  {ratingCount > 9 ? '9+' : ratingCount}
                </span>
              )}
            </div>

            {/* Profile dropdown */}
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-1 group"
                aria-label="Profile"
              >
                <div className="w-8 h-8 rounded-sm overflow-hidden bg-birgen-red flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <span
                  className={`hidden sm:block w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-white/80 transition-transform duration-200 ${
                    profileOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-birgen-black/95 border border-birgen-border rounded-sm shadow-2xl overflow-hidden z-50 animate-fade-in backdrop-blur-sm">
                  <div className="px-4 py-3 border-b border-birgen-border">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-sm bg-birgen-red flex items-center justify-center">
                        <User className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">Guest User</p>
                        <p className="text-birgen-muted text-xs">{ratingCount} movies rated</p>
                      </div>
                    </div>
                  </div>
                  <div className="py-1">
                    <Link
                      href="/my-list"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-birgen-silver hover:text-white hover:bg-white/5 transition-colors"
                    >
                      My List
                    </Link>
                    <Link
                      href="/onboarding"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-birgen-silver hover:text-white hover:bg-white/5 transition-colors"
                    >
                      Account
                    </Link>
                    <button className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-birgen-silver hover:text-white hover:bg-white/5 transition-colors">
                      Help Center
                    </button>
                  </div>
                  <div className="border-t border-birgen-border py-1">
                    <button className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-birgen-silver hover:text-white hover:bg-white/5 transition-colors">
                      <LogIn className="w-4 h-4" />
                      Sign In
                    </button>
                    <button className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-birgen-silver hover:text-white hover:bg-white/5 transition-colors">
                      <LogOut className="w-4 h-4" />
                      Sign out of BirgenAI
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden text-white hover:text-white/70 transition-colors"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden bg-birgen-black/95 border-t border-birgen-border backdrop-blur-sm">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`block px-4 py-3 rounded-sm text-sm font-medium transition-colors ${
                  pathname === href
                    ? 'text-white bg-white/5'
                    : 'text-birgen-silver hover:text-white hover:bg-white/5'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
