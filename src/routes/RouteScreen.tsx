import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Minus, Plus, X } from 'lucide-react';
import { useAppState, useServices } from '../hooks/useServices';
import { useLoadedTrip } from '../hooks/useLoadedTrip';
import { arrivalDate, planRoute, type RouteStop } from '../lib/model/route';
import { zonedIso, type Place } from '../lib/model/timezones';
import { formatDayLabel } from '../lib/model/format';
import { Button, Card } from '../components/ui';
import { PlaceField } from '../components/fields';

interface Stop extends RouteStop {
  key: string;
  country?: string;
}

/**
 * Sketches the shape of a trip as places and nights.
 *
 * Nights are the input and dates are derived, so lengthening one stop shifts
 * every later one — the arithmetic people get wrong on paper and retype a whole
 * itinerary to fix.
 *
 * What it writes is ordinary stays. The route is a sketching aid, not a second
 * source of truth that could drift from the trip.
 */
export function RouteScreen() {
  const { folderId = '' } = useParams();
  const navigate = useNavigate();
  const { app, sync } = useServices();
  const state = useAppState();

  const [stops, setStops] = useState<Stop[]>([]);
  /** Empty until the trip loads, then seeded from where the flight lands. */
  const [startOverride, setStartOverride] = useState('');
  const [adding, setAdding] = useState<Place | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLoadedTrip(folderId);

  const doc = state.current?.doc;
  // Where the route begins is where you land, not where you take off — but a
  // flight may not be entered yet, or may be wrong, so it stays editable.
  const derivedStart = doc ? arrivalDate(doc) : '';
  const start = startOverride || derivedStart;
  const planned = useMemo(
    () => (start ? planRoute(start, stops) : []),
    [start, stops],
  );

  const lastNight = planned.at(-1)?.depart;
  const totalNights = stops.reduce((n, s) => n + s.nights, 0);

  function addStop(place: Place) {
    setStops((current) => [
      ...current,
      {
        key: `${place.timeZone}-${Date.now()}`,
        place: place.name,
        country: place.country,
        timeZone: place.timeZone,
        // One night, not an assumed three: a guess that is too long quietly
        // pushes every later stop out of the trip.
        nights: 1,
      },
    ]);
    setAdding(null);
  }

  /**
   * Pins a stop to a date rather than letting it follow the one before.
   *
   * How a half-planned trip gets recorded: when the middle of a route is
   * undecided, the places either side of the hole are still known, and a
   * strict chain would force a length to be invented for the gap.
   */
  function pinArrival(key: string, arrive: string) {
    setStops((current) => current.map((s) => (s.key === key ? { ...s, arrive } : s)));
  }

  function setNights(key: string, nights: number) {
    setStops((current) =>
      current.map((s) => (s.key === key ? { ...s, nights: Math.max(1, nights) } : s)),
    );
  }

  /**
   * Writes one stay per stop, as a placeholder to replace with the real
   * booking. Named for the city rather than a hotel nobody has chosen yet.
   */
  async function save() {
    setSaving(true);
    setError(null);
    try {
      for (const stop of planned) {
        const zone = stop.timeZone ?? 'UTC';
        // zonedIso directly rather than timestampFrom: both the day and the
        // hour are known here, so there is no date that could be dropped.
        await sync.addItem(folderId, {
          type: 'lodging',
          title: `Stay in ${stop.place}`,
          startsAt: zonedIso(stop.arrive, '15:00', zone),
          endsAt: zonedIso(stop.depart, '11:00', zone),
          location: {
            name: `Stay in ${stop.place}`,
            city: stop.place,
            timeZone: zone,
          },
          notes: 'Placeholder from the route sketch — replace with the booking.',
        });
      }
      await app.openTrip(folderId);
      navigate(`/trip/${folderId}/legs`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the route.');
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
        <h1 className="flex-1 truncate font-semibold">Route</h1>
        <button
          type="button"
          onClick={() => navigate(`/trip/${folderId}/legs`)}
          className="min-h-10 rounded-lg px-2 text-sm text-muted hover:bg-surface-2"
        >
          Skip
        </button>
      </header>

      <main className="pad-safe-end pad-safe-x flex flex-1 flex-col gap-3 py-3">
        <p className="text-sm text-muted">
          Where are you going, and for how long? The dates are worked out for you.
        </p>

        <div className="flex flex-col gap-1">
          <label htmlFor="route-start" className="text-xs text-muted">
            First night
          </label>
          <input
            id="route-start"
            type="date"
            value={start}
            onChange={(event) => setStartOverride(event.target.value)}
            className="min-h-11 w-full min-w-0 rounded-xl border border-border bg-bg px-3 outline-none focus:border-accent"
          />
          {!startOverride && derivedStart && doc?.startDate &&
          derivedStart !== doc.startDate ? (
            <p className="text-xs text-ok">
              The day your flight lands. Change it if that is not right.
            </p>
          ) : null}
        </div>

        {!start ? (
          <Card className="border-warning/40">
            <p className="text-sm">
              This trip has no start date yet, so nights cannot be turned into
              dates. Add one first.
            </p>
          </Card>
        ) : null}

        <ul className="flex flex-col gap-2">
          {planned.map((stop, index) => (
            <li key={stops[index]!.key}>
              <Card className="flex flex-row items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {stop.place}
                    {stop.country ? (
                      <span className="font-normal text-muted"> · {stop.country}</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted">
                    {stop.nights} {stop.nights === 1 ? 'night' : 'nights'} · until{' '}
                    {formatDayLabel(stop.depart)}
                  </p>
                  <label className="sr-only" htmlFor={`arrive-${stops[index]!.key}`}>
                    Arrive in {stop.place}
                  </label>
                  <input
                    id={`arrive-${stops[index]!.key}`}
                    type="date"
                    value={stop.arrive}
                    onChange={(event) => pinArrival(stops[index]!.key, event.target.value)}
                    className="mt-1 min-h-9 w-full min-w-0 rounded-lg border border-border bg-bg px-2 text-sm outline-none focus:border-accent"
                  />
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`One night fewer in ${stop.place}`}
                    onClick={() => setNights(stops[index]!.key, stop.nights - 1)}
                    className="flex size-9 items-center justify-center rounded-lg bg-surface-2 hover:bg-border"
                  >
                    <Minus className="size-4" aria-hidden />
                  </button>
                  <span className="w-6 text-center tabular-nums">{stop.nights}</span>
                  <button
                    type="button"
                    aria-label={`One night more in ${stop.place}`}
                    onClick={() => setNights(stops[index]!.key, stop.nights + 1)}
                    className="flex size-9 items-center justify-center rounded-lg bg-surface-2 hover:bg-border"
                  >
                    <Plus className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${stop.place}`}
                    onClick={() =>
                      setStops((c) => c.filter((s) => s.key !== stops[index]!.key))
                    }
                    className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>

        <PlaceField label="Add a place" value={adding} onChange={(p) => p && addStop(p)} />

        {stops.some((s) => s.arrive) ? (
          <p className="text-sm text-muted">
            A place with its own date stays put; the ones after it follow on.
            That is how to record a trip whose middle is still undecided.
          </p>
        ) : null}

        {lastNight && doc?.endDate ? (
          <p
            className={
              lastNight > doc.endDate
                ? 'text-sm text-warning'
                : lastNight < doc.endDate
                  ? 'text-sm text-muted'
                  : 'text-sm text-ok'
            }
          >
            {lastNight > doc.endDate
              ? `That is ${totalNights} nights, running past ${formatDayLabel(doc.endDate)}.`
              : lastNight < doc.endDate
                ? `${totalNights} nights placed. ${formatDayLabel(lastNight)} – ${formatDayLabel(doc.endDate)} is still unplaced.`
                : `✓ ${totalNights} nights placed, ending exactly on ${formatDayLabel(doc.endDate)}.`}
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-auto flex gap-2">
          <Button
            onClick={() => void save()}
            disabled={saving || stops.length === 0 || !state.online}
          >
            {saving ? 'Saving…' : 'Continue'}
          </Button>
        </div>
      </main>
    </div>
  );
}
