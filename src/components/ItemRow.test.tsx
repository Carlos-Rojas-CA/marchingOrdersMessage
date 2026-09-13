import { describe, expect, test } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimelineScreen } from '../routes/TimelineScreen';
import { NowScreen } from '../routes/NowScreen';
import { renderLens } from '../test/renderApp';

const HOTEL = {
  schemaVersion: 1,
  tripId: 't1',
  name: 'Japan 2023',
  items: [
    {
      id: 'hotel',
      type: 'lodging',
      title: 'Residence Condominium',
      startsAt: '2023-03-19T15:00:00+09:00',
      endsAt: '2023-03-22T11:00:00+09:00',
      location: {
        name: 'Residence Condominium',
        address: '1-29-20 Nishinippori, Arakawa, Tokyo 116-0013',
        phone: '+81-3-5604-9846',
      },
      attachments: [],
    },
  ],
};

describe('ItemRow location', () => {
  test('makes a phone number callable in one tap', async () => {
    await renderLens(<TimelineScreen />, { itinerary: HOTEL });

    // Standing outside at midnight, the address has not helped and typing a
    // +81 number by hand is the last thing anyone wants to be doing.
    const call = await screen.findByRole('link', { name: /\+81-3-5604-9846/ });
    expect(call).toHaveAttribute('href', 'tel:+81-3-5604-9846');
  });

  test('still shows the address for getting there', async () => {
    await renderLens(<TimelineScreen />, { itinerary: HOTEL });

    expect(
      await screen.findByText(/1-29-20 Nishinippori, Arakawa, Tokyo 116-0013/),
    ).toBeInTheDocument();
  });

  test('shows nothing extra when a place has no phone number', async () => {
    await renderLens(<TimelineScreen />, {
      itinerary: {
        ...HOTEL,
        items: [
          {
            ...HOTEL.items[0],
            location: { name: 'Somewhere', address: 'An address' },
          },
        ],
      },
    });

    await screen.findByText('An address');
    expect(screen.queryByRole('link', { name: /tel:/ })).not.toBeInTheDocument();
  });
});

const STAY = {
  schemaVersion: 1,
  tripId: 't1',
  name: 'Italy 2026',
  items: [
    {
      id: 'hotel',
      type: 'lodging',
      title: 'Hotel Artemide',
      startsAt: '2026-05-09T15:00:00+02:00',
      endsAt: '2026-05-13T11:00:00+02:00',
      confirmationNumber: 'HA-88213',
      location: {
        name: 'Hotel Artemide',
        address: 'Via Nazionale, 22, 00184 Roma RM',
        phone: '+39-06-489911',
      },
      attachments: [],
    },
  ],
};

describe('a lodging stay', () => {
  test('shows when you check out, not only when you arrive', async () => {
    await renderLens(<TimelineScreen />, { itinerary: STAY });

    // A stay is a span. Showing only the arrival hides the half of it people
    // actually forget — what time they have to be out.
    const span = (await screen.findByText('Check in')).closest('dl')!;

    expect(span).toHaveTextContent('3:00 PM');
    expect(span).toHaveTextContent('11:00 AM');
  });

  test('names the day you check out, since it is rarely the same one', async () => {
    await renderLens(<TimelineScreen />, { itinerary: STAY });

    const span = (await screen.findByText('Check out')).closest('dl')!;

    expect(span).toHaveTextContent('Sat, May 9');
    expect(span).toHaveTextContent('Wed, May 13');
  });

  test('keeps the address and phone reachable from the stay', async () => {
    await renderLens(<TimelineScreen />, { itinerary: STAY });

    expect(await screen.findByText(/Via Nazionale, 22/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\+39-06-489911/ })).toHaveAttribute(
      'href',
      'tel:+39-06-489911',
    );
  });

  test('says nothing about checking out when no end time was recorded', async () => {
    await renderLens(<TimelineScreen />, {
      itinerary: {
        ...STAY,
        items: [{ ...STAY.items[0], endsAt: undefined }],
      },
    });

    await screen.findByText('Hotel Artemide');
    expect(screen.queryByText(/Check out/)).not.toBeInTheDocument();
  });
});

