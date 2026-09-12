import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAppState, useServices } from '../hooks/useServices';
import { Button } from '../components/ui';

const EXAMPLE = `{
  "schemaVersion": 1,
  "tripId": "japan-2026",
  "name": "Japan 2026",
  "items": [
    {
      "id": "flight-out",
      "type": "flight",
      "title": "AA123 SFO → NRT",
      "startsAt": "2026-09-12T08:15:00-07:00",
      "endsAt": "2026-09-13T13:40:00+09:00",
      "confirmationNumber": "QX7R2M"
    },
    {
      "id": "hotel",
      "type": "lodging",
      "title": "Park Hyatt Tokyo",
      "startsAt": "2026-09-13T15:00:00+09:00",
      "endsAt": "2026-09-16T11:00:00+09:00",
      "location": { "name": "Park Hyatt Tokyo", "address": "Nishishinjuku, Tokyo" }
    }
  ]
}`;

/**
 * Pastes a whole itinerary in at once.
 *
 * This is the migration path off a Google Doc, and the fastest way to get a
 * real trip onto a phone before per-item editing exists. It validates before
 * writing anything, so a bad paste cannot damage a trip that is already there.
 */
export function ImportScreen() {
  const { folderId = '' } = useParams();
  const navigate = useNavigate();
  const { sync, app } = useServices();
  const state = useAppState();

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Distinguishing "not JSON" from "not an itinerary" saves a lot of
        // squinting at a wall of text.
        throw new Error('That is not valid JSON. Check for a trailing comma or a missing brace.');
      }

      await sync.replaceItinerary(folderId, parsed);
      await app.openTrip(folderId);
      navigate(`/trip/${folderId}/timeline`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'That itinerary could not be read.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col sm:border-x sm:border-border">
      <header className="pad-safe-top sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-bg/90 px-3 py-2 backdrop-blur">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <h1 className="flex-1 truncate font-semibold">Paste an itinerary</h1>
      </header>

      <main className="flex flex-1 flex-col gap-3 p-3">
        <p className="text-sm text-muted">
          Paste the trip as JSON. It replaces whatever this trip currently holds,
          and is checked before anything is written.
        </p>

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          aria-label="Itinerary JSON"
          placeholder={EXAMPLE}
          className="min-h-72 flex-1 rounded-xl border border-border bg-surface p-3 font-mono text-xs outline-none focus:border-accent"
        />

        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button onClick={() => void save()} disabled={!text.trim() || saving || !state.online}>
            {saving ? 'Saving…' : 'Save to Drive'}
          </Button>
          <Button variant="ghost" onClick={() => setText(EXAMPLE)}>
            Use the example
          </Button>
        </div>

        {!state.online ? (
          <p className="text-sm text-muted">Saving an itinerary needs a connection.</p>
        ) : null}
      </main>
    </div>
  );
}
