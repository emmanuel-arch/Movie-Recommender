'use client';

/**
 * Retired post-login OTP gate.
 *
 * Movies now authenticates through NextAuth (shared with birgenai.com), where
 * accounts are email-verified at registration — there's no separate in-app OTP
 * step. This component is kept as a transparent passthrough so the layout tree
 * and imports stay stable; it no longer redirects anywhere.
 */
export default function OtpGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
