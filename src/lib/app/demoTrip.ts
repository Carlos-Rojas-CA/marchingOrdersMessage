import { FakeDriveClient } from '../drive/fakeDriveClient';
import { ITINERARY_FILENAME } from '../sync/syncEngine';

/**
 * A sample trip backed by the in-memory Drive.
 *
 * Lets the whole app be run and inspected with no Google credentials, no
 * network and no quota — the same fake the sync tests use. Enabled with
 * `VITE_DEMO=1`, never in a normal build.
 */
const DEMO_FOLDER = 'demo-folder';

const ITINERARY = {
  schemaVersion: 1,
  tripId: 'demo-trip',
  name: 'Japan 2026',
  startDate: '2026-09-12',
  endDate: '2026-09-18',
  updatedAt: '2026-09-01T12:00:00Z',
  attachments: [
    {
      driveFileId: 'demo-passport',
      name: 'passport-carlos.pdf',
      mimeType: 'application/pdf',
      docType: 'identity',
      label: 'Carlos — passport',
    },
  ],
  items: [
    {
      id: 'flight-out',
      type: 'flight',
      title: 'AA123 SFO → NRT',
      startsAt: '2026-09-12T08:15:00-07:00',
      endsAt: '2026-09-13T13:40:00+09:00',
      confirmationNumber: 'QX7R2M',
      location: {
        name: 'San Francisco International Airport',
        address: 'San Francisco, CA 94128',
        lat: 37.6213,
        lng: -122.379,
      },
      attachments: [
        {
          driveFileId: 'demo-bp-1',
          name: 'boarding-carlos.pdf',
          mimeType: 'application/pdf',
          label: 'Carlos — seat 14A',
        },
      ],
    },
    {
      id: 'hotel',
      type: 'lodging',
      title: 'Park Hyatt Tokyo',
      startsAt: '2026-09-13T15:00:00+09:00',
      endsAt: '2026-09-16T11:00:00+09:00',
      confirmationNumber: 'PH-884213',
      notes: 'Late check-in arranged.',
      location: {
        name: 'Park Hyatt Tokyo',
        address: '3-7-1-2 Nishishinjuku, Shinjuku City, Tokyo',
        lat: 35.6855,
        lng: 139.6917,
      },
      attachments: [
        {
          driveFileId: 'demo-hotel',
          name: 'hotel-confirmation.pdf',
          mimeType: 'application/pdf',
        },
      ],
    },
    {
      id: 'temple',
      type: 'activity',
      title: 'Sensō-ji Temple',
      startsAt: '2026-09-14T10:00:00+09:00',
      endsAt: '2026-09-14T12:00:00+09:00',
      location: {
        name: 'Sensō-ji',
        address: '2 Chome-3-1 Asakusa, Taito City, Tokyo',
        lat: 35.7148,
        lng: 139.7967,
      },
      attachments: [],
    },
    {
      id: 'shinkansen',
      type: 'train',
      title: 'Shinkansen Tokyo → Kyoto',
      startsAt: '2026-09-16T13:30:00+09:00',
      endsAt: '2026-09-16T15:49:00+09:00',
      confirmationNumber: 'JR-5521',
      attachments: [
        {
          driveFileId: 'demo-train',
          name: 'shinkansen-ticket.pdf',
          mimeType: 'application/pdf',
        },
      ],
    },
    {
      id: 'market',
      type: 'poi',
      title: 'Nishiki Market',
      notes: 'No fixed time — go when we feel like it.',
      location: { name: 'Nishiki Market', address: 'Nakagyo Ward, Kyoto' },
      attachments: [],
    },
  ],
};

/** A one-page PDF, small enough to inline and real enough for the renderer. */
function samplePdf(title: string): Blob {
  const content = `BT /F1 24 Tf 60 700 Td (${title}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

/** Rewrites the placeholder ids above to the ids Drive actually handed back. */
function withRealFileIds(ids: Map<string, string>): unknown {
  const remap = (attachment: { driveFileId: string }) => ({
    ...attachment,
    driveFileId: ids.get(attachment.driveFileId) ?? attachment.driveFileId,
  });

  return {
    ...ITINERARY,
    attachments: ITINERARY.attachments.map(remap),
    items: ITINERARY.items.map((item) => ({
      ...item,
      attachments: item.attachments.map(remap),
    })),
  };
}

export async function createDemoDrive(): Promise<FakeDriveClient> {
  const drive = new FakeDriveClient();

  const documents: [string, string, string][] = [
    ['demo-bp-1', 'boarding-carlos.pdf', 'Boarding pass — Carlos, AA123, seat 14A'],
    ['demo-hotel', 'hotel-confirmation.pdf', 'Park Hyatt Tokyo — confirmation PH-884213'],
    ['demo-train', 'shinkansen-ticket.pdf', 'Shinkansen Tokyo to Kyoto — JR-5521'],
    ['demo-passport', 'passport-carlos.pdf', 'Passport scan — Carlos'],
  ];

  // Files go in first so the itinerary can reference the ids Drive assigned,
  // exactly as it would after a real upload.
  const ids = new Map<string, string>();
  for (const [placeholder, name, title] of documents) {
    const file = await drive.uploadFile({
      folderId: DEMO_FOLDER,
      name,
      mimeType: 'application/pdf',
      content: samplePdf(title),
    });
    ids.set(placeholder, file.id);
  }

  drive.seedJson(DEMO_FOLDER, ITINERARY_FILENAME, withRealFileIds(ids));

  return drive;
}

export const DEMO_FOLDER_ID = DEMO_FOLDER;