describe('editing from the timeline', () => {
  const TRIP = {
    schemaVersion: 1,
    tripId: 't1',
    name: 'Europe Test 1',
    items: [
      {
        id: 'paint',
        type: 'activity',
        title: 'Paint class',
        startsAt: '2026-09-21T13:00:00+02:00',
        attachments: [],
      },
    ],
  };

  test('the item opens its own edit form', async () => {
    await renderLens(<TimelineScreen />, { itinerary: TRIP });

    // Tapping the thing you want to change is the only obvious way to change
    // it; there was previously no way at all from here.
    const link = await screen.findByRole('link', { name: /Paint class/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('/item/paint'));
  });

  test('carries the type, so the form asks the right questions', async () => {
    await renderLens(<TimelineScreen />, { itinerary: TRIP });

    expect(await screen.findByRole('link', { name: /Paint class/ })).toHaveAttribute(
      'href',
      expect.stringContaining('type=activity'),
    );
  });

  test('a stay opens as a stay', async () => {
    await renderLens(<TimelineScreen />, {
      itinerary: {
        ...TRIP,
        items: [
          {
            id: 'naples',
            type: 'lodging',
            title: 'Stay in Naples',
            startsAt: '2026-09-18T15:00:00+02:00',
            endsAt: '2026-09-26T11:00:00+02:00',
            attachments: [],
          },
        ],
      },
    });

    expect(await screen.findByRole('link', { name: /Stay in Naples/ })).toHaveAttribute(
      'href',
      expect.stringContaining('type=lodging'),
    );
  });

  test('does not repeat the place when it only says the title again', async () => {
    await renderLens(<TimelineScreen />, {
      itinerary: {
        ...TRIP,
        items: [
          {
            id: 'naples',
            type: 'lodging',
            title: 'Stay in Naples',
            startsAt: '2026-09-18T15:00:00+02:00',
            endsAt: '2026-09-26T11:00:00+02:00',
            location: { name: 'Stay in Naples', city: 'Naples' },
            attachments: [],
          },
        ],
      },
    });

    await screen.findByText('Stay in Naples');
    // A placeholder stay names itself after the city, so the location line
    // underneath was saying the same words twice.
    expect(screen.getAllByText('Stay in Naples')).toHaveLength(1);
  });
});

describe('a row stays quiet when there is nothing to show', () => {
  test('an item with no documents shows no chips at all', async () => {
    await renderLens(<TimelineScreen />, {
      itinerary: {
        schemaVersion: 1,
        tripId: 't1',
        name: 'Trip',
        items: [
          {
            id: 'paint',
            type: 'activity',
            title: 'Paint class',
            startsAt: '2026-09-21T13:00:00+02:00',
            attachments: [],
          },
        ],
      },
    });

    await screen.findByText('Paint class');
    // The dashed "Add" box used to sit under every single item, including the
    // ones with nothing attached and nothing to attach it to yet.
    expect(screen.queryByText('Add')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Map/ })).not.toBeInTheDocument();
  });

  test('still shows a document when there is one', async () => {
    await renderLens(<TimelineScreen />, {
      itinerary: {
        schemaVersion: 1,
        tripId: 't1',
        name: 'Trip',
        items: [
          {
            id: 'flight',
            type: 'flight',
            title: 'UA 123',
            startsAt: '2026-09-17T12:00:00-07:00',
            attachments: [
              { driveFileId: 'bp', name: 'boarding.pdf', mimeType: 'application/pdf' },
            ],
          },
        ],
      },
    });

    expect(await screen.findByRole('link', { name: /boarding\.pdf/ })).toBeInTheDocument();
  });
});

