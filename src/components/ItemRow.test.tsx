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
