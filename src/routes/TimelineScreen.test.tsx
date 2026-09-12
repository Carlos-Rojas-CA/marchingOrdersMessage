import { describe, expect, test } from 'vitest';
import { screen } from '@testing-library/react';
import { TimelineScreen } from './TimelineScreen';
import { renderLens } from '../test/renderApp';

const TRIP = {
  schemaVersion: 1,
  tripId: 't1',
  name: 'Japan 2026',
  items: [
    {
      id: 'hotel',
      type: 'lodging',
      title: 'Park Hyatt Tokyo',
      startsAt: '2026-09-13T18:00:00+09:00',
      confirmationNumber: 'PH-884213',
      attachments: [],
    },
    {
      id: 'flight',
      type: 'flight',
      title: 'AA123 SFO → NRT',
      startsAt: '2026-09-12T08:15:00-07:00',
      attachments: [],
    },
    { id: 'market', type: 'poi', title: 'Nishiki Market', attachments: [] },
  ],
};

describe('TimelineScreen', () => {
  test('shows a time as it reads at the place it happens', async () => {
    await renderLens(<TimelineScreen />, { itinerary: TRIP });

    // 18:00+09:00 is 6:00 PM to someone standing in Tokyo. Converting it into
    // the device's timezone would tell them the wrong hour for their check-in.
    expect(await screen.findByText('6:00 PM')).toBeInTheDocument();
  });

  test('groups items under the day they happen, in order', async () => {
    await renderLens(<TimelineScreen />, { itinerary: TRIP });

    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      'Sat, Sep 12',
      'Sun, Sep 13',
      'Unscheduled',
    ]);
  });

  test('keeps an item with no date rather than hiding it', async () => {
    await renderLens(<TimelineScreen />, { itinerary: TRIP });

    expect(await screen.findByText('Nishiki Market')).toBeInTheDocument();
  });

  test('shows a confirmation number where it can be selected', async () => {
    await renderLens(<TimelineScreen />, { itinerary: TRIP });

    expect(await screen.findByText('PH-884213')).toBeInTheDocument();
  });

  test('says the trip is empty rather than rendering nothing at all', async () => {
    await renderLens(<TimelineScreen />, {
      itinerary: { schemaVersion: 1, tripId: 't1', name: 'Empty', items: [] },
    });

    expect(await screen.findByText('This trip is empty')).toBeInTheDocument();
  });
});
