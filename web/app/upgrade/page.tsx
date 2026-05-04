'use client';
import Link from 'next/link';
import { Check, Clock, Sparkles, Zap, Globe2, Tv2, Infinity as InfinityIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/components/AuthProvider';
import { PREMIUM_MONTHLY_KES_LIST, PREMIUM_MONTHLY_KES_PROMO } from '@/lib/billing';

const BASE_PREMIUM_FEATURES = [
  'Unlimited watch time',
  'No ads, ever',
  'Full HD streaming (up to 1080p)',
  'Continue watching across devices',
  'Early access to new Kenyan releases',
  'Download for offline viewing (coming soon)',
] as const;

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
    price: `KSh ${PREMIUM_MONTHLY_KES_PROMO}`,
    listPrice: PREMIUM_MONTHLY_KES_LIST,
    promoPrice: PREMIUM_MONTHLY_KES_PROMO,
    period: 'per month',
    tagline: 'Unlimited. Ad-free. Up to 1080p. Early access.',
    highlight: true,
    features: BASE_PREMIUM_FEATURES,
    cta: 'Go Premium',
  },
] as const;

function PriceStrikeX({ listKes }: { listKes: number }) {
  return (
    <div className="relative inline-flex items-center justify-center py-1">
      <span className="text-2xl sm:text-3xl font-bold text-birgen-muted/90 line-through tracking-tight">
        KSh {listKes.toLocaleString()}
      </span>
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden
      >
        <svg viewBox="0 0 100 24" className="w-[110%] h-8 text-red-600 drop-shadow-sm" fill="none">
          <path
            d="M4 20 L96 4"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </div>
  );
}

export default function UpgradePage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const isPremium = profile?.plan === 'premium';

  return (
    <div className="min-h-screen bg-birgen-black">
      <Navbar />

      <div className="relative pt-28 pb-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex flex-wrap items-center justify-center gap-2 mb-5">
          </div>
          <h1 className="font-display text-5xl sm:text-6xl text-white tracking-wide leading-[0.95] mb-4">
            WATCH IT ALL.<br />
            <span className="text-birgen-red">UNCAPPED.</span>
          </h1>

          {/* Netflix-style skinny promo strip */}
          <div className="mt-8 rounded-lg border border-birgen-red/35 bg-gradient-to-r from-birgen-red/20 via-birgen-card to-birgen-red/15 px-4 py-3 text-left sm:text-center max-w-xl mx-auto">
            <p className="font-display text-amber-300 text-xl sm:text-2xl tracking-wide">
              Save&nbsp;{(Math.round(((PREMIUM_MONTHLY_KES_LIST - PREMIUM_MONTHLY_KES_PROMO) / PREMIUM_MONTHLY_KES_LIST) * 100))}%&nbsp;this month only
            </p>
            <p className="text-birgen-muted text-xs sm:text-sm mt-1">
              Full Netflix-style HD experience • no commitments today beyond M-PESA checkout
            </p>
          </div>
        </div>

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
                  Best value · limited time
                </div>
              )}
              <h2 className="font-display text-4xl text-white tracking-wide mb-1">{plan.name}</h2>

              {'listPrice' in plan && typeof plan.promoPrice === 'number' && (
                <div className="flex flex-col gap-3 mb-2">
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                    <PriceStrikeX listKes={plan.listPrice} />
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl text-white font-bold tracking-tight">
                        KSh {plan.promoPrice.toLocaleString()}
                      </span>
                      <span className="text-birgen-muted text-sm">/ {plan.period}</span>
                    </div>
                  </div>
                  <p className="text-amber-200/90 text-xs font-semibold uppercase tracking-wider">
                    Intro price — lock in before we return to KSh {plan.listPrice}
                  </p>
                </div>
              )}

              {plan.id === 'free' && (
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-3xl text-white font-bold">{plan.price}</span>
                  <span className="text-birgen-muted text-sm">/ {plan.period}</span>
                </div>
              )}

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
                  {isPremium ? 'Downgrade coming soon' : plan.cta}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isPremium}
                  className="w-full py-3 bg-birgen-red hover:bg-birgen-red-light disabled:bg-birgen-red/40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-md transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                  onClick={() => {
                    if (!user) {
                      window.location.href = '/?auth=1&next=/transact';
                      return;
                    }
                    router.push('/transact');
                  }}
                >
                  <Sparkles className="w-4 h-4" />
                  {isPremium ? 'You\u2019re Premium' : plan.cta}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="grid sm:grid-cols-4 gap-4 mb-14">
          <Feature icon={<InfinityIcon className="w-5 h-5" />} label="Unlimited hours" />
          <Feature icon={<Zap className="w-5 h-5" />} label="No ads" />
          <Feature icon={<Tv2 className="w-5 h-5" />} label="1080p HD" />
          <Feature icon={<Globe2 className="w-5 h-5" />} label="New releases first" />
        </div>

        <p className="text-center text-birgen-muted text-xs">
          Pay securely with M-PESA on the next step.{' '}
          <Link href="/transact" className="text-birgen-silver underline-offset-2 hover:underline">
            Open checkout
          </Link>
          {' · '}
          <Link href="/" className="text-birgen-silver underline-offset-2 hover:underline">
            Back to browse
          </Link>
          <br className="hidden sm:block" />
          Card and other methods arriving soon — Premium today is promo-priced at KSh {PREMIUM_MONTHLY_KES_PROMO}.
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
