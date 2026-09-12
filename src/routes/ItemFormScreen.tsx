import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, FileText } from 'lucide-react';
import { useAppState, useServices } from '../hooks/useServices';
import { useLoadedTrip } from '../hooks/useLoadedTrip';
import { ITEM_TYPES, type ItemType } from '../lib/model/itinerary';
import { legsFromStays } from '../lib/model/route';
import { resolveTimeZone, timestampFrom, type Place } from '../lib/model/timezones';
import { isShortenedMapsUrl, parseMapsUrl } from '../lib/model/maps';
import { searchPlaces } from '../lib/model/timezones';
import { Button, ItemIcon } from '../components/ui';
import {
  DateTimeField,
  PlaceField,
  TextAreaField,
  TextField,
} from '../components/fields';
import { AttachDocument } from '../components/AttachDocument';

const TYPE_LABELS: Record<ItemType, string> = {
  flight: 'Flight',
  train: 'Train',
  ferry: 'Ferry',
  bus: 'Bus',
  car: 'Car or transfer',
  transit: 'Other travel',
  lodging: 'Stay',
  activity: 'Activity',
  poi: 'Place',
  note: 'Note',
  document: 'Document',
};

/**
 * What each kind of journey calls its own fields.
 *
 * Every journey shares a shape — leaves somewhere, arrives somewhere — but
 * asking for a "flight number" when someone is recording a drive makes the
 * form look like it was built for something else and is merely tolerating them.
 */
const JOURNEY_WORDS: Partial<
  Record<ItemType, { name: string; placeholder: string; from: string; to: string }>
> = {
  flight: {
    name: 'Flight number',
    placeholder: 'UA 123',
    from: 'Departs from',
    to: 'Arrives at',
  },
  train: {
    name: 'Train or service',
    placeholder: 'Frecciarossa 9512',
    from: 'Departs from',
    to: 'Arrives at',
  },
  ferry: {
    name: 'Ferry or route',
    placeholder: 'Naples → Positano',
    from: 'Sails from',
    to: 'Arrives at',
  },
  bus: {
    name: 'Bus or service',
    placeholder: 'FlixBus 076',
    from: 'Departs from',
    to: 'Arrives at',
  },
  car: {
    name: 'What is it?',
    placeholder: 'Rental car, or airport transfer',
    from: 'Driving from',
    to: 'Driving to',
  },
  transit: {
    name: 'What is it?',
    placeholder: 'Taxi, funicular, a lift from Sam',
    from: 'From',
    to: 'To',
  },
};

