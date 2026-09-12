import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Itinerary } from '../model/itinerary';

/**
 * Local storage for everything the UI renders.
 *
 * This is the source of truth for reads. Drive is a peer that gets reconciled
 * with it in the background — never something a render or an edit waits on.
 *
 * Trips are keyed by their Drive folder id throughout. That is the identifier
 * sharing actually hinges on, and it stays stable even if a trip is renamed.
 */

export interface TripRecord {
  folderId: string;
  name: string;
  itineraryFileId: string | null;
  lastSyncedAt: string | null;
  /** Mirrors Drive's `capabilities.canEdit`: false for a Viewer. */
  canEdit: boolean;
  offlineEnabled: boolean;
}

export interface ItineraryRecord {
  folderId: string;
  doc: Itinerary;
  /** Drive's revision markers, for change and conflict detection. */
  driveModifiedTime: string | null;
  driveVersion: string | null;
}

export interface AttachmentRecord {
  driveFileId: string;
  folderId: string;
  /** `null` for trip-level documents such as passports. */
  itemId: string | null;
  name: string;
  mimeType: string;
  size: number;
  md5Checksum: string | null;
  /**
   * `null` until the bytes have actually been downloaded for offline use.
   *
   * Held as an ArrayBuffer rather than a Blob deliberately. Safari has a long
   * history of bugs storing Blobs in IndexedDB, and iOS is the primary target —
   * the one place a cached boarding pass absolutely must survive. Buffers round
   * trip everywhere; `attachmentBlob` rebuilds the Blob on the way out.
   */
  bytes: ArrayBuffer | null;
  cachedAt: string | null;
}

/**
 * Rebuilds a usable Blob from a cached attachment, or `null` if its bytes were
 * never downloaded. The media type is restored from the record, because the
 * viewer hands this straight to a PDF renderer or an `<img>`.
 */
export function attachmentBlob(record: AttachmentRecord): Blob | null {
  if (!record.bytes) return null;
  return new Blob([record.bytes], { type: record.mimeType });
}

export interface OutboxEntry {
  id?: number;
  folderId: string;
  kind: 'itinerary';
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

interface Schema extends DBSchema {
  /** Small key/value corner: which Google account this data belongs to. */
  meta: { key: string; value: { key: string; value: string } };
  trips: { key: string; value: TripRecord };
  itineraries: { key: string; value: ItineraryRecord };
  attachments: {
    key: string;
    value: AttachmentRecord;
    indexes: { byFolder: string };
  };
  outbox: {
    key: number;
    value: OutboxEntry;
    indexes: { byFolder: string };
  };
}

export class TripStore {
  private constructor(private readonly db: IDBPDatabase<Schema>) {}

