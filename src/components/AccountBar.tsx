import { useState } from 'react';
import { LogIn, UserRound } from 'lucide-react';
import { useAppState, useServices } from '../hooks/useServices';
import { Button, Card } from './ui';

/**
 * Who is signed in, and how to stop being them.
 *
 * Both actions clear local data, because trips belong to one account's Drive
 * and are unreadable to another. The UI says so before doing it rather than
 * quietly deleting downloaded documents.
 */
export function AccountBar() {
  const { app, auth } = useServices();
  const state = useAppState();
  const [confirming, setConfirming] = useState<'out' | 'switch' | null>(null);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      auth.signOut();
      await app.signOut();
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  async function switchAccount() {
    setBusy(true);
    try {
      auth.switchAccount();
      await app.signOut();
      // Forces Google's chooser, then re-keys local data to whoever is picked.
      await app.reconcileAccount();
    } catch {
      // A dismissed chooser leaves the app signed out, which is a coherent
      // place to be — nothing to recover from.
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  if (confirming) {
    const switching = confirming === 'switch';
    return (
      <Card className="mb-4">
        <p className="font-medium">
          {switching ? 'Switch to another account?' : 'Sign out?'}
        </p>
        <p className="mt-1 text-sm text-muted">
          Trips and downloaded documents on this device will be removed. They
          stay in Google Drive and come back when you sign in again.
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            onClick={() => void (switching ? switchAccount() : signOut())}
            disabled={busy}
          >
            {busy ? 'Working…' : switching ? 'Switch account' : 'Sign out'}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(null)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  if (!state.account) {
    return (
      <Card className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted">
            Not signed in. Creating a trip will sign you in to Google Drive.
          </p>
          <Button
            variant="ghost"
            onClick={() => void app.reconcileAccount()}
            disabled={!state.online}
          >
            <LogIn className="size-4" aria-hidden />
            Sign in
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="mb-4 flex items-center gap-2 px-1">
      <UserRound className="size-4 shrink-0 text-muted" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm text-muted">{state.account}</span>
      <button
        type="button"
        onClick={() => setConfirming('switch')}
        className="min-h-9 rounded-lg px-2 text-sm text-muted hover:bg-surface-2"
      >
        Switch
      </button>
      <button
        type="button"
        onClick={() => setConfirming('out')}
        className="min-h-9 rounded-lg px-2 text-sm text-muted hover:bg-surface-2"
      >
        Sign out
      </button>
    </div>
  );
}
