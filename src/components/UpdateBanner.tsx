import { ArrowDownToLine, RefreshCw } from 'lucide-react';
import { useAppUpdate } from '../hooks/useAppUpdate';

/**
 * Offers a newer build, and a way to go looking for one.
 *
 * The check exists because an installed app can sit on a home screen for weeks
 * without the browser bothering to look. The update itself costs almost
 * nothing: assets are content-hashed, so only the files that actually changed
 * are fetched and everything else stays cached.
 */
export function UpdateBanner() {
  const update = useAppUpdate();

  if (!update.ready) return null;

  return (
    <div className="mb-3 flex items-center gap-2 rounded-xl border border-accent/40 bg-surface-2 px-3 py-2 text-sm">
      <ArrowDownToLine className="size-4 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1">A newer version is ready.</span>
      <button
        type="button"
        onClick={update.apply}
        className="min-h-9 shrink-0 rounded-lg bg-accent px-3 text-sm font-medium text-accent-contrast"
      >
        Reload
      </button>
    </div>
  );
}

/** The manual "look now" control, for a home-screen app the browser forgot. */
export function CheckForUpdates() {
  const update = useAppUpdate();

  return (
    <button
      type="button"
      onClick={() => void update.check()}
      disabled={update.checking}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 disabled:opacity-50"
    >
      <RefreshCw className="size-3.5" aria-hidden />
      {update.checking ? 'Checking…' : update.ready ? 'Update ready' : 'Check for updates'}
    </button>
  );
}
