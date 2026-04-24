'use client';
import Link from 'next/link';
import Image from 'next/image';
import { Check, Sparkles, Zap, Film, Globe2, Tv2, Infinity as InfinityIcon } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/components/AuthProvider';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 'KSh 0',
    period: 'forever',
    tagline: 'Try BirgenAI, rate movies, discover Kenyan gems.',
    highlight: false,
    features: [
      'Unlimited browsing & search',
      'Rate movies, get personalized picks',
      '20 hours of watch time per month',
      'Ad-supported (pre-roll)',
      'Up to 480p streaming',
    ],
    cta: 'You\u2019re on Free',
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 'KSh 499',
    period: 'per month',
    tagline: 'Unlimited. Ad-free. Up to 1080p. Early access.',
    highlight: true,
    features: [
      'Unlimited watch time',
      'No ads, ever',
      'Full HD streaming (up to 1080p)',
      'Continue watching across devices',
      'Early access to new Kenyan releases',
      'Download for offline viewing (coming soon)',
    ],
    cta: 'Go Premium',
  },
];

export default function UpgradePage() {
  const { user, profile } = useAuth();
  const isPremium = profile?.plan === 'premium';

  return (
    <div className="min-h-screen bg-birgen-black">
      <Navbar />

      <div className="relative pt-28 pb-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-birgen-red/10 border border-birgen-red/30 text-birgen-red text-[11px] font-bold uppercase tracking-widest mb-5">
            <Sparkles className="w-3 h-3" />
            Premium
          </div>
          <h1 className="font-display text-5xl sm:text-6xl text-white tracking-wide leading-[0.95] mb-4">
            WATCH IT ALL.<br />
            <span className="text-birgen-red">UNCAPPED.</span>
          </h1>
          <p className="text-birgen-silver text-base sm:text-lg leading-relaxed">
            Full HD streaming, no ads, and every new Kenyan original the moment it drops. Cancel anytime.
          </p>
        </div>

        {/* Plans */}
        <div className="grid sm:grid-cols-2 gap-5 mb-14">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative p-7 rounded-2xl transition-all ${
                plan.highlight
                  ? 'bg-gradient-to-b from-birgen-red/15 via-birgen-card to-birgen-card border-2 border-birgen-red/40 shadow-2xl shadow-birgen-red/10'
                  : 'bg-birgen-card border border-birgen-border'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-birgen-red text-white text-[10px] font-bold uppercase tracking-wider shadow-lg">
                  Recommended
                </div>
              )}
              <h2 className="font-display text-4xl text-white tracking-wide mb-1">{plan.name}</h2>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl text-white font-bold">{plan.price}</span>
                <span className="text-birgen-muted text-sm">/ {plan.period}</span>
              </div>
              <p className="text-birgen-silver text-sm mb-5">{plan.tagline}</p>

              <ul className="space-y-2.5 mb-7">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-white/85 text-sm">
                    <Check
                      className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                        plan.highlight ? 'text-birgen-red' : 'text-birgen-muted'
                      }`}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {plan.id === 'free' ? (
                <div className="w-full py-3 text-center bg-birgen-dark border border-birgen-border text-birgen-silver text-sm font-semibold rounded-md">
                  {isPremium ? 'Downgrade' : plan.cta}
                </div>
              ) : (
                <button
                  disabled={isPremium}
                  className="w-full py-3 bg-birgen-red hover:bg-birgen-red-light disabled:bg-birgen-red/40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-md transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                  onClick={() => {
                    // TODO: wire to Stripe / M-Pesa checkout.
                    if (!user) {
                      window.location.href = '/?auth=1';
                      return;
                    }
                    alert('Payment integration coming next. Connect Stripe or M-Pesa here.');
                  }}
                >
                  <Sparkles className="w-4 h-4" />
                  {isPremium ? 'You\u2019re Premium' : plan.cta}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Why premium */}
        <div className="grid sm:grid-cols-4 gap-4 mb-14">
          <Feature icon={<InfinityIcon className="w-5 h-5" />} label="Unlimited hours" />
          <Feature icon={<Zap className="w-5 h-5" />} label="No ads" />
          <Feature icon={<Tv2 className="w-5 h-5" />} label="1080p HD" />
          <Feature icon={<Globe2 className="w-5 h-5" />} label="New releases first" />
        </div>

        {/* Footer note */}
        <p className="text-center text-birgen-muted text-xs">
          Billed monthly. Cancel anytime from your account page.
          <br className="hidden sm:block" />
          M-Pesa and card payments accepted.
        </p>
      </div>
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-birgen-card border border-birgen-border">
      <div className="w-10 h-10 rounded-full bg-birgen-red/15 border border-birgen-red/30 flex items-center justify-center text-birgen-red">
        {icon}
      </div>
      <span className="text-white text-sm font-semibold">{label}</span>
    </div>
  );
}
