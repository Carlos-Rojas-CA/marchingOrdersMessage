import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAppState, useServices } from '../hooks/useServices';
import { useLoadedTrip } from '../hooks/useLoadedTrip';
import { ITEM_TYPES, type ItemType } from '../lib/model/itinerary';
import { legsFromStays } from '../lib/model/route';
import { resolveTimeZone, zonedIso, type Place } from '../lib/model/timezones';
import { searchPlaces } from '../lib/model/timezones';
import { Button, ItemIcon } from '../components/ui';
import {
  DateTimeField,
  PlaceField,
  TextAreaField,
  TextField,
} from '../components/fields';

const TYPE_LABELS: Record<ItemType, string> = {
  flight: 'Flight',
  train: 'Train',
  ferry: 'Ferry',
  bus: 'Bus',
  lodging: 'Stay',
  activity: 'Activity',
  poi: 'Place',
  note: 'Note',
  document: 'Document',
};

/** Types that go from one place to another, and so carry two zones. */
const JOURNEYS: ItemType[] = ['flight', 'train', 'ferry', 'bus'];

const LAST_PLACE_KEY = 'marching-orders:last-place';

function rememberPlace(place: Place) {
  localStorage.setItem(LAST_PLACE_KEY, JSON.stringify(place));
}

function lastPlace(): Place | null {
  try {
    const raw = localStorage.getItem(LAST_PLACE_KEY);
    return raw ? (JSON.parse(raw) as Place) : null;
  } catch {
    return null;
  }
}

/**
 * Adds or edits one item.
 *
 * The fields shown follow the type: a journey asks where it leaves from and
 * arrives at, a stay asks for check-in and check-out plus the details you need
 * on the doorstep, and everything else asks for a time and a place.
 */
