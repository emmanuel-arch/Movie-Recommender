'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, CreditCard, Landmark, Smartphone } from 'lucide-react';
import Navbar from '@/components/Navbar';
import STKPushModal from '@/components/STKPushModal';
import { useAuth } from '@/components/AuthProvider';
import { PREMIUM_MONTHLY_KES_LIST, PREMIUM_MONTHLY_KES_PROMO } from '@/lib/billing';

type PaymentStep = 'method' | 'phone';

export default function TransactPage() {
  const router = useRouter();
  const { user, profile, loading, refreshProfile } = useAuth();
  const isPremium = profile?.plan === 'premium';

  const [step, setStep] = useState<PaymentStep>('method');
  const [stkOpen, setStkOpen] = useState(false);
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/?auth=1&next=' + encodeURIComponent('/transact'));
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && isPremium) {
      router.replace('/');
    }
  }, [loading, isPremium, router]);

  const onPaid = useCallback(async () => {
    await refreshProfile();
    router.replace('/');
  }, [refreshProfile, router]);

  if (loading || !user || isPremium) {
    return (
      <div className="min-h-screen bg-birgen-black">
        <Navbar />
        <div className="pt-28 flex justify-center px-4">
          <p className="text-birgen-silver text-sm">Loading checkout…</p>
        </div>
      </div>
    );
  }

  const amount = PREMIUM_MONTHLY_KES_PROMO;

  return (
    <div className="min-h-screen bg-birgen-black text-white font-body">
      <Navbar />

      <div className="relative pt-24 pb-16 px-4 sm:px-6 max-w-xl mx-auto">
        <Link
          href="/upgrade"
          className="inline-flex items-center gap-2 text-birgen-silver hover:text-white text-sm mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Plans & pricing
        </Link>

        <header className="mb-10">
          <p className="text-birgen-red font-bold text-[11px] uppercase tracking-[0.2em] mb-3">
            Secure checkout
          </p>
          <h1 className="font-display text-4xl sm:text-5xl tracking-wide text-white leading-tight mb-3">
            Go Premium
          </h1>
          <p className="text-birgen-silver text-sm leading-relaxed">
            Unlock ad-free streaming in full HD. One payment activates Premium on this account right away.
          </p>

          <div className="mt-6 rounded-xl border border-birgen-border bg-birgen-card/80 p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-birgen-muted text-xs uppercase tracking-wider mb-1">Due today</p>
              <p className="text-3xl font-bold text-white tracking-tight">KSh {amount.toLocaleString()}</p>
              <p className="text-birgen-muted text-xs mt-1 line-through">Was KSh {PREMIUM_MONTHLY_KES_LIST}</p>
            </div>
            <div className="text-right shrink-0">
              <span className="inline-block px-2.5 py-1 rounded bg-birgen-red/20 text-birgen-red text-[10px] font-bold uppercase tracking-wider border border-birgen-red/30">
                Promo
              </span>
              <p className="text-birgen-silver text-xs mt-2">Monthly · cancel anytime*</p>
            </div>
          </div>
        </header>

        {step === 'method' && (
          <section className="space-y-4 animate-fade-in">
            <p className="text-birgen-silver text-sm">Choose how you’d like to pay.</p>

            <button
              type="button"
              onClick={() => setStep('phone')}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-birgen-red/60 bg-gradient-to-br from-birgen-red/10 to-birgen-card text-left hover:border-birgen-red transition-all"
            >
              <span className="w-14 h-10 shrink-0 flex items-center justify-center rounded-lg bg-white/95">
                <Image src="/images/mpesa.svg" alt="M-PESA" width={56} height={24} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-birgen-red" />
                  M-PESA
                </p>
                <p className="text-birgen-muted text-xs mt-0.5">
                  Lipa Na M-PESA — instant STK push on your Safaricom line
                </p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-birgen-red shrink-0" />
            </button>

            <div className="grid grid-cols-1 gap-3 opacity-55 pointer-events-none">
              <div className="flex items-center gap-4 p-4 rounded-xl border border-birgen-border bg-birgen-dark">
                <CreditCard className="w-8 h-8 text-birgen-muted shrink-0" />
                <div>
                  <p className="font-semibold text-birgen-silver">Card</p>
                  <p className="text-birgen-muted text-xs">Coming soon</p>
                </div>
              </div>
              <div className="flex items-center gap-4 p-4 rounded-xl border border-birgen-border bg-birgen-dark">
                <Landmark className="w-8 h-8 text-birgen-muted shrink-0" />
                <div>
                  <p className="font-semibold text-birgen-silver">Paybill / bank</p>
                  <p className="text-birgen-muted text-xs">Coming soon</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {step === 'phone' && (
          <section className="space-y-6 animate-slide-up">
            <div>
              <label htmlFor="mpesa-phone" className="block text-birgen-silver text-sm font-medium mb-2">
                M-PESA registered number
              </label>
              <div className="flex gap-2">
                <input
                  id="mpesa-phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07XX XXX XXX"
                  className="flex-1 rounded-lg bg-birgen-dark border border-birgen-border px-4 py-3 text-white placeholder:text-birgen-muted focus:outline-none focus:ring-2 focus:ring-birgen-red/60 focus:border-birgen-red"
                />
                <span
                  className="shrink-0 px-3 flex items-center rounded-lg border border-birgen-border bg-birgen-card text-xl"
                  title="Kenya"
                >
                  🇰🇪
                </span>
              </div>
              <p className="text-birgen-muted text-xs mt-2">
                We’ll send an STK prompt for <strong className="text-white">KSh {amount}</strong>.
              </p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setStep('method')}
                className="sm:flex-1 py-3 rounded-md border border-birgen-border text-birgen-silver font-semibold text-sm hover:bg-birgen-card transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!phone.trim()}
                onClick={() => setStkOpen(true)}
                className="sm:flex-[2] py-3 rounded-md bg-birgen-red hover:bg-birgen-red-light disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Pay KSh {amount} with M-PESA
              </button>
            </div>
          </section>
        )}

        <p className="text-center text-birgen-muted text-[11px] mt-14 leading-relaxed">
          *Subscriptions and cancellation policies will live in account settings soon. You are billed the amount shown via M-PESA.
        </p>
      </div>

      <STKPushModal
        isOpen={stkOpen}
        onClose={() => setStkOpen(false)}
        amount={amount}
        planName="BirgenAI Premium — monthly promo"
        planCredits={0}
        initialPhone={phone}
        onPaymentSuccess={onPaid}
      />
    </div>
  );
}
