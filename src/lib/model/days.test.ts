import { describe, expect, test } from 'vitest';
import { groupByDay } from './days';
import { parseItinerary, type Itinerary } from './itinerary';

function docWith(items: unknown[]): Itinerary {
  return parseItinerary({
    schemaVersion: 1,
    tripId: 't1',
    name: 'Trip',
    items,
  });
}

describe('groupByDay', () => {
  test('groups items under the calendar day they start on', () => {
    const { days } = groupByDay(
      docWith([
        { id: 'a', type: 'flight', title: 'Depart', startsAt: '2026-09-12T08:00:00-07:00' },
        { id: 'b', type: 'lodging', title: 'Check in', startsAt: '2026-09-13T18:00:00+09:00' },
      ]),
    );

    expect(days.map((d) => d.date)).toEqual(['2026-09-12', '2026-09-13']);
    expect(days[0]!.items.map((i) => i.id)).toEqual(['a']);
    expect(days[1]!.items.map((i) => i.id)).toEqual(['b']);
  });

  test('orders days chronologically regardless of item order', () => {
    const { days } = groupByDay(
      docWith([
        { id: 'late', type: 'activity', title: 'Later', startsAt: '2026-09-20T10:00:00Z' },
        { id: 'early', type: 'activity', title: 'Earlier', startsAt: '2026-09-14T10:00:00Z' },
      ]),
    );

    expect(days.map((d) => d.date)).toEqual(['2026-09-14', '2026-09-20']);
  });

  test('orders items within a day by the instant they occur', () => {
    const { days } = groupByDay(
      docWith([
        { id: 'evening', type: 'activity', title: 'Dinner', startsAt: '2026-09-12T19:00:00-07:00' },
        { id: 'morning', type: 'activity', title: 'Museum', startsAt: '2026-09-12T09:00:00-07:00' },
      ]),
    );

    expect(days[0]!.items.map((i) => i.id)).toEqual(['morning', 'evening']);
  });

  test('uses the local day of the offset, not the UTC day', () => {
    // 23:00 on Sep 12 in Los Angeles is already Sep 13 in UTC. The traveller
    // experiences it as the evening of the 12th, so that is where it belongs.
    const { days } = groupByDay(
      docWith([
        { id: 'lateflight', type: 'flight', title: 'Red-eye', startsAt: '2026-09-12T23:00:00-07:00' },
      ]),
    );

    expect(days.map((d) => d.date)).toEqual(['2026-09-12']);
  });

  test('collects items with no start time as unscheduled', () => {
    const { days, unscheduled } = groupByDay(
      docWith([
        { id: 'idea', type: 'poi', title: 'Maybe visit the market' },
        { id: 'fixed', type: 'activity', title: 'Tour', startsAt: '2026-09-12T09:00:00Z' },
      ]),
    );

    expect(unscheduled.map((i) => i.id)).toEqual(['idea']);
    expect(days).toHaveLength(1);
  });

  test('treats an unparseable start time as unscheduled rather than dropping it', () => {
    const { days, unscheduled } = groupByDay(
      docWith([{ id: 'broken', type: 'activity', title: 'Bad date', startsAt: 'sometime tuesday' }]),
    );

    expect(unscheduled.map((i) => i.id)).toEqual(['broken']);
    expect(days).toEqual([]);
  });

  test('omits tombstoned items entirely', () => {
    const { days, unscheduled } = groupByDay(
      docWith([
        { id: 'gone', type: 'activity', title: 'Cancelled', startsAt: '2026-09-12T09:00:00Z', deleted: true },
        { id: 'goneUnscheduled', type: 'poi', title: 'Dropped', deleted: true },
      ]),
    );

    expect(days).toEqual([]);
    expect(unscheduled).toEqual([]);
  });
});