  static async open(name = 'marching-orders'): Promise<TripStore> {
    const db = await openDB<Schema>(name, 2, {
      // Versioned rather than recreated: a schema change must never be a
      // reason for someone's downloaded documents to disappear.
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          database.createObjectStore('trips', { keyPath: 'folderId' });
          database.createObjectStore('itineraries', { keyPath: 'folderId' });

          const attachments = database.createObjectStore('attachments', {
            keyPath: 'driveFileId',
          });
          attachments.createIndex('byFolder', 'folderId');

          const outbox = database.createObjectStore('outbox', {
            keyPath: 'id',
            autoIncrement: true,
          });
          outbox.createIndex('byFolder', 'folderId');
        }
        if (oldVersion < 2) {
          database.createObjectStore('meta', { keyPath: 'key' });
        }
      },
    });
    return new TripStore(db);
  }

  // — account identity —

  /** The Google account whose Drive this local data mirrors. */
  async getAccount(): Promise<string | undefined> {
    return (await this.db.get('meta', 'account'))?.value;
  }

  async setAccount(email: string): Promise<void> {
    await this.db.put('meta', { key: 'account', value: email });
  }

  /**
   * Wipes everything held locally.
   *
   * Used when signing out or switching accounts: trips belonging to one Google
   * account are unreadable to another, so leaving them would show a list of
   * trips that mysteriously refuse to open.
   */
  async clearAll(): Promise<void> {
    const tx = this.db.transaction(
      ['trips', 'itineraries', 'attachments', 'outbox', 'meta'],
      'readwrite',
    );
    await Promise.all([
      tx.objectStore('trips').clear(),
      tx.objectStore('itineraries').clear(),
      tx.objectStore('attachments').clear(),
      tx.objectStore('outbox').clear(),
      tx.objectStore('meta').clear(),
      tx.done,
    ]);
  }

  close(): void {
    this.db.close();
  }

  // — trips —

  async putTrip(trip: TripRecord): Promise<void> {
    await this.db.put('trips', trip);
  }

  async getTrip(folderId: string): Promise<TripRecord | undefined> {
    return await this.db.get('trips', folderId);
  }

  async listTrips(): Promise<TripRecord[]> {
    return await this.db.getAll('trips');
  }

  // — itineraries —

  async putItinerary(record: ItineraryRecord): Promise<void> {
    await this.db.put('itineraries', record);
  }

  async getItinerary(folderId: string): Promise<ItineraryRecord | undefined> {
    return await this.db.get('itineraries', folderId);
  }

  // — attachments —

  async putAttachment(record: AttachmentRecord): Promise<void> {
    await this.db.put('attachments', record);
  }

  async getAttachment(driveFileId: string): Promise<AttachmentRecord | undefined> {
    return await this.db.get('attachments', driveFileId);
  }

  async listAttachments(folderId: string): Promise<AttachmentRecord[]> {
    return await this.db.getAllFromIndex('attachments', 'byFolder', folderId);
  }

  /** Takes a Blob because that is what a download produces; stores buffers. */
  async cacheAttachmentBlob(
    driveFileId: string,
    blob: Blob,
    cachedAt: string,
  ): Promise<void> {
    const existing = await this.getAttachment(driveFileId);
    if (!existing) throw new Error(`Unknown attachment: ${driveFileId}`);
    const bytes = await blob.arrayBuffer();
    await this.putAttachment({ ...existing, bytes, cachedAt, size: bytes.byteLength });
  }

  /**
   * Bytes actually resident on the device for a trip.
   *
   * Counts cached blobs only. The offline toggle reports this to the user, so
   * including attachments that are merely known about would overstate what is
   * occupying their phone.
   */
  async cachedBytes(folderId: string): Promise<number> {
    const attachments = await this.listAttachments(folderId);
    return attachments.reduce((total, a) => total + (a.bytes?.byteLength ?? 0), 0);
  }

  /**
   * Forgets one trip entirely, leaving every other trip untouched.
   *
   * Scoped by folder rather than clearing stores wholesale, because the
   * failure that would hurt here is over-deleting someone's other trips.
   */
  async removeTrip(folderId: string): Promise<void> {
    const attachments = await this.listAttachments(folderId);
    const queued = await this.db.getAllFromIndex('outbox', 'byFolder', folderId);

    const tx = this.db.transaction(
      ['trips', 'itineraries', 'attachments', 'outbox'],
      'readwrite',
    );
    await Promise.all([
      tx.objectStore('trips').delete(folderId),
      tx.objectStore('itineraries').delete(folderId),
      ...attachments.map((a) => tx.objectStore('attachments').delete(a.driveFileId)),
      ...queued.map((entry) => tx.objectStore('outbox').delete(entry.id!)),
      tx.done,
    ]);
  }

  /** Frees a trip's offline bytes while keeping enough to re-download later. */
  async evictTripBlobs(folderId: string): Promise<void> {
    const attachments = await this.listAttachments(folderId);
    const tx = this.db.transaction('attachments', 'readwrite');
    await Promise.all([
      ...attachments.map((a) => tx.store.put({ ...a, bytes: null, cachedAt: null })),
      tx.done,
    ]);
  }

  // — outbox —

  async enqueue(
    entry: Omit<OutboxEntry, 'id' | 'createdAt' | 'attempts' | 'lastError'>,
  ): Promise<number> {
    return await this.db.add('outbox', {
      ...entry,
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    } as OutboxEntry);
  }

  /** Queued writes, oldest first — autoIncrement keys preserve enqueue order. */
  async pending(): Promise<OutboxEntry[]> {
    return await this.db.getAll('outbox');
  }

  async recordFailure(id: number, error: string): Promise<void> {
    const entry = await this.db.get('outbox', id);
    if (!entry) return;
    await this.db.put('outbox', {
      ...entry,
      attempts: entry.attempts + 1,
      lastError: error,
    });
  }

  async dequeue(id: number): Promise<void> {
    await this.db.delete('outbox', id);
  }
}
