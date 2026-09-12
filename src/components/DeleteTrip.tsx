import { useState } from 'react';
import { Trash } from 'lucide-react';
import { useAppState, useServices } from '../hooks/useServices';
import { Button } from './ui';
import type { TripRecord } from '../lib/store/tripStore';

/**
 * Removes a trip, with the choice that actually matters made explicit.
 *
 * "From this device" and "from Drive as well" are different acts with
 * different consequences, and a single Delete button would have to silently
 * pick one. Drive's copy is trashed rather than destroyed, so even the heavier
 * option stays recoverable for thirty days.
 */
export function DeleteTrip({ trip }: { trip: TripRecord }) {
  const { app } = useServices();
  const state = useAppState();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(fromDrive: boolean) {
    setBusy(true);
    setError(null);
    try {
      await app.deleteTrip(trip.folderId, { fromDrive });
      setConfirming(false);
    } catch (cause) {
      // The trip is gone locally either way, so say precisely what did not
      // happen rather than implying nothing did.
      setError(
        cause instanceof Error
          ? `Removed here, but Drive could not be reached: ${cause.message}`
          : 'Removed here, but the Drive folder could not be trashed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Delete ${trip.name}`}
        onClick={() => setConfirming(true)}
        className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger"
      >
        <Trash className="size-4" aria-hidden />
      </button>

      {confirming ? (
        // Modal rather than inline: a destructive choice should own the screen
        // rather than compete with the row it belongs to.
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Delete ${trip.name}`}
          onClick={() => {
            if (!busy) setConfirming(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-4 shadow-lg"
            // Clicks on the dialog itself must not reach the dismissing
            // backdrop behind it.
            onClick={(event) => event.stopPropagation()}
          >
            <p className="font-medium">Delete “{trip.name}”?</p>
            <p className="mt-1 text-sm text-muted">
              Trashing the Drive folder removes its documents for anyone you
              shared it with. It stays in Drive’s trash for 30 days, so it can be
              undone.
            </p>

            {error ? (
              <p className="mt-2 text-sm text-warning" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-2">
              <Button
                variant="danger"
                onClick={() => void remove(true)}
                disabled={busy || !state.online}
              >
                {busy ? 'Deleting…' : 'Delete and trash in Drive'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => void remove(false)}
                disabled={busy}
              >
                Remove from this device only
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>

            {!state.online ? (
              <p className="mt-2 text-sm text-muted">
                Trashing the Drive folder needs a connection.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
