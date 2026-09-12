import { useState } from 'react';
import { CloudOff } from 'lucide-react';
import { useAppState, useServices } from '../hooks/useServices';

/**
 * Offers to reconnect when the hour Google grants has run out.
 *
 * Google gives browsers an access token good for about an hour and no refresh
 * token; getting one of those needs a client secret, which needs a server this
 * app deliberately does not have. So a session genuinely does end, and the
 * honest thing is to say so in one place with one tap to fix it — rather than
 * ambushing someone with a consent window they did not ask for.
 *
 * Nothing here blocks reading the trip. Everything on screen comes from local
 * storage; signing in again only resumes syncing and editing.
 */
export function SyncBanner({ folderId }: { folderId?: string }) {
  const { app, auth } = useServices();
  const state = useAppState();
  const [busy, setBusy] = useState(false);

  // Nothing to offer when offline, or when there is nothing to sync with.
  if (!state.online || auth.hasValidToken() || !state.account) return null;

  async function reconnect() {
    setBusy(true);
    try {
      await auth.signIn();
      await app.reconcileAccount();
      if (folderId) await app.refresh(folderId);
    } catch {
      // A dismissed sign-in leaves everything exactly as it was.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
      <CloudOff className="size-4 shrink-0 text-muted" aria-hidden />
      <span className="min-w-0 flex-1 text-muted">
        Not syncing — your Google session expired.
      </span>
      <button
        type="button"
        onClick={() => void reconnect()}
        disabled={busy}
        className="min-h-9 shrink-0 rounded-lg bg-accent px-3 text-sm font-medium text-accent-contrast disabled:opacity-50"
      >
        {busy ? 'Connecting…' : 'Reconnect'}
      </button>
    </div>
  );
}
