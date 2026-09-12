import { describe, expect, test } from 'vitest';
import {
  offsetFor,
  resolveTimeZone,
  placeFromAddress,
  searchPlaces,
  zonedIso,
  zoneLabel,
} from './timezones';

describe('offsetFor', () => {
  test('follows daylight saving rather than assuming one offset per place', () => {
    // The whole reason offsets are derived instead of typed: Rome is not
    // "+01:00", it is +01:00 in January and +02:00 in May.
    expect(offsetFor('Europe/Rome', '2026-01-09')).toBe('+01:00');
    expect(offsetFor('Europe/Rome', '2026-05-09')).toBe('+02:00');
  });

  test('handles the Pacific side of the same rule', () => {
    expect(offsetFor('America/Los_Angeles', '2026-01-08')).toBe('-08:00');
    expect(offsetFor('America/Los_Angeles', '2026-05-08')).toBe('-07:00');
  });

  test('leaves places that do not observe it alone all year', () => {
    expect(offsetFor('Asia/Tokyo', '2026-01-09')).toBe('+09:00');
    expect(offsetFor('Asia/Tokyo', '2026-07-09')).toBe('+09:00');
  });

  test('supports offsets that are not whole hours', () => {
    expect(offsetFor('Asia/Kolkata', '2026-05-09')).toBe('+05:30');
    expect(offsetFor('Asia/Kathmandu', '2026-05-09')).toBe('+05:45');
  });

  test('reports UTC as +00:00 rather than a bare Z', () => {
    expect(offsetFor('Etc/UTC', '2026-05-09')).toBe('+00:00');
  });
});

describe('zonedIso', () => {
  test('stamps a wall-clock time with the offset of its place', () => {
    // You type 3:00 PM because that is what the booking says. The offset is
    // the app's job, never yours.
    expect(zonedIso('2026-05-09', '15:00', 'Europe/Rome')).toBe(
      '2026-05-09T15:00:00+02:00',
    );
  });

  test('gives the same wall time a different stamp in a different place', () => {
    expect(zonedIso('2026-05-08', '11:40', 'America/Los_Angeles')).toBe(
      '2026-05-08T11:40:00-07:00',
    );
  });

  test('uses the offset in force on that date, not today', () => {
    expect(zonedIso('2026-01-09', '15:00', 'Europe/Rome')).toBe(
      '2026-01-09T15:00:00+01:00',
    );
  });

  test('round-trips back to the same wall time it was given', () => {
    const iso = zonedIso('2026-05-09', '15:00', 'Europe/Rome');

    // The literal prefix of a zoned ISO string is its local time — which is
    // exactly what the timeline reads back to the traveller.
    expect(iso.slice(0, 16)).toBe('2026-05-09T15:00');
  });

  test('handles a time on the far side of a spring-forward boundary', () => {
    // Europe moves to summer time on 29 March 2026. A booking the next day
    // must not inherit the winter offset.
    expect(zonedIso('2026-03-30', '09:00', 'Europe/Rome')).toBe(
      '2026-03-30T09:00:00+02:00',
    );
    expect(zonedIso('2026-03-28', '09:00', 'Europe/Rome')).toBe(
      '2026-03-28T09:00:00+01:00',
    );
  });
});

describe('searchPlaces', () => {
  test('finds a city by name', () => {
    const found = searchPlaces('rome');

    expect(found[0]!.timeZone).toBe('Europe/Rome');
  });

  test('finds cities that are not their own time zone', () => {
    // Barcelona, Florence and Kyoto have no IANA zone of their own. A traveller
    // does not know or care about that.
    expect(searchPlaces('barcelona')[0]!.timeZone).toBe('Europe/Madrid');
    expect(searchPlaces('florence')[0]!.timeZone).toBe('Europe/Rome');
    expect(searchPlaces('kyoto')[0]!.timeZone).toBe('Asia/Tokyo');
  });

  test('matches airport codes, since that is what a ticket prints', () => {
    expect(searchPlaces('FCO')[0]!.timeZone).toBe('Europe/Rome');
    expect(searchPlaces('SAN')[0]!.timeZone).toBe('America/Los_Angeles');
  });

  test('is not case sensitive and tolerates partial input', () => {
    expect(searchPlaces('BARCE')[0]!.name).toBe('Barcelona');
  });

  test('ranks an exact name above a merely containing one', () => {
    expect(searchPlaces('Paris')[0]!.name).toBe('Paris');
  });

  test('returns nothing for a query that matches nothing', () => {
    expect(searchPlaces('zzzzz')).toEqual([]);
  });

  test('says which country a place is in, to tell duplicates apart', () => {
    expect(searchPlaces('rome')[0]!.country).toBe('Italy');
  });
});

