import { describe, expect, test } from 'vitest';
import { groupDocuments, inferDocType } from './documents';
import { parseItinerary, type Itinerary } from './itinerary';

function docWith(fields: Record<string, unknown>): Itinerary {
  return parseItinerary({ schemaVersion: 1, tripId: 't1', name: 'Trip', ...fields });
}

const file = (id: string, extra: Record<string, unknown> = {}) => ({
  driveFileId: id,
  name: `${id}.pdf`,
  mimeType: 'application/pdf',
  ...extra,
});

describe('inferDocType', () => {
  test('maps an item type to the kind of document it usually carries', () => {
    expect(inferDocType('flight')).toBe('boardingPass');
    expect(inferDocType('lodging')).toBe('confirmation');
    expect(inferDocType('train')).toBe('ticket');
    expect(inferDocType('activity')).toBe('ticket');
  });

  test('falls back to other for item types with no obvious document', () => {
    expect(inferDocType('note')).toBe('other');
    expect(inferDocType('poi')).toBe('other');
  });
});

describe('groupDocuments', () => {
  test('infers a missing docType from the parent item', () => {
    const groups = groupDocuments(
      docWith({
        items: [{ id: 'i1', type: 'flight', title: 'AA123', attachments: [file('bp')] }],
      }),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]!.docType).toBe('boardingPass');
    expect(groups[0]!.entries[0]!.attachment.driveFileId).toBe('bp');
  });

  test('prefers an explicit docType over what the parent item implies', () => {
    const groups = groupDocuments(
      docWith({
        items: [
          {
            id: 'i1',
            type: 'flight',
            title: 'AA123',
            attachments: [file('receipt', { docType: 'other' })],
          },
        ],
      }),
    );

    expect(groups.map((g) => g.docType)).toEqual(['other']);
  });

  test('includes trip-level documents that belong to no item', () => {
    const groups = groupDocuments(
      docWith({ attachments: [file('passport', { docType: 'identity' })] }),
    );

    expect(groups[0]!.docType).toBe('identity');
    expect(groups[0]!.entries[0]!.itemId).toBeNull();
  });

  test('returns groups in a fixed display order, not document order', () => {
    const groups = groupDocuments(
      docWith({
        attachments: [file('ins', { docType: 'insurance' })],
        items: [
          { id: 'i1', type: 'lodging', title: 'Hotel', attachments: [file('conf')] },
          { id: 'i2', type: 'flight', title: 'Flight', attachments: [file('bp')] },
        ],
      }),
    );

    expect(groups.map((g) => g.docType)).toEqual(['boardingPass', 'confirmation', 'insurance']);
  });

  test('omits groups that have no documents', () => {
    const groups = groupDocuments(
      docWith({ items: [{ id: 'i1', type: 'flight', title: 'AA123', attachments: [file('bp')] }] }),
    );

    expect(groups.map((g) => g.docType)).toEqual(['boardingPass']);
  });

  test('orders documents within a group by when their item happens', () => {
    const groups = groupDocuments(
      docWith({
        items: [
          {
            id: 'return',
            type: 'flight',
            title: 'Return',
            startsAt: '2026-09-24T10:00:00Z',
            attachments: [file('bp-return')],
          },
          {
            id: 'outbound',
            type: 'flight',
            title: 'Outbound',
            startsAt: '2026-09-12T08:00:00Z',
            attachments: [file('bp-outbound')],
          },
        ],
      }),
    );

    expect(groups[0]!.entries.map((e) => e.attachment.driveFileId)).toEqual([
      'bp-outbound',
      'bp-return',
    ]);
  });

  test('places undated documents after dated ones within a group', () => {
    const groups = groupDocuments(
      docWith({
        attachments: [file('spare', { docType: 'boardingPass' })],
        items: [
          {
            id: 'i1',
            type: 'flight',
            title: 'Outbound',
            startsAt: '2026-09-12T08:00:00Z',
            attachments: [file('bp')],
          },
        ],
      }),
    );

    expect(groups[0]!.entries.map((e) => e.attachment.driveFileId)).toEqual(['bp', 'spare']);
  });

  test('carries the context needed to label a document without re-querying the item', () => {
    const groups = groupDocuments(
      docWith({
        items: [
          {
            id: 'i1',
            type: 'flight',
            title: 'AA123 SFO→NRT',
            startsAt: '2026-09-12T08:00:00-07:00',
            confirmationNumber: 'ABC123',
            attachments: [file('bp', { label: 'Carlos — seat 14A' })],
          },
        ],
      }),
    );

    const entry = groups[0]!.entries[0]!;
    expect(entry.itemTitle).toBe('AA123 SFO→NRT');
    expect(entry.startsAt).toBe('2026-09-12T08:00:00-07:00');
    expect(entry.confirmationNumber).toBe('ABC123');
    expect(entry.attachment.label).toBe('Carlos — seat 14A');
  });

  test('omits documents attached to a tombstoned item', () => {
    const groups = groupDocuments(
      docWith({
        items: [
          { id: 'i1', type: 'flight', title: 'Cancelled', deleted: true, attachments: [file('bp')] },
        ],
      }),
    );

    expect(groups).toEqual([]);
  });
});
