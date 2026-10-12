'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { useTour } from './TourProvider';
import { getTour, tourAllowedForRole } from '@/lib/tours';

const dismissedKey = (userId: number) => `kgmis_tour_intro_dismissed_${userId}`;

/**
 * First-time prompt: a small bottom-left card offered once per user.
 * "Start tour" launches the intro tour; "Not now" dismisses permanently
 * (replayable any time from the Take a Tour page).
 */
export function FirstRunPrompt() {
  const { user } = useAuth();
  const tourCtx = useTour();
  // Assume dismissed until proven otherwise — mirrors GlobalAiLauncher's
  // "assume seen" pattern so no flash renders for returning users.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!user) return;
    try {
      const seen = localStorage.getItem(dismissedKey(user.userId)) === '1';
      const intro = getTour('intro');
      const eligible = Boolean(intro && tourAllowedForRole(intro, user.role));
      setDismissed(seen || !eligible);
    } catch {
      setDismissed(true);
    }
  }, [user]);

  useEffect(() => {
    if (tourCtx?.isActive && !dismissed) setDismissed(true);
  }, [tourCtx?.isActive, dismissed]);

  if (!user || !tourCtx || dismissed || tourCtx.isActive) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(dismissedKey(user.userId), '1');
    } catch {
      /* noop */
    }
    setDismissed(true);
  };

  const start = () => {
    dismiss();
    tourCtx.start('intro');
  };

  return (
    <div className="tour-welcome" role="dialog" aria-label="Welcome tour offer">
      <button type="button" className="tour-welcome-close" aria-label="Dismiss" onClick={dismiss}>
        <Icon name="xmark" />
      </button>
      <div className="tour-welcome-icon">
        <Icon name="hand-sparkles" />
      </div>
      <div className="tour-welcome-body">
        <div className="tour-welcome-title">New here?</div>
        <div className="tour-welcome-text">Take a 60-second tour of KG-MIS — you can replay it any time.</div>
        <div className="tour-welcome-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={start}>
            Start tour
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
