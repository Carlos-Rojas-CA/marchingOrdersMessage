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
    const depart = addDays(cursor, stop.nights);
    planned.push({ ...stop, arrive: cursor, depart });
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
