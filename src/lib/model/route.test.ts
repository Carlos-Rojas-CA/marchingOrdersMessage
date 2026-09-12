import { describe, expect, test } from 'vitest';
import {
  addDays,
  arrivalDate,
  bedGaps,
  legsFromStays,
  planRoute,
  transitionGaps,
} from './route';
import { parseItinerary, type Itinerary } from './itinerary';

function trip(fields: Record<string, unknown>): Itinerary {
  return parseItinerary({
    schemaVersion: 1,
    tripId: 't1',
    name: 'Europe 2026',
    startDate: '2026-05-08',
    endDate: '2026-05-21',
    ...fields,
  });
}

const stay = (
  id: string,
  city: string,
  from: string,
  to: string,
  timeZone = 'Europe/Rome',
) => ({
  id,
  type: 'lodging',
  title: `Hotel ${id}`,
  startsAt: `${from}T15:00:00+02:00`,
  endsAt: `${to}T11:00:00+02:00`,
  location: { name: `Hotel ${id}`, city, timeZone },
});

describe('addDays', () => {
  test('moves a plain date forward', () => {
    expect(addDays('2026-05-08', 4)).toBe('2026-05-12');
  });

  test('crosses a month boundary', () => {
    expect(addDays('2026-05-30', 3)).toBe('2026-06-02');
  });

  test('crosses a year boundary', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  test('is not shifted by the device time zone', () => {
    // Naive date maths through local time drops or adds a day depending on
    // where the phone thinks it is.
    expect(addDays('2026-05-08', 0)).toBe('2026-05-08');
  });
});

describe('planRoute', () => {
  test('turns nights into arrival and departure dates', () => {
    const plan = planRoute('2026-05-09', [
      { place: 'Rome', nights: 4 },
      { place: 'Barcelona', nights: 3 },
    ]);

    expect(plan[0]).toMatchObject({ place: 'Rome', arrive: '2026-05-09', depart: '2026-05-13' });
    expect(plan[1]).toMatchObject({ place: 'Barcelona', arrive: '2026-05-13', depart: '2026-05-16' });
  });

  test('leaves no gap between stops — you depart one and arrive the next', () => {
    const plan = planRoute('2026-05-09', [
      { place: 'Rome', nights: 4 },
      { place: 'Barcelona', nights: 3 },
      { place: 'Paris', nights: 4 },
    ]);

    expect(plan[0]!.depart).toBe(plan[1]!.arrive);
    expect(plan[1]!.depart).toBe(plan[2]!.arrive);
  });

  test('cascades every later stop when an earlier one changes length', () => {
    // The whole reason nights are the input: this is the arithmetic people get
    // wrong on paper and retype a trip to fix.
    const before = planRoute('2026-05-09', [
      { place: 'Rome', nights: 4 },
      { place: 'Barcelona', nights: 3 },
    ]);
    const after = planRoute('2026-05-09', [
      { place: 'Rome', nights: 5 },
      { place: 'Barcelona', nights: 3 },
    ]);

    expect(before[1]!.arrive).toBe('2026-05-13');
    expect(after[1]!.arrive).toBe('2026-05-14');
    expect(after[1]!.depart).toBe('2026-05-17');
  });

  test('reports the last night so the trip end can be checked against it', () => {
    const plan = planRoute('2026-05-09', [
      { place: 'Rome', nights: 4 },
      { place: 'Berlin', nights: 1 },
    ]);

    expect(plan.at(-1)!.depart).toBe('2026-05-14');
  });

  test('carries the time zone through, since that is what it is really for', () => {
    const plan = planRoute('2026-05-09', [
      { place: 'Rome', nights: 2, timeZone: 'Europe/Rome' },
    ]);

    expect(plan[0]!.timeZone).toBe('Europe/Rome');
  });

  test('handles an empty route without inventing anything', () => {
    expect(planRoute('2026-05-09', [])).toEqual([]);
  });
});

describe('legsFromStays', () => {
  test('reads where you are and when straight off the stays', () => {
    const legs = legsFromStays(
      trip({
        items: [
          stay('a', 'Rome', '2026-05-09', '2026-05-13'),
          stay('b', 'Barcelona', '2026-05-13', '2026-05-16', 'Europe/Madrid'),
        ],
      }),
    );

    expect(legs.map((l) => l.place)).toEqual(['Rome', 'Barcelona']);
    expect(legs[0]).toMatchObject({ arrive: '2026-05-09', depart: '2026-05-13' });
  });

  test('orders legs by date, not by the order they were entered', () => {
    const legs = legsFromStays(
      trip({
        items: [
          stay('b', 'Barcelona', '2026-05-13', '2026-05-16', 'Europe/Madrid'),
          stay('a', 'Rome', '2026-05-09', '2026-05-13'),
        ],
      }),
    );

    expect(legs.map((l) => l.place)).toEqual(['Rome', 'Barcelona']);
  });

  test('ignores everything that is not somewhere you sleep', () => {
    const legs = legsFromStays(
      trip({
        items: [
          stay('a', 'Rome', '2026-05-09', '2026-05-13'),
          { id: 'f', type: 'flight', title: 'Flight', startsAt: '2026-05-08T11:40:00-07:00' },
        ],
      }),
    );

    expect(legs).toHaveLength(1);
  });

  test('falls back to the address when a stay names no city', () => {
    const legs = legsFromStays(
      trip({
        items: [
          {
            id: 'a',
            type: 'lodging',
            title: 'Hotel Artemide',
            startsAt: '2026-05-09T15:00:00+02:00',
            endsAt: '2026-05-13T11:00:00+02:00',
            location: { name: 'Hotel Artemide', address: 'Via Nazionale, 22, 00184 Roma RM' },
          },
        ],
      }),
    );

    expect(legs[0]!.place).toBe('Rome');
  });

  test('skips a tombstoned stay', () => {
    const legs = legsFromStays(
      trip({ items: [{ ...stay('a', 'Rome', '2026-05-09', '2026-05-13'), deleted: true }] }),
    );

    expect(legs).toEqual([]);
  });
});

describe('bedGaps', () => {
  test('finds nights inside the trip with nowhere to sleep', () => {
    const gaps = bedGaps(
      trip({
        items: [
          // The overnight flight out covers the night of the 8th.
          {
            id: 'out',
            type: 'flight',
            title: 'UA 123',
            startsAt: '2026-05-08T11:40:00-07:00',
            endsAt: '2026-05-09T13:25:00+02:00',
          },
          stay('a', 'Rome', '2026-05-09', '2026-05-13'),
          stay('b', 'Barcelona', '2026-05-13', '2026-05-17', 'Europe/Madrid'),
        ],
      }),
    );

    // Trip runs to 21 May; the stays stop on the 17th.
    expect(gaps).toEqual([{ from: '2026-05-17', to: '2026-05-21', nights: 4 }]);
  });

  test('does not count a night spent on an overnight flight as a missing bed', () => {
    const gaps = bedGaps(
      trip({
        startDate: '2026-05-08',
        endDate: '2026-05-09',
        items: [
          {
            id: 'out',
            type: 'flight',
            title: 'UA 123',
            startsAt: '2026-05-08T11:40:00-07:00',
            endsAt: '2026-05-09T13:25:00+02:00',
          },
        ],
      }),
    );

    // A warning that fires on a red-eye is noise, and noise is how warnings
    // stop being read.
    expect(gaps).toEqual([]);
  });

  test('still counts the night when the journey lands the same day', () => {
    const gaps = bedGaps(
      trip({
        startDate: '2026-05-13',
        endDate: '2026-05-14',
        items: [
          {
            id: 'hop',
            type: 'flight',
            title: 'VY6503',
            startsAt: '2026-05-13T14:10:00+02:00',
            endsAt: '2026-05-13T16:05:00+02:00',
          },
        ],
      }),
    );

    // Landing at four in the afternoon does not give you somewhere to sleep.
    expect(gaps).toEqual([{ from: '2026-05-13', to: '2026-05-14', nights: 1 }]);
  });

  test('finds a gap in the middle of a trip', () => {
    const gaps = bedGaps(
      trip({
        startDate: '2026-05-09',
        endDate: '2026-05-16',
        items: [
          stay('a', 'Rome', '2026-05-09', '2026-05-11'),
          stay('b', 'Barcelona', '2026-05-14', '2026-05-16', 'Europe/Madrid'),
        ],
      }),
    );

    expect(gaps).toEqual([{ from: '2026-05-11', to: '2026-05-14', nights: 3 }]);
  });

  test('reports nothing when every night is covered', () => {
    const gaps = bedGaps(
      trip({
        startDate: '2026-05-09',
        endDate: '2026-05-16',
        items: [
          stay('a', 'Rome', '2026-05-09', '2026-05-13'),
          stay('b', 'Barcelona', '2026-05-13', '2026-05-16', 'Europe/Madrid'),
        ],
      }),
    );

    expect(gaps).toEqual([]);
  });

  test('treats the whole trip as a gap when nothing is booked', () => {
    const gaps = bedGaps(trip({ startDate: '2026-05-09', endDate: '2026-05-12', items: [] }));

    expect(gaps).toEqual([{ from: '2026-05-09', to: '2026-05-12', nights: 3 }]);
  });

  test('says nothing at all when the trip has no dates to measure against', () => {
    const gaps = bedGaps(
      parseItinerary({ schemaVersion: 1, tripId: 't', name: 'Someday', items: [] }),
    );

    expect(gaps).toEqual([]);
  });
});

describe('transitionGaps', () => {
  const twoCities = [
    stay('a', 'Rome', '2026-05-09', '2026-05-13'),
    stay('b', 'Barcelona', '2026-05-13', '2026-05-16', 'Europe/Madrid'),
  ];

  test('notices a move between cities with nothing booked to make it', () => {
    const gaps = transitionGaps(trip({ items: twoCities }));

    // The mistake that actually happens on a multi-country trip: every hotel
    // booked, and one train between them forgotten.
    expect(gaps).toEqual([{ from: 'Rome', to: 'Barcelona', date: '2026-05-13' }]);
  });

  test('is satisfied by a flight on the day of the move', () => {
    const gaps = transitionGaps(
      trip({
        items: [
          ...twoCities,
          { id: 'vy', type: 'flight', title: 'VY6503', startsAt: '2026-05-13T14:10:00+02:00' },
        ],
      }),
    );

    expect(gaps).toEqual([]);
  });

  test('is satisfied by a train, a ferry, a bus or a drive just the same', () => {
    // Driving needs no ticket, but it is still how you got there. Without a
    // way to say so, a move you made by car would be flagged forever — and a
    // warning that cannot be satisfied is one people learn to ignore.
    for (const type of ['train', 'ferry', 'bus', 'car', 'transit']) {
      const gaps = transitionGaps(
        trip({
          items: [
            ...twoCities,
            { id: 'x', type, title: 'Onward', startsAt: '2026-05-13T14:10:00+02:00' },
          ],
        }),
      );
      expect(gaps).toEqual([]);
    }
  });

  test('is not satisfied by something that does not move you', () => {
    const gaps = transitionGaps(
      trip({
        items: [
          ...twoCities,
          { id: 'm', type: 'activity', title: 'Museum', startsAt: '2026-05-13T10:00:00+02:00' },
        ],
      }),
    );

    expect(gaps).toHaveLength(1);
  });

  test('says nothing when consecutive stays are in the same city', () => {
    const gaps = transitionGaps(
      trip({
        items: [
          stay('a', 'Rome', '2026-05-09', '2026-05-11'),
          stay('b', 'Rome', '2026-05-11', '2026-05-14'),
        ],
      }),
    );

    expect(gaps).toEqual([]);
  });

  test('accepts travel on the day you leave when the stays do not touch', () => {
    const gaps = transitionGaps(
      trip({
        items: [
          stay('a', 'Rome', '2026-05-09', '2026-05-12'),
          stay('b', 'Barcelona', '2026-05-14', '2026-05-16', 'Europe/Madrid'),
          { id: 'x', type: 'train', title: 'Onward', startsAt: '2026-05-12T09:00:00+02:00' },
        ],
      }),
    );

    expect(gaps).toEqual([]);
  });
});

describe('arrivalDate', () => {
  test('is when the first inbound journey lands, not when the trip starts', () => {
    // A flight leaving on the 17th and landing on the 18th means the first
    // night in a bed is the 18th. Basing the route on the trip's first day
    // would put you in a hotel you were still flying towards.
    const date = arrivalDate(
      trip({
        startDate: '2026-05-17',
        endDate: '2026-05-30',
        items: [
          {
            id: 'out',
            type: 'flight',
            title: 'LAX → Naples',
            startsAt: '2026-05-17T16:00:00-07:00',
            endsAt: '2026-05-18T14:30:00+02:00',
          },
        ],
      }),
    );

    expect(date).toBe('2026-05-18');
  });

  test('falls back to the trip start when no journey has been recorded', () => {
    expect(arrivalDate(trip({ startDate: '2026-05-08', items: [] }))).toBe('2026-05-08');
  });

  test('uses the trip start when the outbound lands the same day', () => {
    const date = arrivalDate(
      trip({
        startDate: '2026-05-08',
        items: [
          {
            id: 'out',
            type: 'train',
            title: 'Short hop',
            startsAt: '2026-05-08T09:00:00+02:00',
            endsAt: '2026-05-08T12:00:00+02:00',
          },
        ],
      }),
    );

    expect(date).toBe('2026-05-08');
  });

  test('ignores journeys later in the trip', () => {
    const date = arrivalDate(
      trip({
        startDate: '2026-05-08',
        items: [
          {
            id: 'hop',
            type: 'flight',
            title: 'Mid-trip',
            startsAt: '2026-05-15T20:00:00+02:00',
            endsAt: '2026-05-16T08:00:00+02:00',
          },
        ],
      }),
    );

    // Only a journey starting on the first day says when the trip really
    // begins on the ground.
    expect(date).toBe('2026-05-08');
  });
});
