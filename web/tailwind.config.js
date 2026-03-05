/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        birgen: {
          red: '#E50914',
          'red-dark': '#B20710',
          'red-light': '#FF1E2D',
          black: '#0A0A0A',
          'dark': '#111111',
          'card': '#1A1A1A',
          'border': '#2A2A2A',
          'muted': '#6B6B6B',
          'silver': '#A0A0A0',
        },
      },
      fontFamily: {
        display: ['var(--font-bebas)', 'sans-serif'],
        body: ['var(--font-outfit)', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
      },
      backgroundImage: {
        'red-gradient': 'linear-gradient(135deg, #E50914 0%, #8B0000 100%)',
        'dark-gradient': 'linear-gradient(180deg, transparent 0%, #0A0A0A 100%)',
        'card-gradient': 'linear-gradient(180deg, transparent 40%, rgba(10,10,10,0.95) 100%)',
        'hero-gradient': 'linear-gradient(90deg, rgba(10,10,10,0.95) 0%, rgba(10,10,10,0.6) 50%, transparent 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'shimmer': 'shimmer 1.5s infinite',
        'pulse-red': 'pulseRed 2s infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseRed: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(229, 9, 20, 0.4)' },
          '50%': { boxShadow: '0 0 0 12px rgba(229, 9, 20, 0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
    },
  },
  plugins: [],
};
