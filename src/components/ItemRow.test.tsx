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
