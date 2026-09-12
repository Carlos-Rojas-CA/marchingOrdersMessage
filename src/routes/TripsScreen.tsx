import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Luggage, Plus, WifiOff } from 'lucide-react';
import { useAppState, useServices } from '../hooks/useServices';
import { isConfigured } from '../config';
import { Button, Card, EmptyState } from '../components/ui';
import { InstallBanner } from '../components/InstallBanner';
import { AccountBar } from '../components/AccountBar';
import { DeleteTrip } from '../components/DeleteTrip';
import { SyncBanner } from '../components/SyncBanner';
import { CheckForUpdates, UpdateBanner } from '../components/UpdateBanner';

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

    // Only confirm with Drive when a token is already held. Google's token
    // client opens a window for any request, so asking here would greet every
    // page load with a consent popup.
    if (auth.hasValidToken()) void app.reconcileAccount();
  }, [app, auth]);

  async function createTrip() {
    if (!name.trim()) return;
    setError(null);
    try {
      // A click, so this is allowed to prompt if there is no token yet.
      await auth.signIn();
      const folderId = await sync.createTrip(name.trim(), { startDate, endDate });
      await app.reconcileAccount();
      await app.loadTrips();
      // Flights before the route: the route is dated from when you land, and
      // an overnight flight means that is not the day you set off.
      navigate(`/trip/${folderId}/item/new?type=flight&outbound=1`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the trip.');
    }
  }

  return (
    <div className="mx-auto min-h-full max-w-2xl px-3 pb-10 sm:border-x sm:border-border">
      <header className="pad-safe-top flex items-center justify-between gap-2 py-5">
        <h1 className="text-3xl font-bold tracking-tight">Trips</h1>
        {!state.online ? (
          <span className="flex items-center gap-1 text-xs text-muted" role="status">
            <WifiOff className="size-3.5" aria-hidden />
            Offline
          </span>
        ) : null}
      </header>

      <UpdateBanner />
      <InstallBanner />
      <AccountBar />
      <SyncBanner />

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
          <li key={trip.folderId} className="flex items-center gap-2">
            <Link
              to={`/trip/${trip.folderId}`}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-border bg-surface p-4 hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-semibold">{trip.name}</span>
                <span className="block text-sm text-muted">
                  {trip.canEdit ? 'Editable' : 'View only'}
                  {trip.offlineEnabled ? ' · Saved offline' : ''}
                </span>
              </span>
              {trip.offlineEnabled ? (
                <Check className="size-4 shrink-0 text-ok" aria-label="Saved offline" />
              ) : null}
            </Link>
            <DeleteTrip trip={trip} />
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
                  className="min-h-11 w-full min-w-0 rounded-xl border border-border bg-bg px-3 outline-none focus:border-accent"
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
                  className="min-h-11 w-full min-w-0 rounded-xl border border-border bg-bg px-3 outline-none focus:border-accent"
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

      <div className="mt-8 flex justify-center">
        <CheckForUpdates />
      </div>
    </div>
  );
}
