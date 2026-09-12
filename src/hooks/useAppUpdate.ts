import { useCallback, useEffect, useState } from 'react';

/**
 * Watches for a newer build and applies it when asked.
 *
 * A service worker fetches the new version in the background and then waits.
 * Activating on its own would swap the assets underneath a page that is
 * already running — a lazily-loaded screen would suddenly ask for a chunk that
 * no longer exists — so the new worker sits until someone accepts it.
 *
 * Nothing is re-downloaded on an update beyond the files that actually
 * changed: every asset is content-hashed, so unchanged ones keep their name
 * and stay cached.
 */
export interface AppUpdate {
  /** A newer build is downloaded and waiting. */
  ready: boolean;
  /** Currently asking the server whether one exists. */
  checking: boolean;
  /** Ask now, rather than waiting for the browser's own schedule. */
  check: () => Promise<void>;
  /** Swap to the new build and reload. */
  apply: () => void;
}

export function useAppUpdate(): AppUpdate {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;

    function watch(registration: ServiceWorkerRegistration) {
      if (registration.waiting) {
        setWaiting(registration.waiting);
        setReady(true);
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // A worker that installs with no controller is the first one ever;
          // that is not an update, it is the app arriving.
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            if (cancelled) return;
            setWaiting(installing);
            setReady(true);
          }
        });
      });
    }

    void navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration && !cancelled) watch(registration);
    });

    // The browser checks for a new worker on its own schedule; this catches the
    // case where one arrived while the app was open.
    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const check = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return;
    setChecking(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    } catch {
      // Offline, or the server is unreachable. Nothing to report: the app is
      // entirely usable on the version already installed.
    } finally {
      setChecking(false);
    }
  }, []);

  const apply = useCallback(() => {
    if (!waiting) {
      window.location.reload();
      return;
    }
    // controllerchange fires once the new worker takes over, and reloads.
    waiting.postMessage('apply-update');
  }, [waiting]);

  return { ready, checking, check, apply };
}
