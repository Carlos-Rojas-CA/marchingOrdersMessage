import { liveItems, type Itinerary, type ItemType } from './itinerary';
import { placeFromAddress } from './timezones';

/**
 * The shape of a trip as a sequence of places.
 *
 * Nothing here is stored. Legs are derived from the stays already recorded —
 * a hotel in Rome from the 9th to the 13th *is* the statement "you are in Rome
 * for those nights" — on the same principle that makes days derived rather
 * than written down. Two facts fall out of that for free, and the second is
 * the one worth having: where you sleep, and where you have not arranged to.
 */

/** A date with days added, done in UTC so a device's zone cannot shift it. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(Date.UTC(y!, m! - 1, d! + days));
  return at.toISOString().slice(0, 10);
}

/** Whole days between two plain dates. */
function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export interface RouteStop {
  place: string;
  country?: string;
  timeZone?: string;
  nights: number;
  /**
   * Pins this stop to a date instead of following the one before it.
   *
   * What makes a half-planned trip recordable: when the middle of a route is
   * undecided, the places on either side of the hole are still known, and
   * chaining would force a length to be invented for the gap.
   */
  arrive?: string;
}

export interface PlannedStop extends RouteStop {
  /** Plain dates, `YYYY-MM-DD`. */
  arrive: string;
  depart: string;
}

/**
 * Turns "Rome 4 nights, Barcelona 3" into dates.
 *
 * Nights are the input rather than dates because changing one stop then
 * cascades through every later one — which is precisely the arithmetic people
 * get wrong on paper and retype a whole itinerary to fix.
 */
export function planRoute(startDate: string, stops: RouteStop[]): PlannedStop[] {
  const planned: PlannedStop[] = [];
  let cursor = startDate;

  for (const stop of stops) {
    // A pinned stop starts where it says and the chain resumes from it; an
    // unpinned one follows whatever came before.
    const arrive = stop.arrive || cursor;
    const depart = addDays(arrive, stop.nights);
    planned.push({ ...stop, arrive, depart });
    // You leave one place on the day you reach the next; there is no day in
    // between to account for.
    cursor = depart;
  }

  return planned;
}

/**
 * The first day the trip happens on the ground.
 *
 * A flight leaving on the 17th and landing on the 18th means the first night in
 * a bed is the 18th; basing a route on the trip's own start date would put you
 * in a hotel you were still flying towards. Only a journey starting on the
 * first day counts — a mid-trip red-eye says nothing about when the trip began.
 */
export function arrivalDate(doc: Itinerary): string {
  const start = doc.startDate;
  if (!start) return '';

  const outbound = liveItems(doc).find(
    (item) =>
      MOVES_YOU.has(item.type) &&
      item.startsAt?.slice(0, 10) === start &&
      item.endsAt &&
      item.endsAt.slice(0, 10) > start,
  );

  return outbound?.endsAt?.slice(0, 10) ?? start;
}

export interface Leg {
  itemId: string;
  place: string;
  arrive: string;
  depart: string;
  timeZone?: string;
}

/** Where a stay is, by its recorded city or failing that its address. */
function placeOf(location: Record<string, unknown> | undefined): string | null {
  if (!location) return null;
  if (typeof location.city === 'string' && location.city) return location.city;
  if (typeof location.address === 'string') {
    const inferred = placeFromAddress(location.address);
    if (inferred) return inferred.name;
  }
  return null;
}

/** The trip's legs, in order, read off its stays. */
export function legsFromStays(doc: Itinerary): Leg[] {
  const legs: Leg[] = [];

  for (const item of liveItems(doc)) {
    if (item.type !== 'lodging' || !item.startsAt || !item.endsAt) continue;
    const place = placeOf(item.location as Record<string, unknown> | undefined);
    if (!place) continue;

    legs.push({
      itemId: item.id,
      place,
      arrive: item.startsAt.slice(0, 10),
      depart: item.endsAt.slice(0, 10),
      timeZone:
        typeof item.location?.timeZone === 'string' ? item.location.timeZone : undefined,
    });
  }

  return legs.sort((a, b) => a.arrive.localeCompare(b.arrive));
}

/** Item types that actually carry you from one place to another. */
const MOVES_YOU: ReadonlySet<ItemType> = new Set<ItemType>([
  'flight',
  'train',
  'ferry',
  'bus',
  // Driving needs no ticket, but it is still how you got there. Without a way
  // to record it, a move made by car would be flagged forever — and a warning
  // that cannot be satisfied is one people learn to ignore.
  'car',
  // Anything else that got you there — a rideshare, a funicular, a lift from a
  // friend. What matters is that the move is recorded, not how it was made.
  'transit',
]);

/**
 * Where a given day happens — or, on a travel day, the move it is.
 *
 * A day you change cities is not "Rome" and not "Barcelona"; it is the day
 * between, and it is the one most likely to be opened in a hurry. Changing
 * hotels inside one city is not a move.
 */
