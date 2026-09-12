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
  'train',
  'ferry',
  'bus',
  'car',
  'transit',
  'lodging',
  'activity',
  'poi',
  'note',
  'document',
] as const;

/**
 * How documents are grouped for retrieval.
 *
 * Grouped by the question being asked, not by what the operator calls the
 * paper: at a gate, a barrier or a terminal you want "the thing that gets me
 * on board", so flights, trains and ferries share one heading. A museum
 * booking is a different question and stays separate.
 */
export const DOC_TYPES = [
  'travel',
  'lodging',
  'ticket',
  'identity',
  'insurance',
  'other',
] as const;

/**
 * Kinds written before the regrouping above.
 *
 * A trip authored by an earlier build must not scatter its documents into
 * Other the next time it is opened.
 */
export type ItemType = (typeof ITEM_TYPES)[number];
export type DocType = (typeof DOC_TYPES)[number];

export const LEGACY_DOC_TYPES: Record<string, DocType> = {
  boardingPass: 'travel',
  confirmation: 'lodging',
  voucher: 'ticket',
};



const attachmentSchema = z.looseObject({
  driveFileId: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  /**
   * Optional on purpose. A file added to the Drive folder outside the app has
   * no docType, so the grouping in `documents.ts` infers one at read time
   * rather than trusting it to be present.
   */
  docType: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined
        ? undefined
        : ((LEGACY_DOC_TYPES[value] ?? value) as DocType),
    )
    .pipe(z.enum(DOC_TYPES).optional()),
  label: z.string().optional(),
  size: z.number().nonnegative().optional(),
  md5Checksum: z.string().optional(),
});

const locationSchema = z.looseObject({
  name: z.string().min(1),
  address: z.string().optional(),
  /** Rendered as a tel: link — the thing you need when the address has not helped. */
  phone: z.string().optional(),
  /** The city, which is what groups a trip into legs. */
  city: z.string().optional(),
  /** IANA zone, so times here can be composed without guessing at an offset. */
  timeZone: z.string().optional(),
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

/** An item as a caller supplies it, before the engine assigns identity. */
export type NewItem = Omit<ItineraryItem, 'id' | 'updatedAt' | 'deleted' | 'attachments'> & {
  attachments?: Attachment[];
};

/** Validates a single item. Throws `ZodError`. */
export function parseItem(raw: unknown): ItineraryItem {
  return itemSchema.parse(raw);
}

/** Parses and validates a document read from Drive. Throws `ZodError`. */
export function parseItinerary(raw: unknown): Itinerary {
  return itinerarySchema.parse(raw);
}

/** Key-sorted JSON, so two equal documents always serialise identically. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

/**
 * Whether two itineraries say the same thing.
 *
 * Used to tell a real conflict from Drive moving a file's revision counter for
 * its own reasons. Key order is not meaning, so it is normalised away.
 */
export function sameItinerary(a: Itinerary, b: Itinerary): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** Items that have not been tombstoned. */
export function liveItems(doc: Itinerary): ItineraryItem[] {
  return doc.items.filter((item) => !item.deleted);
}
