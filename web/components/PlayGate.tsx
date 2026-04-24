'use client';
/**
 * PlayGate — wrapper around a play action that may require authentication.
 *
 * Usage:
 *   <PlayGate requireAuth onPlay={() => openPlayer()}>
 *     {(play) => <button onClick={play}>Play</button>}
 *   </PlayGate>
 *
 * If the user is signed in OR auth isn't required (e.g. trailer), onPlay is
 * invoked directly. Otherwise we show AuthModal first; the user can still
 * pick "Continue as guest" which calls `onPlay` too.
 */

import { useCallback, useState } from 'react';
import AuthModal from '@/components/AuthModal';
import { useAuth } from '@/components/AuthProvider';

interface PlayGateProps {
  /** If true and user is not signed-in, show AuthModal first. */
  requireAuth: boolean;
  /** Called once the user is authorised to play (signed-in OR guest). */
  onPlay: () => void;
  /** Render-prop for the trigger. */
  children: (trigger: () => void) => React.ReactNode;
  /** Modal copy overrides. */
  title?: string;
  subtitle?: string;
}

export default function PlayGate({
  requireAuth,
  onPlay,
  children,
  title,
  subtitle,
}: PlayGateProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const trigger = useCallback(() => {
    if (!requireAuth || user) {
      onPlay();
      return;
    }
    setOpen(true);
  }, [requireAuth, user, onPlay]);

  return (
    <>
      {children(trigger)}
      {open && (
        <AuthModal
          title={title}
          subtitle={subtitle}
          onClose={() => setOpen(false)}
          onContinueGuest={() => {
            setOpen(false);
            onPlay();
          }}
        />
      )}
    </>
  );
}