/** Types that go from one place to another, and so carry two zones. */
export const JOURNEYS: ItemType[] = ['flight', 'train', 'ferry', 'bus', 'car', 'transit'];

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
  const words = JOURNEY_WORDS[type];
  /**
   * Travel that usually has no paperwork at all.
   *
   * "Uber" is the whole answer. Presenting two places, two times and a
   * confirmation number for that makes a one-word entry feel like a form to
   * be escaped rather than filled, so the rest waits behind a disclosure for
   * the rental that genuinely has a booking.
   */
  const isQuick = type === 'car' || type === 'transit';
  const [showAll, setShowAll] = useState(false);
  const detailed = !isQuick || showAll;

  const doc = state.current?.doc;
  const existing = itemId ? doc?.items.find((i) => i.id === itemId) : undefined;
  const legs = useMemo(() => (doc ? legsFromStays(doc) : []), [doc]);

  const [title, setTitle] = useState('');
  const [fromPlace, setFromPlace] = useState<Place | null>(null);
  const [toPlace, setToPlace] = useState<Place | null>(null);
  const [startDate, setStartDate] = useState(params.get('date') ?? '');
  // A date handed over in the link needs its time seeding too, or the item
  // saves without a timestamp and whatever sent you here stays unanswered.
  const [startTime, setStartTime] = useState(params.get('date') ? '12:00' : '');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');

  /**
   * Picking a date fills a midday time if none has been typed.
   *
   * The day is what lays out a trip; the exact minute often is not known yet.
   * Requiring both meant a date entered alone was discarded, which is the
   * opposite of letting someone sketch a flight before booking it. Filling the
   * visible field rather than defaulting at save time keeps it honest — the
   * time is there to be corrected, not invented behind your back.
   */
  function pickStartDate(value: string) {
    setStartDate(value);
    if (value && !startTime) setStartTime(isStay ? '15:00' : '12:00');
  }

  function pickEndDate(value: string) {
    setEndDate(value);
    if (value && !endTime) setEndTime(isStay ? '11:00' : '12:00');
  }
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [pastedNote, setPastedNote] = useState<string | null>(null);
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
    setMapsUrl(existing.location?.mapsUrl ?? '');
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

  /**
   * Takes a pasted map link and fills in whatever can be read from it.
   *
   * The link itself is always kept, because that is what opens their maps app
   * when tapped. Reading a name and coordinates out of it is a bonus, and the
   * shortened links a phone's share sheet produces yield nothing — they hide
   * everything behind a redirect the browser may not follow.
   */
  function pasteMapsUrl(value: string) {
    setMapsUrl(value);
    setPastedNote(null);
    if (!value.trim()) return;

    const read = parseMapsUrl(value);
    if (!read) {
      setPastedNote(
        isShortenedMapsUrl(value)
          ? 'Saved — this opens your maps app. Short links hide their details, so add the address below, or paste the full link from a computer to fill it in.'
          : 'Saved. This link opens your maps app, but its details cannot be read here.',
      );
      return;
    }
    if (read.name && !title.trim()) setTitle(read.name);
    setPastedNote(
      read.name ? `Read “${read.name}” from that link.` : 'Read the location from that link.',
    );
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      // Where the item *ends up* is what locates it: a flight belongs to its
      // destination, and everything else has only the one place.
      const place = toPlace;
      const read = mapsUrl ? parseMapsUrl(mapsUrl) : null;
      const location =
        place || address || phone || mapsUrl
          ? {
              name: place?.name ?? (title || 'Location'),
              ...(address ? { address } : {}),
              ...(phone ? { phone } : {}),
              ...(mapsUrl ? { mapsUrl } : {}),
              ...(read?.lat !== undefined ? { lat: read.lat, lng: read.lng } : {}),
              ...(place ? { city: place.name, timeZone: place.timeZone } : {}),
            }
          : undefined;

      // Composed rather than built inline, so a date can never be dropped for
      // want of a time. See timestampFrom.
      const startsAt = timestampFrom({
        date: startDate,
        time: startTime,
        timeZone: startZone,
        defaultTime: isStay ? '15:00' : '12:00',
      });
      const endsAt = timestampFrom({
        date: endDate,
        time: endTime,
        timeZone: endZone,
        defaultTime: isStay ? '11:00' : '12:00',
      });

      const patch = {
        type,
        title: title.trim() || TYPE_LABELS[type],
        ...(startsAt ? { startsAt } : {}),
        ...(endsAt ? { endsAt } : {}),
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
          label={isStay ? 'Hotel or rental name' : (words?.name ?? 'What is it?')}
          value={title}
          onChange={setTitle}
          autoFocus={!itemId}
          placeholder={isStay ? 'Hotel Artemide' : (words?.placeholder ?? 'Colosseum')}
        />

        {isJourney && !detailed ? (
          <DateTimeField
            label="When"
            date={startDate}
            time={startTime}
            timeZone={startZone}
            onDateChange={pickStartDate}
            onTimeChange={setStartTime}
          />
        ) : null}

        {isJourney && detailed ? (
          <>
            <PlaceField
              label={words?.from ?? 'From'}
              value={fromPlace}
              onChange={setFromPlace}
              fallbackZone={contextZone}
              fallbackLabel={contextLabel}
            />
            <DateTimeField
              label={type === 'car' || type === 'transit' ? 'Leaves' : 'Departure'}
              date={startDate}
              time={startTime}
              timeZone={startZone}
              onDateChange={pickStartDate}
              onTimeChange={setStartTime}
            />
            <PlaceField
              label={words?.to ?? 'To'}
              value={toPlace}
              onChange={setToPlace}
              fallbackZone={contextZone}
              fallbackLabel={contextLabel}
            />
            <DateTimeField
              label={type === 'car' || type === 'transit' ? 'Gets in' : 'Arrival'}
              date={endDate}
              time={endTime}
              timeZone={endZone}
              onDateChange={pickEndDate}
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
              onDateChange={pickStartDate}
              onTimeChange={setStartTime}
            />
            <DateTimeField
              label={isStay ? 'Check out' : 'Ends (optional)'}
              date={endDate}
              time={endTime}
              timeZone={endZone}
              onDateChange={pickEndDate}
              onTimeChange={setEndTime}
            />
          </>
        )}

        {detailed ? (
          <>
            <TextField
              label="Address"
              value={address}
              onChange={setAddress}
              placeholder="Via Toledo 1, Napoli"
            />
            <TextField label="Phone" value={phone} onChange={setPhone} type="tel" />
            <TextField
              label="Map link (optional)"
              value={mapsUrl}
              onChange={pasteMapsUrl}
              placeholder="Paste a Google or Apple Maps link"
            />
            {pastedNote ? <p className="-mt-2 text-sm text-ok">{pastedNote}</p> : null}
          </>
        ) : null}

        {detailed ? (
          <TextField
            label="Confirmation number (optional)"
            value={confirmation}
            onChange={setConfirmation}
          />
        ) : null}
        <TextAreaField
          label="Notes (optional)"
          value={notes}
          onChange={setNotes}
          placeholder={
            isStay ? 'Check-in from 3:00 PM' : 'Opening hours, prices, reminders'
          }
        />

        {itemId ? (
          // Only once the item exists: there is nothing to attach a file to
          // until it has been saved and has an id.
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">Documents</span>
            <div className="flex flex-wrap items-center gap-2">
              {existing?.attachments.map((attachment) => (
                <Link
                  key={attachment.driveFileId}
                  to={`/trip/${folderId}/doc/${attachment.driveFileId}`}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-sm"
                >
                  <FileText className="size-3.5 shrink-0" aria-hidden />
                  <span className="max-w-44 truncate">
                    {attachment.label ?? attachment.name}
                  </span>
                </Link>
              ))}
              <AttachDocument folderId={folderId} itemId={itemId} />
            </div>
          </div>
        ) : null}

        {isQuick && !showAll ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="self-start text-sm text-accent underline-offset-2 hover:underline"
          >
            Add more detail — places, times, confirmation
          </button>
        ) : null}

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
