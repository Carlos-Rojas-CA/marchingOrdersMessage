import { PLACES, type PlaceSeed } from './places';

/**
 * Turning places and wall-clock times into the zoned timestamps the itinerary
 * stores.
 *
 * The governing rule: a traveller types the time printed on their booking and
 * names the place. They never see or choose an offset. Deriving it from the
 * place *and the date* is what keeps daylight saving correct — Rome is +01:00
 * in January and +02:00 in May, and a single stored offset per place would be
 * wrong half the year.
 *
 * All of it rests on the browser's own time zone database via `Intl`, so there
 * is no table here to fall out of date when a country changes its rules.
 */

export interface Place {
  name: string;
  country: string;
  /** IANA identifier, e.g. `Europe/Rome`. */
  timeZone: string;
}

/** Minutes that `timeZone` is ahead of UTC at a given instant. */
function offsetMinutesAt(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const at = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asIfUtc = Date.UTC(
    Number(at.year),
    Number(at.month) - 1,
    Number(at.day),
    // Some implementations render midnight as hour 24.
    Number(at.hour) % 24,
    Number(at.minute),
    Number(at.second),
  );

  return (asIfUtc - instant.getTime()) / 60_000;
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

/** The offset in force at a place on a date, as `+02:00`. */
export function offsetFor(timeZone: string, date: string): string {
  // Midday avoids the ambiguous hour around a DST transition, which only ever
  // occurs near midnight or in the small hours.
  const probe = new Date(`${date}T12:00:00Z`);
  return formatOffset(offsetMinutesAt(timeZone, probe));
}

/**
 * Combines a date, a wall-clock time and a place into a zoned ISO timestamp.
 *
 * The wall time is what the traveller typed and what the app will read back to
 * them, so it is preserved verbatim; only the offset is computed.
 */
export function zonedIso(date: string, time: string, timeZone: string): string {
  const [hours = '00', minutes = '00'] = time.split(':');
  const hhmm = `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;

  // The offset depends on the instant, and the instant depends on the offset.
  // Resolve by guessing, then correcting once — enough for every real case,
  // since transitions move the clock by an hour and never by a whole day.
  const guess = new Date(`${date}T${hhmm}:00Z`);
  const firstPass = offsetMinutesAt(timeZone, guess);
  const corrected = new Date(guess.getTime() - firstPass * 60_000);
  const settled = offsetMinutesAt(timeZone, corrected);

  return `${date}T${hhmm}:00${formatOffset(settled)}`;
}

/** Human-checkable summary, e.g. `Central European Summer Time · +02:00`. */
export function zoneLabel(timeZone: string, date: string): string {
  const offset = offsetFor(timeZone, date);
  let name = timeZone.split('/').pop()!.replace(/_/g, ' ');
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'long',
    }).formatToParts(new Date(`${date}T12:00:00Z`));
    name = parts.find((p) => p.type === 'timeZoneName')?.value ?? name;
  } catch {
    // Falls back to the zone's own last segment, which is always readable.
  }
  return `${name} · ${offset}`;
}

/** Every place the picker can offer, from the curated list plus IANA zones. */
function allPlaces(): (PlaceSeed & { key: string })[] {
  const curated = PLACES.map((p) => ({ ...p, key: p.name.toLowerCase() }));
  const seen = new Set(curated.map((p) => p.timeZone + '|' + p.name.toLowerCase()));

  // Anything not curated is still reachable by its zone name, so an unusual
  // destination is never simply unavailable.
  const fromZones: (PlaceSeed & { key: string })[] = [];
  for (const zone of Intl.supportedValuesOf('timeZone')) {
    const segments = zone.split('/');
    const name = segments[segments.length - 1]!.replace(/_/g, ' ');
    const region = segments[0]!.replace(/_/g, ' ');
    if (seen.has(zone + '|' + name.toLowerCase())) continue;
    fromZones.push({ name, country: region, timeZone: zone, key: name.toLowerCase() });
  }

  return [...curated, ...fromZones];
}

const PLACE_INDEX = allPlaces();

function toPlace(seed: PlaceSeed): Place {
  return { name: seed.name, country: seed.country, timeZone: seed.timeZone };
}

/**
 * Finds places matching what the traveller typed — a city, a local spelling,
 * or the airport code printed on their ticket.
 */
export function searchPlaces(query: string, limit = 8): Place[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: { place: PlaceSeed; score: number }[] = [];
  for (const seed of PLACE_INDEX) {
    const name = seed.name.toLowerCase();
    const aliases = (seed.aliases ?? []).map((a) => a.toLowerCase());

    let score = -1;
    if (name === q) score = 0;
    else if (aliases.includes(q)) score = 1;
    else if (name.startsWith(q)) score = 2;
    else if (aliases.some((a) => a.startsWith(q))) score = 3;
    else if (name.includes(q)) score = 4;

    if (score >= 0) scored.push({ place: seed, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.place.name.localeCompare(b.place.name))
    .slice(0, limit)
    .map((s) => toPlace(s.place));
}

/** Curated places only, longest name first so "New York" beats "York". */
const ADDRESS_CANDIDATES = PLACES.flatMap((seed) =>
  [seed.name, ...(seed.aliases ?? [])]
    // Airport codes are excluded: three uppercase letters match far too much
    // ordinary address text to be safe.
    .filter((term) => term.length > 3)
    .map((term) => ({ term: term.toLowerCase(), seed })),
).sort((a, b) => b.term.length - a.term.length);

/**
 * Infers a place from a written address.
 *
 * Best-effort by design. When nothing is recognisable this returns `null` so
 * the next rule in the chain can answer — a wrong guess here silently shifts a
 * time, which is far worse than declining to guess.
 */
export function placeFromAddress(address: string): Place | null {
  const haystack = address.toLowerCase();

  for (const { term, seed } of ADDRESS_CANDIDATES) {
    // Bounded by non-letters so "Rome" does not match inside "Nicerome".
    const pattern = new RegExp(
      `(^|[^\\p{L}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`,
      'u',
    );
    if (pattern.test(haystack)) return toPlace(seed);
  }

  return null;
}

export interface ZoneContext {
  /** A place the traveller picked on this item. */
  explicit?: string;
  /** An address they typed, which may name a city. */
  address?: string;
  /** The trip's legs, so a date can say where they are. */
  legs?: { arrive: string; depart: string; timeZone?: string }[];
  /** The date the item falls on. */
  date?: string;
  /** The zone used for the previous thing entered. */
  lastUsed?: string;
}

/**
 * Decides which time zone a wall-clock time belongs to.
 *
 * First hit wins, and the traveller only ever sees the result. The order runs
 * from what they said, through what the trip already knows, to what they were
 * last doing:
 *
 * 1. A place picked on this item
 * 2. A city recognised inside an address they typed
 * 3. Whichever leg the date falls in — once stays exist, the trip already
 *    knows where they are, which beats remembering
 * 4. The zone used for the last thing entered, for a run of items in one city
 * 5. The device's own zone, so this always returns something usable
 */
export function resolveTimeZone(context: ZoneContext): string {
  if (context.explicit) return context.explicit;

  if (context.address) {
    const fromAddress = placeFromAddress(context.address);
    if (fromAddress) return fromAddress.timeZone;
  }

  if (context.date && context.legs) {
    // Inclusive of the departure date: you are still in Rome on the morning
    // you check out, whatever that evening's stay says.
    const leg = context.legs.find(
      (l) => context.date! >= l.arrive && context.date! <= l.depart && l.timeZone,
    );
    if (leg?.timeZone) return leg.timeZone;
  }

  if (context.lastUsed) return context.lastUsed;

  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
