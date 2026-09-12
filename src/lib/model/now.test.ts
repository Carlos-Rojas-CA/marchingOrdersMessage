import { describe, expect, test } from 'vitest';
import { nowView } from './now';
import { parseItinerary, type Itinerary } from './itinerary';

function docWith(items: unknown[]): Itinerary {
  return parseItinerary({ schemaVersion: 1, tripId: 't1', name: 'Trip', items });
}

const at = (iso: string) => new Date(iso);

describe('nowView', () => {
  test('reports an item as current while the clock sits inside its span', () => {
    const { current } = nowView(
      docWith([
        {
          id: 'hotel',
          type: 'lodging',
          title: 'Park Hyatt',
          startsAt: '2026-09-13T15:00:00Z',
          endsAt: '2026-09-16T11:00:00Z',
        },
      ]),
      at('2026-09-14T09:00:00Z'),
    );

    expect(current.map((i) => i.id)).toEqual(['hotel']);
  });

  test('drops an item from current once its end time has passed', () => {
    const { current } = nowView(
      docWith([
        {
          id: 'hotel',
          type: 'lodging',
          title: 'Park Hyatt',
          startsAt: '2026-09-13T15:00:00Z',
          endsAt: '2026-09-16T11:00:00Z',
        },
      ]),
      at('2026-09-17T09:00:00Z'),
    );

    expect(current).toEqual([]);
  });

  test('lists items that have not started yet, soonest first', () => {
    const { upcoming } = nowView(
      docWith([
        { id: 'later', type: 'activity', title: 'Museum', startsAt: '2026-09-15T10:00:00Z' },
        { id: 'sooner', type: 'train', title: 'Shinkansen', startsAt: '2026-09-14T08:00:00Z' },
      ]),
      at('2026-09-13T09:00:00Z'),
    );

    expect(upcoming.map((i) => i.id)).toEqual(['sooner', 'later']);
  });

  test('excludes items that already started from upcoming', () => {
    const { upcoming } = nowView(
      docWith([
        { id: 'departed', type: 'flight', title: 'AA123', startsAt: '2026-09-12T08:00:00Z' },
        { id: 'ahead', type: 'activity', title: 'Tour', startsAt: '2026-09-14T08:00:00Z' },
      ]),
      at('2026-09-13T09:00:00Z'),
    );

    expect(upcoming.map((i) => i.id)).toEqual(['ahead']);
  });

  test('never treats an open-ended item as current once it has begun', () => {
    // A flight with no arrival time has departed; showing it as "happening
    // now" indefinitely would bury the thing the traveller needs next.
    const view = nowView(
      docWith([
        { id: 'flight', type: 'flight', title: 'AA123', startsAt: '2026-09-12T08:00:00Z' },
      ]),
      at('2026-09-12T09:00:00Z'),
    );

    expect(view.current).toEqual([]);
    expect(view.upcoming).toEqual([]);
  });

  test('ignores items with no start time', () => {
    const view = nowView(
      docWith([{ id: 'idea', type: 'poi', title: 'Maybe the market' }]),
      at('2026-09-13T09:00:00Z'),
    );

    expect(view.current).toEqual([]);
    expect(view.upcoming).toEqual([]);
  });

  test('ignores tombstoned items', () => {
    const view = nowView(
      docWith([
        {
          id: 'gone',
          type: 'lodging',
          title: 'Cancelled',
          startsAt: '2026-09-13T15:00:00Z',
          endsAt: '2026-09-16T11:00:00Z',
          deleted: true,
        },
      ]),
      at('2026-09-14T09:00:00Z'),
    );

    expect(view.current).toEqual([]);
  });
});
