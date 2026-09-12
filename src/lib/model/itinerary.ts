import { z } from 'zod';

/**
 * The shape of `itinerary.json` as it lives in a trip's Drive folder.
 *
 * Two properties of this schema are load-bearing beyond validation:
 *
 * 1. Objects are *loose* — unknown keys survive a parse. A newer build of the
 *    app may add fields; stripping them here would destroy that data the next
 *    time this build wrote the file back to Drive.
 * 2. Items carry `id`, `updatedAt` and a `deleted` tombstone even though v1 is
 *    single-writer. That is what lets a per-item merge be added later without a
 *    migration. See §6 and §9 of the design spec.
 */

export const ITEM_TYPES = [
  'flight',
  'lodging',
  'train',
  'activity',
  'poi',
  'note',
  'document',
] as const;

export const DOC_TYPES = [
  'boardingPass',
  'ticket',
  'confirmation',
  'voucher',
  'identity',
  'insurance',
  'other',
] as const;

export type ItemType = (typeof ITEM_TYPES)[number];
export type DocType = (typeof DOC_TYPES)[number];

const attachmentSchema = z.looseObject({
  driveFileId: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  /**
   * Optional on purpose. A file added to the Drive folder outside the app has
   * no docType, so the grouping in `documents.ts` infers one at read time
   * rather than trusting it to be present.
   */
  docType: z.enum(DOC_TYPES).optional(),
  label: z.string().optional(),
  size: z.number().nonnegative().optional(),
  md5Checksum: z.string().optional(),
});

const locationSchema = z.looseObject({
  name: z.string().min(1),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

const itemSchema = z.looseObject({
  id: z.string().min(1),
  type: z.enum(ITEM_TYPES),
  title: z.string(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  confirmationNumber: z.string().optional(),
  notes: z.string().optional(),
  location: locationSchema.optional(),
  attachments: z.array(attachmentSchema).default([]),
  updatedAt: z.string().optional(),
  updatedBy: z.string().optional(),
  deleted: z.boolean().default(false),
});

export const itinerarySchema = z.looseObject({
  schemaVersion: z.number().int().positive(),
  tripId: z.string().min(1),
  name: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  updatedAt: z.string().optional(),
  updatedBy: z.string().optional(),
  /** Trip-level documents belonging to no single event: passports, insurance. */
  attachments: z.array(attachmentSchema).default([]),
  items: z.array(itemSchema).default([]),
});

export type Attachment = z.infer<typeof attachmentSchema>;
export type ItineraryLocation = z.infer<typeof locationSchema>;
export type ItineraryItem = z.infer<typeof itemSchema>;
export type Itinerary = z.infer<typeof itinerarySchema>;

/** Parses and validates a document read from Drive. Throws `ZodError`. */
export function parseItinerary(raw: unknown): Itinerary {
  return itinerarySchema.parse(raw);
}

/** Items that have not been tombstoned. */
export function liveItems(doc: Itinerary): ItineraryItem[] {
  return doc.items.filter((item) => !item.deleted);
}
