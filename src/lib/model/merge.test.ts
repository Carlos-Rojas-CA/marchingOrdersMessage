import { describe, expect, test } from 'vitest';
import { mergeItineraries } from './merge';
import { parseItinerary, type Itinerary } from './itinerary';

function doc(updatedAt: string, items: unknown[], name = 'Trip'): Itinerary {
  return parseItinerary({ schemaVersion: 1, tripId: 't1', name, updatedAt, items });
}

const item = (id: string, title: string, updatedAt?: string, extra = {}) => ({
  id,
  type: 'activity',
  title,
  ...(updatedAt ? { updatedAt } : {}),
  ...extra,
});

describe('mergeItineraries', () => {
  test('keeps items that exist on only one side', () => {
    const merged = mergeItineraries(
      doc('2026-09-01T00:00:00Z', [item('a', 'Mine', '2026-09-01T00:00:00Z')]),
      doc('2026-09-01T00:00:00Z', [item('b', 'Theirs', '2026-09-01T00:00:00Z')]),
    );

    expect(merged.items.map((i) => i.id).sort()).toEqual(['a', 'b']);
  });

  test('takes the more recently edited version of an item that both sides changed', () => {
    const merged = mergeItineraries(
      doc('2026-09-02T00:00:00Z', [item('a', 'Older', '2026-09-01T00:00:00Z')]),
      doc('2026-09-02T00:00:00Z', [item('a', 'Newer', '2026-09-05T00:00:00Z')]),
    );

    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]!.title).toBe('Newer');
  });

  test('is symmetric — argument order does not change the result', () => {
    const mine = doc('2026-09-02T00:00:00Z', [item('a', 'Older', '2026-09-01T00:00:00Z')]);
    const theirs = doc('2026-09-02T00:00:00Z', [item('a', 'Newer', '2026-09-05T00:00:00Z')]);

    expect(mergeItineraries(mine, theirs).items).toEqual(mergeItineraries(theirs, mine).items);
  });

  test('honours a deletion that happened after the competing edit', () => {
    const merged = mergeItineraries(
      doc('2026-09-02T00:00:00Z', [item('a', 'Edited', '2026-09-01T00:00:00Z')]),
      doc('2026-09-02T00:00:00Z', [item('a', 'Edited', '2026-09-05T00:00:00Z', { deleted: true })]),
    );

    expect(merged.items[0]!.deleted).toBe(true);
  });

  test('lets an edit that happened after a deletion bring the item back', () => {
    const merged = mergeItineraries(
      doc('2026-09-02T00:00:00Z', [item('a', 'Gone', '2026-09-01T00:00:00Z', { deleted: true })]),
      doc('2026-09-02T00:00:00Z', [item('a', 'Revived', '2026-09-05T00:00:00Z')]),
    );

    expect(merged.items[0]!.deleted).toBe(false);
    expect(merged.items[0]!.title).toBe('Revived');
  });

  test('treats an item with no timestamp as older than one that has been dated', () => {
    const merged = mergeItineraries(
      doc('2026-09-02T00:00:00Z', [item('a', 'Undated')]),
      doc('2026-09-02T00:00:00Z', [item('a', 'Dated', '2026-09-01T00:00:00Z')]),
    );

    expect(merged.items[0]!.title).toBe('Dated');
  });

  test('takes trip-level fields from whichever document was written last', () => {
    const merged = mergeItineraries(
      doc('2026-09-01T00:00:00Z', [], 'Old name'),
      doc('2026-09-05T00:00:00Z', [], 'New name'),
    );

    expect(merged.name).toBe('New name');
    expect(merged.updatedAt).toBe('2026-09-05T00:00:00Z');
  });

  test('refuses to merge documents describing different trips', () => {
    const mine = doc('2026-09-01T00:00:00Z', []);
    const theirs = parseItinerary({ schemaVersion: 1, tripId: 'other', name: 'Other', items: [] });

    expect(() => mergeItineraries(mine, theirs)).toThrow(/different trips/i);
  });

  test('orders merged items deterministically', () => {
    const merged = mergeItineraries(
      doc('2026-09-01T00:00:00Z', [item('b', 'B', '2026-09-01T00:00:00Z')]),
      doc('2026-09-01T00:00:00Z', [item('a', 'A', '2026-09-01T00:00:00Z')]),
    );

    expect(merged.items.map((i) => i.id)).toEqual(['a', 'b']);
  });
});
