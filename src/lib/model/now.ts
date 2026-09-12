import { liveItems, type Itinerary, type ItineraryItem } from './itinerary';

/**
 * The Now lens: what is in play at this instant.
 *
 * This is the default landing screen during a trip, and the shortest path from
 * a lock screen to the document about to be scanned.
 */
export interface NowView {
  /** Items the traveller is inside of right now — a hotel stay, a rail pass. */
  current: ItineraryItem[];
  /** Items that have not started, soonest first. */
  upcoming: ItineraryItem[];
}

function instant(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/**
 * An item counts as *current* only when the clock falls inside an explicit
 * `[startsAt, endsAt)` span.
 *
 * An item with no `endsAt` — a flight recorded with only a departure — is
 * therefore never current: before it starts it is upcoming, and after it starts
 * it drops out. That is deliberate. Keeping a departed flight pinned as
 * "happening now" would bury whatever the traveller actually needs next, and
 * any rule for aging it out would be an arbitrary constant pretending to be a
 * fact about travel.
 */
export function nowView(doc: Itinerary, at: Date): NowView {
  const t = at.getTime();
  const current: ItineraryItem[] = [];
  const upcoming: ItineraryItem[] = [];

  for (const item of liveItems(doc)) {
    const start = instant(item.startsAt);
    if (start === null) continue;

    if (start > t) {
      upcoming.push(item);
      continue;
    }

    const end = instant(item.endsAt);
    if (end !== null && end > t) current.push(item);
  }

  current.sort((a, b) => instant(a.startsAt)! - instant(b.startsAt)!);
  upcoming.sort((a, b) => instant(a.startsAt)! - instant(b.startsAt)!);

  return { current, upcoming };
}
