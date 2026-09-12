import { useId, useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { useAppState, useServices } from '../hooks/useServices';

/**
 * Adds a document to an item, or to the trip when `itemId` is null.
 *
 * The kind is inferred from the item it lands on, so a boarding pass files
 * itself under Boarding passes without anyone choosing that.
 */
export function AttachDocument({
  folderId,
  itemId,
  label = 'Add document',
}: {
  folderId: string;
  itemId: string | null;
  label?: string;
}) {
  const { sync, app } = useServices();
  const state = useAppState();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.current && !state.current.trip.canEdit) return null;

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      await sync.attachDocument(folderId, itemId, file);
      await app.openTrip(folderId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not attach that file.');
    } finally {
      setBusy(false);
      // Clear the input so picking the same file twice still fires a change.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="application/pdf,image/*"
        className="sr-only"
        onChange={(event) => void onPick(event.target.files?.[0])}
      />
      <label
        htmlFor={inputId}
        aria-disabled={busy || !state.online}
        className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 text-sm text-muted hover:bg-surface-2 aria-disabled:pointer-events-none aria-disabled:opacity-50"
      >
        <Paperclip className="size-3.5 shrink-0" aria-hidden />
        {busy ? 'Uploading…' : label}
      </label>
      {error ? (
        <span className="text-sm text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
