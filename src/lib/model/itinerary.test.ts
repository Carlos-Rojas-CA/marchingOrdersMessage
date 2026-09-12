import { describe, expect, test } from 'vitest';
import { parseItinerary } from './itinerary';

/** A minimal document that satisfies every required field. */
function validDoc() {
  return {
    schemaVersion: 1,
    tripId: 'trip-1',
    name: 'Japan 2026',
    startDate: '2026-09-12',
    endDate: '2026-09-24',
    updatedAt: '2026-09-12T10:00:00Z',
    items: [],
  };
}

describe('parseItinerary', () => {
  test('accepts a minimal valid document', () => {
    const doc = parseItinerary(validDoc());

    expect(doc.tripId).toBe('trip-1');
    expect(doc.name).toBe('Japan 2026');
    expect(doc.items).toEqual([]);
  });

  test('rejects a document whose items lack ids', () => {
    const bad = { ...validDoc(), items: [{ type: 'flight', title: 'AA123' }] };

    // Asserting on the issue path, not the message: zod's generic
    // "Invalid input" text contains the substring "id" and would match a
    // naive regex even when the schema stopped requiring an id at all.
    expect(() => parseItinerary(bad)).toThrow();
    try {
      parseItinerary(bad);
    } catch (e) {
      const issues = (e as { issues: { path: PropertyKey[] }[] }).issues;
      expect(issues.some((i) => i.path.join('.') === 'items.0.id')).toBe(true);
    }
  });

  test('defaults a missing deleted flag to false so tombstones are explicit', () => {
    const doc = parseItinerary({
      ...validDoc(),
      items: [{ id: 'i1', type: 'flight', title: 'AA123' }],
    });

    expect(doc.items[0]!.deleted).toBe(false);
  });

  test('defaults missing attachment lists to empty arrays', () => {
    const doc = parseItinerary({
      ...validDoc(),
      items: [{ id: 'i1', type: 'flight', title: 'AA123' }],
    });

    expect(doc.attachments).toEqual([]);
    expect(doc.items[0]!.attachments).toEqual([]);
  });

  test('preserves unknown fields written by a newer version of the app', () => {
    const doc = parseItinerary({
      ...validDoc(),
      items: [{ id: 'i1', type: 'flight', title: 'AA123', seatMap: 'future' }],
    });

    // A newer client may add fields. Dropping them here would silently
    // destroy that data the next time this client writes the file back.
    expect((doc.items[0] as Record<string, unknown>).seatMap).toBe('future');
  });

  test('rejects an item with an unrecognised type', () => {
    const bad = {
      ...validDoc(),
      items: [{ id: 'i1', type: 'teleport', title: 'nope' }],
    };

    expect(() => parseItinerary(bad)).toThrow();
  });

  test('rejects a document that is not an object at all', () => {
    expect(() => parseItinerary('garbage')).toThrow();
  });
});

describe('location details', () => {
  test('keeps a phone number for the place', () => {
    const doc = parseItinerary({
      ...validDoc(),
      items: [
        {
          id: 'hotel',
          type: 'lodging',
          title: 'Residence Condominium',
          location: {
            name: 'Residence Condominium',
            address: '1-29-20 Nishinippori, Arakawa, Tokyo 116-0013',
            phone: '+81-3-5604-9846',
          },
        },
      ],
    });

    // The number you need when you are standing outside at midnight and the
    // address has not helped.
    expect(doc.items[0]!.location!.phone).toBe('+81-3-5604-9846');
  });
});
