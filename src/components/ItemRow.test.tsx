import { describe, expect, test } from 'vitest';
import { screen } from '@testing-library/react';
import { TimelineScreen } from '../routes/TimelineScreen';
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