describe('placeFromAddress', () => {
  test('recognises a city inside a written address', () => {
    const place = placeFromAddress('1-29-20 Nishinippori, Arakawa, Tokyo 116-0013');

    expect(place?.timeZone).toBe('Asia/Tokyo');
  });

  test('recognises a city that is not its own time zone', () => {
    const place = placeFromAddress('173-6 Sanjōaburanokōjichō, Nakagyō-ku, Kyoto 604-8251');

    expect(place?.timeZone).toBe('Asia/Tokyo');
  });

  test('recognises an address written in the local language', () => {
    expect(placeFromAddress('Via Nazionale, 22, 00184 Roma RM')?.timeZone).toBe(
      'Europe/Rome',
    );
  });

  test('does not guess when nothing in the address is recognisable', () => {
    // Guessing wrong here silently shifts a time. Returning nothing lets the
    // next rule in the chain answer instead.
    expect(placeFromAddress('12 Made Up Lane')).toBeNull();
  });

  test('is not fooled by a city name buried inside a longer word', () => {
    expect(placeFromAddress('Nicerome Industrial Estate')).toBeNull();
  });
});

describe('zoneLabel', () => {
  test('names the zone in a way a person can check at a glance', () => {
    expect(zoneLabel('Europe/Rome', '2026-05-09')).toContain('+02:00');
  });
});

describe('resolveTimeZone', () => {
  const legs = [
    { arrive: '2026-05-09', depart: '2026-05-13', timeZone: 'Europe/Rome' },
    { arrive: '2026-05-13', depart: '2026-05-16', timeZone: 'Europe/Madrid' },
  ];

  test('uses a place the traveller picked over everything else', () => {
    expect(
      resolveTimeZone({
        explicit: 'Asia/Tokyo',
        address: 'Via Nazionale, Roma',
        legs,
        date: '2026-05-10',
        lastUsed: 'Europe/Paris',
      }),
    ).toBe('Asia/Tokyo');
  });

  test('falls to a city recognised in the address', () => {
    expect(
      resolveTimeZone({ address: 'Via Nazionale, 22, 00184 Roma RM', lastUsed: 'Europe/Paris' }),
    ).toBe('Europe/Rome');
  });

  test('falls to whichever leg the date lands in', () => {
    // Adding something on the 15th: the traveller is in Barcelona, and the app
    // already knows that from the stays.
    expect(resolveTimeZone({ legs, date: '2026-05-15', lastUsed: 'Europe/Paris' })).toBe(
      'Europe/Madrid',
    );
  });

  test('falls to the last place used when the date is outside every leg', () => {
    expect(resolveTimeZone({ legs, date: '2026-05-30', lastUsed: 'Europe/Paris' })).toBe(
      'Europe/Paris',
    );
  });

  test('falls to the last place used when there are no legs yet', () => {
    expect(resolveTimeZone({ date: '2026-05-10', lastUsed: 'Europe/Paris' })).toBe(
      'Europe/Paris',
    );
  });

  test('ends at the device zone rather than returning nothing', () => {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;

    expect(resolveTimeZone({})).toBe(device);
  });

  test('ignores an address it cannot recognise instead of guessing', () => {
    expect(resolveTimeZone({ address: '12 Made Up Lane', lastUsed: 'Europe/Paris' })).toBe(
      'Europe/Paris',
    );
  });

  test('treats the day you check out as still belonging to that leg', () => {
    // You are in Rome on the morning of the 13th, whatever the Barcelona stay
    // says about that evening.
    expect(resolveTimeZone({ legs, date: '2026-05-13' })).toBe('Europe/Rome');
  });
});
