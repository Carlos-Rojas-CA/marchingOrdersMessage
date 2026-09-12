import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Luggage, Plus, WifiOff } from 'lucide-react';
import { useAppState, useServices } from '../hooks/useServices';
import { isConfigured } from '../config';
import { Button, Card, EmptyState } from '../components/ui';
import { InstallBanner } from '../components/InstallBanner';
import { AccountBar } from '../components/AccountBar';

/** The trip list, and the only place a new trip is created. */
export function TripsScreen() {
  const navigate = useNavigate();
  const { app, sync, auth } = useServices();
  const state = useAppState();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void app.loadTrips();
    // The account recorded locally renders immediately and costs nothing.
    void app.loadAccount();

    // Then try to reuse an existing Google session, silently. This shows
    // nothing if there is no session — only the interactive fallback could
    // produce a popup, and nothing on page load is allowed to reach it.
    void auth.primeSilently().then((signedIn) => {
      if (signedIn) return app.reconcileAccount();
    });
  }, [app, auth]);

  async function createTrip() {
    if (!name.trim()) return;
    setError(null);
    try {
      const folderId = await sync.createTrip(name.trim(), { startDate, endDate });
      await app.reconcileAccount();
      await app.loadTrips();
      // Straight into sketching the route: a brand new trip has nothing to
      // show on its day view, and this is the question that comes next.
      navigate(`/trip/${folderId}/route`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the trip.');
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-3 pb-10">
      <header className="pad-safe-top flex items-center justify-between gap-2 py-4">
        <h1 className="text-2xl font-semibold">Trips</h1>
        {!state.online ? (
          <span className="flex items-center gap-1 text-xs text-muted" role="status">
            <WifiOff className="size-3.5" aria-hidden />
            Offline
          </span>
        ) : null}
      </header>

      <InstallBanner />
      <AccountBar />

      {!isConfigured() ? (
        <Card className="mb-4 border-warning/40">
          <p className="font-medium">Google sign-in is not configured yet</p>
          <p className="mt-1 text-sm text-muted">
            Set <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> to an OAuth
            client id before building. Trips already downloaded still open offline.
          </p>
        </Card>
      ) : null}

      {state.trips.length === 0 && !creating ? (
        <EmptyState icon={Luggage} title="No trips yet">
          A trip is a Google Drive folder holding its documents. Create one and
          share that folder with whoever is travelling with you.
        </EmptyState>
      ) : null}

      <ul className="space-y-2">
        {state.trips.map((trip) => (
          <li key={trip.folderId}>
            <Link
              to={`/trip/${trip.folderId}`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{trip.name}</span>
                <span className="block text-sm text-muted">
                  {trip.canEdit ? 'Editable' : 'View only'}
                  {trip.offlineEnabled ? ' · Saved offline' : ''}
                </span>
              </span>
              {trip.offlineEnabled ? (
                <Check className="size-4 shrink-0 text-ok" aria-label="Saved offline" />
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        {creating ? (
          <Card>
            <label className="block text-sm font-medium" htmlFor="trip-name">
              Trip name
            </label>
            <input
              id="trip-name"
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void createTrip();
              }}
              placeholder="Japan 2026"
              className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2.5 outline-none focus:border-accent"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="trip-start" className="text-xs text-muted">
                  First day
                </label>
                <input
                  id="trip-start"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="min-h-11 rounded-xl border border-border bg-bg px-3 outline-none focus:border-accent"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="trip-end" className="text-xs text-muted">
                  Last day
                </label>
                <input
                  id="trip-end"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="min-h-11 rounded-xl border border-border bg-bg px-3 outline-none focus:border-accent"
                />
              </div>
            </div>
            <p className="mt-2 text-sm text-muted">
              This creates a Drive folder of the same name and puts the itinerary
              inside it.
            </p>
            {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
            <div className="mt-3 flex gap-2">
              <Button onClick={() => void createTrip()} disabled={!name.trim() || !state.online}>
                Create trip
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
            {!state.online ? (
              <p className="mt-2 text-sm text-muted">
                Creating a trip needs a connection.
              </p>
            ) : null}
          </Card>
        ) : (
          <Button onClick={() => setCreating(true)} className="w-full">
            <Plus className="size-4" aria-hidden />
            New trip
          </Button>
        )}
      </div>
    </div>
  );
}