describe('directions', () => {
  const withPlace = (location: Record<string, unknown>) => ({
    schemaVersion: 1,
    tripId: 't1',
    name: 'Trip',
    items: [
      {
        id: 'paint',
        type: 'activity',
        title: 'Paint class',
        startsAt: '2026-09-21T13:00:00+02:00',
        location,
        attachments: [],
      },
    ],
  });

  test('offers directions for an activity with an address', async () => {
    await renderLens(<TimelineScreen />, {
      itinerary: withPlace({ name: 'Paint class', address: 'Via Toledo 1, Napoli' }),
    });

    const link = await screen.findByRole('link', { name: /Directions/ });
    expect(link).toHaveAttribute('target', '_blank');
  });

  test('uses the link the traveller pasted, over anything derived', async () => {
    await renderLens(<TimelineScreen />, {
      itinerary: withPlace({
        name: 'Paint class',
        address: 'Via Toledo 1, Napoli',
        mapsUrl: 'https://maps.app.goo.gl/abc123',
      }),
    });

    expect(await screen.findByRole('link', { name: /Directions/ })).toHaveAttribute(
      'href',
      'https://maps.app.goo.gl/abc123',
    );
  });

  test('offers nothing when there is nowhere to go', async () => {
    await renderLens(<TimelineScreen />, {
      itinerary: {
        schemaVersion: 1,
        tripId: 't1',
        name: 'Trip',
        items: [
          {
            id: 'note',
            type: 'note',
            title: 'Pack sunscreen',
            startsAt: '2026-09-21T13:00:00+02:00',
            attachments: [],
          },
        ],
      },
    });

    await screen.findByText('Pack sunscreen');
    expect(screen.queryByRole('link', { name: /Directions/ })).not.toBeInTheDocument();
  });
});

