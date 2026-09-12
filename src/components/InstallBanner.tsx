import { useState } from 'react';
import { Share2, X } from 'lucide-react';

const DISMISSED_KEY = 'marching-orders:install-banner-dismissed';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS reports installation through this non-standard flag rather than
    // display-mode.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Says plainly that installing is required for reliable offline access.
 *
 * This is not a growth nudge. iOS evicts stored data for sites that have not
 * been opened in about a week, and home-screen-installed apps are exempt —
 * so on the target platform, "Add to Home Screen" is what stands between a
 * saved boarding pass and an empty screen at the airport.
 */
export function InstallBanner() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === '1',
  );

  if (dismissed || isStandalone()) return null;

  return (
    <div className="mb-4 rounded-2xl border border-border bg-surface-2 p-3 text-sm">
      <div className="flex items-start gap-2">
        <Share2 className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        <p className="flex-1">
          <span className="font-medium">Add this to your home screen.</span>{' '}
          {isIos()
            ? 'Tap Share, then “Add to Home Screen”. iOS can clear saved documents from a browser tab after about a week — installed apps keep theirs.'
            : 'Installing it keeps your downloaded documents from being cleared by the browser.'}
        </p>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            localStorage.setItem(DISMISSED_KEY, '1');
            setDismissed(true);
          }}
          className="-m-1 flex size-8 items-center justify-center rounded-lg text-muted hover:bg-border"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
