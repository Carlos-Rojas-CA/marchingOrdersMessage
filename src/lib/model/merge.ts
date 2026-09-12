import type { Itinerary, ItineraryItem } from './itinerary';

/**
 * Per-item last-writer-wins merge of two versions of the same itinerary.
 *
 * Nothing calls this in v1: a trip has exactly one writer, enforced by Drive's
 * own permissions, and a write that detects a competing change refuses rather
 * than merges. It is written and tested now precisely because the moment it
 * becomes necessary is the moment there is pressure to write it badly — two
 * people mid-trip, edits already in conflict.
 *
 * The merge is possible only because every item carries a stable `id`, its own
 * `updatedAt`, and a `deleted` tombstone instead of being spliced out of the
 * array. That is the whole reason the schema looks the way it does.
 */

function editedAt(item: ItineraryItem): number {
  if (!item.updatedAt) return Number.NEGATIVE_INFINITY;
  const t = Date.parse(item.updatedAt);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

function writtenAt(doc: Itinerary): number {
  if (!doc.updatedAt) return Number.NEGATIVE_INFINITY;
  const t = Date.parse(doc.updatedAt);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/**
 * Picks between two versions of one item.
 *
 * A deletion is just another edit: it wins if it is newer and loses if it is
 * older, which lets a later edit legitimately bring an item back rather than
 * having a tombstone silently outrank everything forever.
 *
 * Ties break on `id`-stable content rather than argument position, so the
 * merge is symmetric — `merge(a, b)` and `merge(b, a)` agree.
 */
function pick(mine: ItineraryItem, theirs: ItineraryItem): ItineraryItem {
  const t1 = editedAt(mine);
  const t2 = editedAt(theirs);
  if (t1 > t2) return mine;
  if (t2 > t1) return theirs;
  // Same timestamp (or neither dated): prefer the surviving version, then fall
  // back to a stable comparison so the result never depends on call order.
  if (mine.deleted !== theirs.deleted) return mine.deleted ? theirs : mine;
  return JSON.stringify(mine) <= JSON.stringify(theirs) ? mine : theirs;
}

export function mergeItineraries(mine: Itinerary, theirs: Itinerary): Itinerary {
  if (mine.tripId !== theirs.tripId) {
    throw new Error(
      `Cannot merge different trips: "${mine.tripId}" and "${theirs.tripId}"`,
    );
  }

  const byId = new Map<string, ItineraryItem>();
  for (const item of mine.items) byId.set(item.id, item);
  for (const item of theirs.items) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? pick(existing, item) : item);
  }

  // Trip-level scalars have no per-field timestamps, so the whole envelope goes
  // to whichever document was written last.
  const envelope = writtenAt(theirs) > writtenAt(mine) ? theirs : mine;

  return {
    ...envelope,
    items: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}
