import {
  liveItems,
  type Attachment,
  type DocType,
  type Itinerary,
  type ItemType,
} from './itinerary';

/**
 * The Documents lens: every file in a trip, grouped by what kind of document it
 * is rather than by when it happens.
 *
 * The timeline answers "what is happening today". This answers "where is my
 * boarding pass", which is the question actually being asked at a gate — and
 * the asker usually does not remember which day the app filed it under.
 */

export interface DocumentEntry {
  attachment: Attachment;
  docType: DocType;
  /** `null` for trip-level documents such as passports. */
  itemId: string | null;
  itemTitle: string | null;
  startsAt?: string;
  confirmationNumber?: string;
}

export interface DocumentGroup {
  docType: DocType;
  label: string;
  entries: DocumentEntry[];
}

/**
 * What kind of document an item of this type usually carries.
 *
 * Inference exists so that nothing has to be hand-categorised for the grouping
 * to be useful: categorising happens calmly while packing, retrieval happens
 * under stress, and the design must not depend on past-you having been diligent.
 */
const INFERRED: Record<ItemType, DocType> = {
  flight: 'boardingPass',
  lodging: 'confirmation',
  train: 'ticket',
  activity: 'ticket',
  poi: 'other',
  note: 'other',
  document: 'other',
};

export function inferDocType(itemType: ItemType): DocType {
  return INFERRED[itemType];
}

/** Display order and headings. Fixed, so the list never reshuffles under you. */
const GROUP_ORDER: { docType: DocType; label: string }[] = [
  { docType: 'boardingPass', label: 'Boarding passes' },
  { docType: 'ticket', label: 'Tickets & reservations' },
  { docType: 'confirmation', label: 'Confirmations' },
  { docType: 'voucher', label: 'Vouchers' },
  { docType: 'identity', label: 'Travel documents' },
  { docType: 'insurance', label: 'Insurance' },
  { docType: 'other', label: 'Other' },
];

/** Dated entries first in chronological order, then undated ones. */
function byWhenItHappens(a: DocumentEntry, b: DocumentEntry): number {
  const ta = a.startsAt ? Date.parse(a.startsAt) : Number.NaN;
  const tb = b.startsAt ? Date.parse(b.startsAt) : Number.NaN;
  const aDated = !Number.isNaN(ta);
  const bDated = !Number.isNaN(tb);
  if (aDated && bDated) return ta - tb;
  if (aDated) return -1;
  if (bDated) return 1;
  return 0;
}

export function groupDocuments(doc: Itinerary): DocumentGroup[] {
  const entries: DocumentEntry[] = [];

  for (const attachment of doc.attachments) {
    entries.push({
      attachment,
      docType: attachment.docType ?? 'other',
      itemId: null,
      itemTitle: null,
    });
  }

  for (const item of liveItems(doc)) {
    for (const attachment of item.attachments) {
      entries.push({
        attachment,
        docType: attachment.docType ?? inferDocType(item.type),
        itemId: item.id,
        itemTitle: item.title,
        startsAt: item.startsAt,
        confirmationNumber: item.confirmationNumber,
      });
    }
  }

  return GROUP_ORDER.map(({ docType, label }) => ({
    docType,
    label,
    entries: entries.filter((e) => e.docType === docType).sort(byWhenItHappens),
  })).filter((group) => group.entries.length > 0);
}
