import { useEffect } from 'react';

/**
 * Keeps the screen awake for as long as the calling component is mounted.
 *
 * A phone that sleeps while its owner is queuing at a gate forces them to wake
 * it, unlock it, and find the document again — exactly when they have least
 * attention to spare.
 *
 * The browser drops the lock whenever the page is hidden, so it is re-acquired
 * on visibility change. Browsers without the API simply do nothing.
 */
export function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    async function acquire() {
      if (released || document.visibilityState !== 'visible') return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        // Denied (low battery, policy). Not worth surfacing — the document is
        // on screen either way.
      }
    }

    void acquire();
    document.addEventListener('visibilitychange', acquire);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release().catch(() => {});
    };
  }, []);
}
