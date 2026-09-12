import { liveItems, type Itinerary, type ItineraryItem } from './itinerary';

export interface DayGroup {
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  items: ItineraryItem[];
}

export interface GroupedDays {
  days: DayGroup[];
  /** Items with no usable start time — ideas not yet pinned to a day. */
  unscheduled: ItineraryItem[];
}

/**
 * ISO 8601 date-time carrying an explicit zone: either `Z` or `±HH:MM`.
 * The zone is required because without one there is no way to know which
 * calendar day the traveller is actually living in.
 */
const ZONED_ISO = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * The local calendar day an item belongs to.
 *
 * The literal date prefix of a zoned ISO string *is* its local date — that is
 * what the offset encodes — so no timezone database is needed. A red-eye at
 * `2026-09-12T23:00:00-07:00` is the evening of the 12th to the person taking
 * it, even though it is already the 13th in UTC.
 */
function localDate(startsAt: string | undefined): string | null {
  if (!startsAt) return null;
  const match = ZONED_ISO.exec(startsAt);
  if (!match) return null;
  if (Number.isNaN(Date.parse(startsAt))) return null;
  return match[1]!;
}

/** Groups an itinerary's live items into ordered days plus an unscheduled bucket. */
export function groupByDay(doc: Itinerary): GroupedDays {
  const byDate = new Map<string, ItineraryItem[]>();
  const unscheduled: ItineraryItem[] = [];

  for (const item of liveItems(doc)) {
    const date = localDate(item.startsAt);
    if (date === null) {
      unscheduled.push(item);
      continue;
    }
    const bucket = byDate.get(date);
    if (bucket) bucket.push(item);
    else byDate.set(date, [item]);
  }

  const days = [...byDate.entries()]
    .map(([date, items]) => ({
      date,
      // Sorted by instant rather than by the literal string: two items on the
      // same local day can carry different offsets.
      items: items.sort(
        (a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!),
      ),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { days, unscheduled };
}