export function ItemFormScreen() {
  const { folderId = '', itemId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { app, sync } = useServices();
  const state = useAppState();

  const type = (params.get('type') ?? 'activity') as ItemType;
  const isJourney = JOURNEYS.includes(type);
  const isStay = type === 'lodging';
  /** Part of first-run setup, where a rough flight is worth more than none. */
  const isOutbound = params.get('outbound') === '1';

  const doc = state.current?.doc;
  const existing = itemId ? doc?.items.find((i) => i.id === itemId) : undefined;
  const legs = useMemo(() => (doc ? legsFromStays(doc) : []), [doc]);

  const [title, setTitle] = useState('');
  const [fromPlace, setFromPlace] = useState<Place | null>(null);
  const [toPlace, setToPlace] = useState<Place | null>(null);
  const [startDate, setStartDate] = useState(params.get('date') ?? '');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLoadedTrip(folderId);

  // Load an existing item once the trip is in hand.
  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setStartDate(existing.startsAt?.slice(0, 10) ?? '');
    setStartTime(existing.startsAt?.slice(11, 16) ?? '');
    setEndDate(existing.endsAt?.slice(0, 10) ?? '');
    setEndTime(existing.endsAt?.slice(11, 16) ?? '');
    setAddress(existing.location?.address ?? '');
    setPhone(existing.location?.phone ?? '');
    setConfirmation(existing.confirmationNumber ?? '');
    setNotes(existing.notes ?? '');
    if (existing.location?.city) {
      const [match] = searchPlaces(existing.location.city, 1);
      if (match) setToPlace(match);
    }
  }, [existing]);

  /**
   * The zone a name typed into a place field would inherit — where the trip
   * already says you are on this date, or the last place you used.
   */
  const contextZone = resolveTimeZone({
    legs,
    date: startDate,
    lastUsed: lastPlace()?.timeZone,
  });
  const contextLabel =
    legs.find((l) => startDate >= l.arrive && startDate <= l.depart)?.place ??
    lastPlace()?.name;

  /** The zone each end of the item resolves to, following the agreed order. */
  const startZone = resolveTimeZone({
    explicit: (isJourney ? fromPlace : toPlace)?.timeZone,
    address: isStay ? address : undefined,
    legs,
    date: startDate,
    lastUsed: lastPlace()?.timeZone,
  });
  const endZone = resolveTimeZone({
    explicit: toPlace?.timeZone,
    address: isStay ? address : undefined,
    legs,
    date: endDate || startDate,
    lastUsed: lastPlace()?.timeZone,
  });

  async function save() {
    setError(null);
    setSaving(true);
    try {
      // Where the item *ends up* is what locates it: a flight belongs to its
      // destination, and everything else has only the one place.
      const place = toPlace;
      const location =
        place || address || phone
          ? {
              name: place?.name ?? (title || 'Location'),
              ...(address ? { address } : {}),
              ...(phone ? { phone } : {}),
              ...(place ? { city: place.name, timeZone: place.timeZone } : {}),
            }
          : undefined;

      const patch = {
        type,
        title: title.trim() || TYPE_LABELS[type],
        ...(startDate && startTime
          ? { startsAt: zonedIso(startDate, startTime, startZone) }
          : {}),
        ...(endDate && endTime ? { endsAt: zonedIso(endDate, endTime, endZone) } : {}),
        ...(confirmation ? { confirmationNumber: confirmation } : {}),
        ...(notes ? { notes } : {}),
        ...(location ? { location } : {}),
      };

      if (itemId) await sync.updateItem(folderId, itemId, patch);
      else await sync.addItem(folderId, patch);

      if (place) rememberPlace(place);
      await app.openTrip(folderId);
      // Setup continues into the route, which is now dated from this arrival.
      if (isOutbound) navigate(`/trip/${folderId}/route`);
      else navigate(-1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!itemId) return;
    setSaving(true);
    try {
      await sync.removeItem(folderId, itemId);
      await app.openTrip(folderId);
      navigate(`/trip/${folderId}/timeline`);
    } finally {
      setSaving(false);
    }
  }

  const heading = `${itemId ? 'Edit' : 'Add'} ${TYPE_LABELS[type].toLowerCase()}`;

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col">
      <header className="pad-safe-top sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-bg/90 px-3 py-2 backdrop-blur">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <ItemIcon type={type} className="text-muted" />
        <h1 className="flex-1 truncate font-semibold">
          {isOutbound ? 'Flight out' : heading}
        </h1>
        {isOutbound ? (
          <button
            type="button"
            onClick={() => navigate(`/trip/${folderId}/route`)}
            className="min-h-10 rounded-lg px-2 text-sm text-muted hover:bg-surface-2"
          >
            Skip
          </button>
        ) : null}
      </header>

      <main className="flex flex-1 flex-col gap-4 p-3">
        {isOutbound ? (
          <p className="text-sm text-muted">
            Rough is fine — where you are flying to and roughly when you land is
            enough to lay out the trip. Come back and add the flight number and
            confirmation once you have booked.
          </p>
        ) : null}
        <TextField
          label={isStay ? 'Hotel or rental name' : isJourney ? 'Flight or service number' : 'What is it?'}
          value={title}
          onChange={setTitle}
          autoFocus={!itemId}
          placeholder={
            isStay ? 'Hotel Artemide' : isJourney ? 'UA 123' : 'Colosseum'
          }
        />

        {isJourney ? (
          <>
            <PlaceField
              label="Departs from"
              value={fromPlace}
              onChange={setFromPlace}
              fallbackZone={contextZone}
              fallbackLabel={contextLabel}
            />
            <DateTimeField
              label="Departure"
              date={startDate}
              time={startTime}
              timeZone={startZone}
              onDateChange={setStartDate}
              onTimeChange={setStartTime}
            />
            <PlaceField
              label="Arrives at"
              value={toPlace}
              onChange={setToPlace}
              fallbackZone={contextZone}
              fallbackLabel={contextLabel}
            />
            <DateTimeField
              label="Arrival"
              date={endDate}
              time={endTime}
              timeZone={endZone}
              onDateChange={setEndDate}
              onTimeChange={setEndTime}
            />
          </>
        ) : (
          <>
            <PlaceField
              label={isStay ? 'City' : 'Where'}
              value={toPlace}
              onChange={setToPlace}
              fallbackZone={contextZone}
              fallbackLabel={contextLabel}
            />
            <DateTimeField
              label={isStay ? 'Check in' : 'Starts'}
              date={startDate}
              time={startTime}
              timeZone={startZone}
              onDateChange={setStartDate}
              onTimeChange={setStartTime}
            />
            <DateTimeField
              label={isStay ? 'Check out' : 'Ends (optional)'}
              date={endDate}
              time={endTime}
              timeZone={endZone}
              onDateChange={setEndDate}
              onTimeChange={setEndTime}
            />
          </>
        )}

        {isStay ? (
          <>
            <TextField label="Address" value={address} onChange={setAddress} />
            <TextField label="Phone" value={phone} onChange={setPhone} type="tel" />
          </>
        ) : null}

        <TextField
          label="Confirmation number (optional)"
          value={confirmation}
          onChange={setConfirmation}
        />
        <TextAreaField
          label="Notes (optional)"
          value={notes}
          onChange={setNotes}
          placeholder={
            isStay ? 'Check-in from 3:00 PM' : 'Opening hours, prices, reminders'
          }
        />

        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button onClick={() => void save()} disabled={saving || !state.online}>
            {saving ? 'Saving…' : isOutbound ? 'Save and continue' : 'Save'}
          </Button>
          {itemId ? (
            <Button variant="danger" onClick={() => void remove()} disabled={saving}>
              Delete
            </Button>
          ) : null}
        </div>

        {!state.online ? (
          <p className="text-sm text-muted">Editing a trip needs a connection.</p>
        ) : null}
      </main>
    </div>
  );
}

/** Offered when choosing what to add. */
export const ADDABLE_TYPES = ITEM_TYPES.filter((t) => t !== 'document');
export { TYPE_LABELS };