describe('the timeline day strip', () => {
  const TWO_CITIES = {
    schemaVersion: 1,
    tripId: 't1',
    name: 'Italy 2026',
    startDate: '2026-05-08',
    endDate: '2026-05-16',
    items: [
      {
        id: 'rome',
        type: 'lodging',
        title: 'Hotel Artemide',
        startsAt: '2026-05-09T15:00:00+02:00',
        endsAt: '2026-05-13T11:00:00+02:00',
        location: { name: 'Hotel Artemide', city: 'Rome', timeZone: 'Europe/Rome' },
        attachments: [],
      },
      {
        id: 'hop',
        type: 'flight',
        title: 'Vueling VY6503',
        startsAt: '2026-05-13T14:10:00+02:00',
        attachments: [],
      },
      {
        id: 'bcn',
        type: 'lodging',
        title: 'Hotel Casa Bonay',
        startsAt: '2026-05-13T18:00:00+02:00',
        endsAt: '2026-05-16T11:00:00+02:00',
        location: { name: 'Hotel Casa Bonay', city: 'Barcelona', timeZone: 'Europe/Madrid' },
        attachments: [],
      },
    ],
  };

  test('offers a chip for every day of the trip, including the empty ones', async () => {
    await renderLens(<TimelineScreen />, { itinerary: TWO_CITIES });

    // A strip listing only busy days jumps 9, 13 and reads as broken; the
    // quiet days in between are also days you might want to fill.
    expect(await screen.findByRole('button', { name: 'Show Fri, May 8' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Sun, May 10' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Wed, May 13' })).toBeInTheDocument();
  });

  test('shows everything until a day is chosen', async () => {
    await renderLens(<TimelineScreen />, { itinerary: TWO_CITIES });

    expect(await screen.findByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('narrows to one day when its chip is tapped', async () => {
    await renderLens(<TimelineScreen />, { itinerary: TWO_CITIES });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Show Wed, May 13' }));

    expect(await screen.findByText('Vueling VY6503')).toBeInTheDocument();
    // Rome's stay began on the 9th and is not part of this day.
    expect(screen.queryByText('Hotel Artemide')).not.toBeInTheDocument();
  });

  test('All puts the whole trip back', async () => {
    await renderLens(<TimelineScreen />, { itinerary: TWO_CITIES });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Show Wed, May 13' }));
    await user.click(screen.getByRole('button', { name: 'All' }));

    expect(await screen.findByText('Hotel Artemide')).toBeInTheDocument();
    expect(screen.getByText('Hotel Casa Bonay')).toBeInTheDocument();
  });

  test('tapping the chosen day again clears the filter', async () => {
    await renderLens(<TimelineScreen />, { itinerary: TWO_CITIES });
    const user = userEvent.setup();

    const chip = await screen.findByRole('button', { name: 'Show Wed, May 13' });
    await user.click(chip);
    await user.click(chip);

    expect(await screen.findByText('Hotel Artemide')).toBeInTheDocument();
  });

  test('offers to fill a day that has nothing on it', async () => {
    await renderLens(<TimelineScreen />, { itinerary: TWO_CITIES });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Show Sun, May 10' }));

    expect(await screen.findByText('Nothing on this day yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Add something/ })).toHaveAttribute(
      'href',
      expect.stringContaining('date=2026-05-10'),
    );
  });

  test('labels a travel day with the move rather than a city', async () => {
    await renderLens(<TimelineScreen />, { itinerary: TWO_CITIES });

    // The 13th is neither Rome nor Barcelona; it is the day between.
    expect(await screen.findByText('Rome → Barcelona')).toBeInTheDocument();
  });

  test('labels an ordinary day with where you are', async () => {
    await renderLens(<TimelineScreen />, { itinerary: TWO_CITIES });

    await screen.findByText('Rome → Barcelona');
    expect(screen.getByText('Rome')).toBeInTheDocument();
  });

  test('still shows every day at once rather than filtering to one', async () => {
    await renderLens(<TimelineScreen />, { itinerary: TWO_CITIES });

    // All is the default, so the whole trip is visible without choosing it.
    expect(await screen.findByText('Hotel Artemide')).toBeInTheDocument();
    expect(screen.getByText('Vueling VY6503')).toBeInTheDocument();
    expect(screen.getByText('Hotel Casa Bonay')).toBeInTheDocument();
  });

  test('shows no strip for a trip that happens on one day', async () => {
    await renderLens(<TimelineScreen />, {
      itinerary: {
        schemaVersion: 1,
        tripId: 't1',
        name: 'Day out',
        items: [
          {
            id: 'x',
            type: 'activity',
            title: 'Museum',
            startsAt: '2026-05-09T10:00:00+02:00',
            attachments: [],
          },
        ],
      },
    });

    await screen.findByText('Museum');
    expect(screen.queryByRole('button', { name: /^Show/ })).not.toBeInTheDocument();
  });
});

describe('a tile with nothing attached', () => {
  const oneTrain = {
    schemaVersion: 1,
    tripId: 't1',
    name: 'Italy 2026',
    startDate: '2026-09-23',
    endDate: '2026-09-24',
    items: [
      {
        id: 'train',
        type: 'train',
        title: 'Train',
        startsAt: '2026-09-23T12:00:00+02:00',
        attachments: [],
      },
    ],
  };

  test('keeps the row that carries the card’s bottom padding', async () => {
    await renderLens(<TimelineScreen />, { itinerary: oneTrain });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Show Wed, Sep 23' }));

    // Hiding this row when empty left a chipless tile with no bottom padding
    // at all, so the title sat against the card edge.
    const card = (await screen.findByText('Train')).closest('div.rounded-2xl')!;
    const chips = card.querySelector('.pb-3');
    expect(chips).not.toBeNull();
  });

  test('lines chips up with the title rather than the card edge', async () => {
    await renderLens(<TimelineScreen />, {
      itinerary: {
        ...oneTrain,
        items: [
          {
            ...oneTrain.items[0],
            location: { name: 'Napoli Centrale', address: 'Piazza Garibaldi, Napoli' },
          },
        ],
      },
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Show Wed, Sep 23' }));

    const directions = await screen.findByRole('link', { name: /Directions/ });
    // Indented past the icon, which is where the title starts.
    expect(directions.parentElement?.className).toContain('pl-11');
  });
});

describe('the strip’s All chip', () => {
  const TRIP = {
    schemaVersion: 1,
    tripId: 't1',
    name: 'Italy 2026',
    startDate: '2026-05-08',
    endDate: '2026-05-16',
    items: [
      {
        id: 'a',
        type: 'activity',
        title: 'Museum',
        startsAt: '2026-05-10T10:00:00+02:00',
        attachments: [],
      },
    ],
  };

  test('sits outside the part that scrolls, so it never slides away', async () => {
    await renderLens(<TimelineScreen />, { itinerary: TRIP });

    const all = await screen.findByRole('button', { name: 'All' });
    const aDay = screen.getByRole('button', { name: 'Show Sun, May 10' });

    // A way back that scrolls off the screen is one you have to hunt for.
    const scroller = aDay.parentElement!;
    expect(scroller.className).toContain('overflow-x-auto');
    expect(scroller.contains(all)).toBe(false);
  });
});

describe('the Now screen', () => {
  /** A stay spanning right now, so the Now lens has something current. */
  function currentTrip() {
    const now = new Date();
    const day = (offset: number) =>
      new Date(now.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
    return {
      schemaVersion: 1,
      tripId: 't1',
      name: 'Italy 2026',
      items: [
        {
          id: 'stay',
          type: 'lodging',
          title: 'Hotel Artemide',
          startsAt: `${day(-1)}T15:00:00+02:00`,
          endsAt: `${day(2)}T11:00:00+02:00`,
          attachments: [],
        },
        {
          id: 'later',
          type: 'activity',
          title: 'Colosseum',
          startsAt: `${day(1)}T09:30:00+02:00`,
          attachments: [],
        },
      ],
    };
  }

  test('marks what is happening now with the live treatment', async () => {
    await renderLens(<NowScreen />, { itinerary: currentTrip() });

    const card = (await screen.findByText('Hotel Artemide')).closest('div.rounded-2xl')!;
    // Amber is reserved for the one thing that is true right now.
    expect(card.className).toContain('border-live');
  });

  test('draws what is next as an ordinary tile', async () => {
    await renderLens(<NowScreen />, { itinerary: currentTrip() });

    const card = (await screen.findByText('Colosseum')).closest('div.rounded-2xl')!;
    expect(card.className).toContain('bg-surface');
    expect(card.className).not.toContain('border-live');
  });
});

describe('a journey on the timeline', () => {
  test('reads as both of its ends', async () => {
    await renderLens(<TimelineScreen />, {
      itinerary: {
        schemaVersion: 1,
        tripId: 't1',
        name: 'Italy 2026',
        items: [
          {
            id: 'ferry',
            type: 'ferry',
            title: 'Ferry',
            startsAt: '2026-05-20T09:00:00+02:00',
            origin: { name: 'Positano', city: 'Positano' },
            location: { name: 'Naples', city: 'Naples' },
            attachments: [],
          },
          {
            id: 'train',
            type: 'train',
            title: 'Frecciarossa 9512',
            startsAt: '2026-05-20T13:30:00+02:00',
            origin: { name: 'Naples', city: 'Naples' },
            location: { name: 'Florence', city: 'Florence' },
            attachments: [],
          },
        ],
      },
    });

    // Two lines each naming only a destination hide the connection; naming
    // both ends makes the chain obvious at a glance.
    expect(await screen.findByText('Positano → Naples')).toBeInTheDocument();
    expect(screen.getByText('Naples → Florence')).toBeInTheDocument();
  });
});
