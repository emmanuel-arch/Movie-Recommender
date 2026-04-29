'use client';

/**
 * After session + profile load, sends users without otp_verified_at to /auth/otp.
 * OAuth cookies must be set correctly on /auth/callback — otherwise middleware
 * treats the user as logged out.
 */

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { isOtpExemptPath } from '@/lib/otpPaths';

export default function OtpGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading, accountReady } = useAuth();

  useEffect(() => {
    if (loading || !accountReady) return;
    if (!user || !profile) return;
    if (isOtpExemptPath(pathname)) return;
    if (profile.otp_verified_at != null) return;

    router.replace('/auth/otp');
  }, [loading, accountReady, user, profile, pathname, router]);

  return <>{children}</>;
}
