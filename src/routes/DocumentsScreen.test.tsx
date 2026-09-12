import { describe, expect, test } from 'vitest';
import { screen } from '@testing-library/react';
import { DocumentsScreen } from './DocumentsScreen';
import { renderLens } from '../test/renderApp';

const TRIP = {
  schemaVersion: 1,
  tripId: 't1',
  name: 'Japan 2026',
  attachments: [
    {
      driveFileId: 'passport',
      name: 'passport.pdf',
      mimeType: 'application/pdf',
      docType: 'identity',
      label: 'Carlos — passport',
    },
  ],
  items: [
    {
      id: 'flight',
      type: 'flight',
      title: 'AA123 SFO → NRT',
      startsAt: '2026-09-12T08:15:00-07:00',
      confirmationNumber: 'QX7R2M',
      attachments: [
        { driveFileId: 'bp', name: 'boarding.pdf', mimeType: 'application/pdf' },
      ],
    },
    {
      id: 'hotel',
      type: 'lodging',
      title: 'Park Hyatt Tokyo',
      startsAt: '2026-09-13T15:00:00+09:00',
      attachments: [
        { driveFileId: 'conf', name: 'hotel.pdf', mimeType: 'application/pdf' },
      ],
    },
  ],
};

const DOCUMENTS = [
  { id: 'bp', name: 'boarding.pdf' },
  { id: 'conf', name: 'hotel.pdf' },
  { id: 'passport', name: 'passport.pdf' },
];

describe('DocumentsScreen', () => {
  test('groups documents by what kind of document they are', async () => {
    await renderLens(<DocumentsScreen />, { itinerary: TRIP, documents: DOCUMENTS });

    // The whole point of this lens: reach a boarding pass without knowing
    // which day it belongs to.
    const travel = await screen.findByRole('heading', { name: /Flights, trains & ferries/ });
    expect(travel).toHaveTextContent('1');
    expect(screen.getByRole('heading', { name: /Hotels & stays/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Travel documents/ })).toBeInTheDocument();
  });

  test('infers the group from the parent item without any manual tagging', async () => {
    await renderLens(<DocumentsScreen />, { itinerary: TRIP, documents: DOCUMENTS });

    // Neither boarding.pdf nor hotel.pdf carries a docType; the flight and the
    // lodging item are what place them.
    expect(await screen.findByRole('heading', { name: /Flights, trains & ferries/ })).toBeInTheDocument();
    expect(screen.getByText('AA123 SFO → NRT')).toBeInTheDocument();
  });

  test('labels a document with the traveller it belongs to when one is given', async () => {
    await renderLens(<DocumentsScreen />, { itinerary: TRIP, documents: DOCUMENTS });

    expect(await screen.findByText('Carlos — passport')).toBeInTheDocument();
  });

  test('shows when a document is not yet saved on the device', async () => {
    await renderLens(<DocumentsScreen />, { itinerary: TRIP, documents: DOCUMENTS });

    await screen.findByRole('heading', { name: /Flights, trains & ferries/ });
    expect(screen.queryAllByLabelText('Saved on this device')).toHaveLength(0);
  });

  test('offers a download with the size it will cost before spending it', async () => {
    await renderLens(<DocumentsScreen />, { itinerary: TRIP, documents: DOCUMENTS });

    // Roaming data is the reason this is a decision rather than a background
    // behaviour, so the cost has to be visible up front.
    expect(await screen.findByText(/3 documents · about/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
  });

  test('says there is nothing to show rather than rendering an empty list', async () => {
    await renderLens(<DocumentsScreen />, {
      itinerary: { schemaVersion: 1, tripId: 't1', name: 'Empty', items: [] },
    });

    expect(await screen.findByText('No documents yet')).toBeInTheDocument();
  });
});
