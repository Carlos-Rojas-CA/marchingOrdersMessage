import { describe, expect, test } from 'vitest';
import { screen } from '@testing-library/react';
import { DocumentViewerScreen } from './DocumentViewerScreen';
import { renderViewer } from '../test/renderApp';

const TRIP = {
  schemaVersion: 1,
  tripId: 't1',
  name: 'Japan 2026',
  items: [
    {
      id: 'flight',
      type: 'flight',
      title: 'AA123 SFO → NRT',
      startsAt: '2026-09-12T08:15:00-07:00',
      confirmationNumber: 'QX7R2M',
      attachments: [
        {
          driveFileId: 'bp1',
          name: 'boarding-carlos.pdf',
          mimeType: 'application/pdf',
          label: 'Carlos — seat 14A',
        },
        {
          driveFileId: 'bp2',
          name: 'boarding-sam.pdf',
          mimeType: 'application/pdf',
          label: 'Sam — seat 14B',
        },
      ],
    },
  ],
};

const DOCUMENTS = [
  { id: 'bp1', name: 'boarding-carlos.pdf' },
  { id: 'bp2', name: 'boarding-sam.pdf' },
];

describe('DocumentViewerScreen', () => {
  test('lifts the confirmation number out of the document', async () => {
    await renderViewer(<DocumentViewerScreen />, {
      itinerary: TRIP,
      documents: DOCUMENTS,
      fileName: 'boarding-carlos.pdf',
    });

    // Reading a code aloud or typing it into a kiosk should never require
    // pinch-zooming into a PDF.
    expect(await screen.findByText('QX7R2M')).toBeInTheDocument();
  });

  test('names the traveller the document belongs to', async () => {
    await renderViewer(<DocumentViewerScreen />, {
      itinerary: TRIP,
      documents: DOCUMENTS,
      fileName: 'boarding-carlos.pdf',
    });

    expect(await screen.findByText('Carlos — seat 14A')).toBeInTheDocument();
  });

  test('offers to move between the boarding passes for the same flight', async () => {
    await renderViewer(<DocumentViewerScreen />, {
      itinerary: TRIP,
      documents: DOCUMENTS,
      fileName: 'boarding-carlos.pdf',
    });

    // Three passes for three travellers should be swipes, not three round
    // trips back through a list.
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /next/i })).toBeInTheDocument();
  });

  test('says plainly when a document has not been downloaded', async () => {
    await renderViewer(<DocumentViewerScreen />, {
      itinerary: TRIP,
      documents: DOCUMENTS,
      fileName: 'boarding-carlos.pdf',
    });

    // A blank frame is the worst possible answer at a gate; naming the file
    // and the reason is the least the screen can do.
    expect(
      await screen.findByText(/boarding-carlos\.pdf is not saved on this device/),
    ).toBeInTheDocument();
  });
});