export function dayPlace(
  doc: Itinerary,
  date: string,
): { from: string; to?: string } | null {
  const covering = legsFromStays(doc).filter(
    (leg) => date >= leg.arrive && date <= leg.depart,
  );
  if (covering.length === 0) return null;

  const leaving = covering.find((leg) => leg.depart === date);
  const arriving = covering.find((leg) => leg.arrive === date);

  if (leaving && arriving && leaving.place !== arriving.place) {
    return { from: leaving.place, to: arriving.place };
  }

  return { from: (arriving ?? covering[0]!).place };
}

/**
 * Every day the trip spans, including the ones with nothing on them.
 *
 * A day strip that lists only the busy days jumps 17, 18, 20, 23 and reads as
 * broken rather than sparse — and an empty day is precisely the one worth
 * selecting, because it is the one still to be filled.
 */
export function tripDays(doc: Itinerary): string[] {
  const dated = liveItems(doc)
    .map((item) => item.startsAt?.slice(0, 10))
    .filter((d): d is string => Boolean(d));

  const bounds = [doc.startDate, doc.endDate, ...dated].filter(
    (d): d is string => Boolean(d),
  );
  if (bounds.length === 0) return [];

  // Stretched to cover anything dated outside the stated range: hiding the day
  // would hide the item sitting on it.
  const first = bounds.reduce((a, b) => (a < b ? a : b));
  const last = bounds.reduce((a, b) => (a > b ? a : b));

  const days: string[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}

/**
 * The day a trip should open on.
 *
 * Today while the trip is under way; otherwise the nearest end of it. A trip
 * that has finished opens on its last day rather than its first, because that
 * is the part most recently lived in.
 */
export function nearestDay(days: string[], today: string): string | null {
  if (days.length === 0) return null;
  if (days.includes(today)) return today;

  return days.reduce((best, day) =>
    Math.abs(daysBetween(day, today)) < Math.abs(daysBetween(best, today)) ? day : best,
  );
}

export interface BedGap {
  from: string;
  to: string;
  nights: number;
}

/**
 * Nights inside the trip with nowhere booked to sleep.
 *
 * Not an error — a red-eye, an overnight train or a friend's sofa are all real
 * answers. It is stated so that "we have no hotel on Thursday" is discovered
 * while it can still be fixed, rather than on Thursday.
 */
export function bedGaps(doc: Itinerary): BedGap[] {
  if (!doc.startDate || !doc.endDate) return [];

  // A night spent travelling is not a night without a bed. Only journeys that
  // actually cross midnight count — landing at four in the afternoon does not
  // give you somewhere to sleep, and a warning that fires on a red-eye is
  // noise, which is how warnings stop being read.
  const nightsInTransit = new Set(
    liveItems(doc)
      .filter(
        (item) =>
          MOVES_YOU.has(item.type) &&
          item.startsAt &&
          item.endsAt &&
          item.endsAt.slice(0, 10) > item.startsAt.slice(0, 10),
      )
      .flatMap((item) => {
        const nights: string[] = [];
        for (
          let day = item.startsAt!.slice(0, 10);
          day < item.endsAt!.slice(0, 10);
          day = addDays(day, 1)
        ) {
          nights.push(day);
        }
        return nights;
      }),
  );

  const covered = new Set(nightsInTransit);
  for (const leg of legsFromStays(doc)) {
    for (let day = leg.arrive; day < leg.depart; day = addDays(day, 1)) covered.add(day);
  }

  const gaps: BedGap[] = [];
  let openFrom: string | null = null;

  for (let day = doc.startDate; day < doc.endDate; day = addDays(day, 1)) {
    if (covered.has(day)) {
      if (openFrom !== null) {
        gaps.push({ from: openFrom, to: day, nights: daysBetween(openFrom, day) });
        openFrom = null;
      }
      continue;
    }
    openFrom ??= day;
  }

  if (openFrom !== null) {
    gaps.push({
      from: openFrom,
      to: doc.endDate,
      nights: daysBetween(openFrom, doc.endDate),
    });
  }

  return gaps;
}

export interface TransitionGap {
  from: string;
  to: string;
  /** The day the move has to happen — when the earlier stay ends. */
  date: string;
}

/**
 * Moves between cities with nothing booked to make them.
 *
 * On a trip through several countries this is the mistake that actually
 * happens: every hotel gets booked and one train between them does not.
 */
export function transitionGaps(doc: Itinerary): TransitionGap[] {
  const legs = legsFromStays(doc);
  const travelDays = new Set(
    liveItems(doc)
      .filter((item) => MOVES_YOU.has(item.type) && item.startsAt)
      .map((item) => item.startsAt!.slice(0, 10)),
  );

  const gaps: TransitionGap[] = [];

  for (let i = 1; i < legs.length; i++) {
    const previous = legs[i - 1]!;
    const next = legs[i]!;
    if (previous.place === next.place) continue;

    // The move can happen any day between checking out and checking in — the
    // stays do not have to touch.
    let covered = false;
    for (let day = previous.depart; day <= next.arrive; day = addDays(day, 1)) {
      if (travelDays.has(day)) {
        covered = true;
        break;
      }
    }
    if (covered) continue;

    gaps.push({ from: previous.place, to: next.place, date: previous.depart });
  }

  return gaps;
}
