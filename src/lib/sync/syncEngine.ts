import type { DriveClient, DriveFile } from '../drive/types';
import {
  parseItem,
  parseItinerary,
  type DocType,
  type Itinerary,
  type ItineraryItem,
  type NewItem,
} from '../model/itinerary';
import { inferDocType } from '../model/documents';
import type { AttachmentRecord, TripStore } from '../store/tripStore';

/**
 * Reconciles a trip's Drive folder with the local store.
 *
 * The only module that knows about both sides. Everything above it reads the
 * store; everything below it is either pure model code or raw Drive access.
 */

export const ITINERARY_FILENAME = 'itinerary.json';

/** Someone else wrote the file since we last read it. Never overwrite blindly. */
export class ConflictError extends Error {
  constructor(readonly folderId: string) {
    super('This trip was changed somewhere else since it was last loaded.');
    this.name = 'ConflictError';
  }
}

export type PullStatus =
  | 'updated'
  | 'unchanged'
  | 'no-itinerary'
  | 'invalid-itinerary';

export interface PullResult {
  status: PullStatus;
  canEdit: boolean;
}

export interface DownloadProgress {
  completed: number;
  total: number;
}

export interface DownloadResult {
  cached: number;
  /** File names that could not be downloaded; the rest still were. */
  failed: string[];
}

export class SyncEngine {
  constructor(
    private readonly drive: DriveClient,
    private readonly store: TripStore,
  ) {}

  /** One chain of pending work per trip. See `#serial`. */
  #queues = new Map<string, Promise<unknown>>();

  /**
   * Runs work for one trip strictly after anything already running for it.
   *
   * Every write is a read-modify-write against a Drive revision, so two of them
   * overlapping means the second checks a revision the first has already
   * superseded and reports a conflict that never happened. Double-tapping save
   * is enough to cause it, and so is saving while a background refresh is still
   * in flight.
   *
   * Serialising here rather than retrying on conflict keeps the conflict error
   * meaningful: after this, it can only mean a genuine second writer.
   */
  async #serial<T>(folderId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.#queues.get(folderId) ?? Promise.resolve();
    // Failures must not poison the queue for everything behind them.
    const mine = previous.catch(() => {}).then(work);
    const settled = mine.catch(() => {});

    this.#queues.set(folderId, settled);
    void settled.then(() => {
      // Drop the entry only if nothing queued behind this one.
      if (this.#queues.get(folderId) === settled) this.#queues.delete(folderId);
    });

    return await mine;
  }

  /** Who the current credentials belong to. */
  async currentUser() {
    return await this.drive.getCurrentUser();
  }

  /**
   * Creates a new trip: a Drive folder plus an empty itinerary inside it.
   *
   * This is the one entry point that cannot be blocked by how `drive.file`
   * grants work for picked folders — a folder the app created is always its
   * own to read and write. Returns the folder id, which is the trip's identity
   * everywhere else in the app.
   */
  async createTrip(
    name: string,
    dates: { startDate?: string; endDate?: string } = {},
  ): Promise<string> {
    const folder = await this.drive.createFolder(name);
    const doc = parseItinerary({
      schemaVersion: 1,
      tripId: crypto.randomUUID(),
      name,
      ...(dates.startDate ? { startDate: dates.startDate } : {}),
      ...(dates.endDate ? { endDate: dates.endDate } : {}),
      updatedAt: new Date().toISOString(),
      items: [],
    });
    const file = await this.drive.createJson(folder.id, ITINERARY_FILENAME, doc);

    // Written locally straight away: the UI should be able to render the new
    // trip without a round trip back through Drive.
    await this.store.putItinerary({
      folderId: folder.id,
      doc,
      driveModifiedTime: file.modifiedTime ?? null,
      driveVersion: file.version ?? null,
    });
    await this.#recordTrip(folder.id, name, file, true);

    return folder.id;
  }

  /**
   * Refreshes metadata for one trip.
   *
   * Costs one folder listing plus, at most, one small JSON download. Attachment
   * bytes are deliberately never fetched here — a refresh has to stay cheap
   * enough to run on an app open over a roaming connection.
   */
  async pull(folderId: string): Promise<PullResult> {
    return await this.#serial(folderId, () => this.#pull(folderId));
  }

  async #pull(folderId: string): Promise<PullResult> {
    const files = await this.drive.listFolder(folderId);
    const itineraryFile = files.find((f) => f.name === ITINERARY_FILENAME);
    const canEdit = itineraryFile?.capabilities?.canEdit ?? true;

    await this.#syncAttachmentMetadata(folderId, files);

    if (!itineraryFile) {
      return { status: 'no-itinerary', canEdit };
    }

    const cached = await this.store.getItinerary(folderId);
    const unchanged =
      cached !== undefined &&
      cached.driveModifiedTime !== null &&
      cached.driveModifiedTime === (itineraryFile.modifiedTime ?? null);

    if (unchanged) {
      await this.#recordTrip(folderId, cached.doc.name, itineraryFile, canEdit);
      return { status: 'unchanged', canEdit };
    }

    let doc: Itinerary;
    try {
      doc = parseItinerary(JSON.parse(await this.drive.downloadText(itineraryFile.id)));
    } catch {
      // Whatever is in Drive is unreadable. Keeping the last good copy is far
      // better than blanking a trip that is currently underway.
      return { status: 'invalid-itinerary', canEdit };
    }

    await this.store.putItinerary({
      folderId,
      doc,
      driveModifiedTime: itineraryFile.modifiedTime ?? null,
      driveVersion: itineraryFile.version ?? null,
    });
    await this.#recordTrip(folderId, doc.name, itineraryFile, canEdit);

    return { status: 'updated', canEdit };
  }

  async #recordTrip(
    folderId: string,
    name: string,
    itineraryFile: DriveFile,
    canEdit: boolean,
  ): Promise<void> {
    const existing = await this.store.getTrip(folderId);
    await this.store.putTrip({
      folderId,
      name,
      itineraryFileId: itineraryFile.id,
      lastSyncedAt: new Date().toISOString(),
      canEdit,
      offlineEnabled: existing?.offlineEnabled ?? false,
    });
  }

  /**
   * Upserts metadata for every non-itinerary file, preserving any bytes already
   * cached so a refresh never silently discards an offline copy.
   */
  async #syncAttachmentMetadata(folderId: string, files: DriveFile[]): Promise<void> {
    for (const file of files) {
      if (file.name === ITINERARY_FILENAME) continue;
      const existing = await this.store.getAttachment(file.id);
      const checksum = file.md5Checksum ?? null;
      const stale = existing !== undefined && existing.md5Checksum !== checksum;

      await this.store.putAttachment({
        driveFileId: file.id,
        folderId,
        itemId: file.appProperties?.itemId ?? existing?.itemId ?? null,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size ?? existing?.size ?? 0,
        md5Checksum: checksum,
        // Bytes that no longer match what Drive holds are dropped rather than
        // shown: a stale boarding pass is worse than an absent one.
        bytes: stale ? null : (existing?.bytes ?? null),
        cachedAt: stale ? null : (existing?.cachedAt ?? null),
      });
    }
  }

  /**
   * Writes the itinerary back, refusing if Drive moved underneath us.
   *
   * Compare-and-swap rather than a lock. v1 has a single writer enforced by
   * Drive permissions, so this should never fire — but if it does, preserving
   * the other party's data beats preserving ours.
   */
  async push(folderId: string, doc: Itinerary): Promise<void> {
    return await this.#serial(folderId, () => this.#push(folderId, doc));
  }

  async #push(folderId: string, doc: Itinerary): Promise<void> {
    const trip = await this.store.getTrip(folderId);
    const cached = await this.store.getItinerary(folderId);
    if (!trip?.itineraryFileId) {
      throw new Error(`No itinerary file known for trip ${folderId}`);
    }

    const current = await this.drive.getFile(trip.itineraryFileId);
    const expected = cached?.driveVersion ?? null;
    if (expected !== null && current.version !== undefined && current.version !== expected) {
      throw new ConflictError(folderId);
    }

    const written = await this.drive.updateJson(trip.itineraryFileId, doc);
    await this.store.putItinerary({
      folderId,
      doc,
      driveModifiedTime: written.modifiedTime ?? null,
      driveVersion: written.version ?? null,
    });
  }

  /**
   * Applies a change to the trip's items and pushes the result.
   *
   * One place for the read-modify-write so every editing operation stamps
   * `updatedAt` the same way and cannot forget to.
   */
  async #mutateItems(
    folderId: string,
    change: (items: ItineraryItem[]) => ItineraryItem[],
  ): Promise<void> {
    // The whole read-modify-write runs as one queued unit: reading the current
    // items and writing them back must not be separable, or two edits could
    // both read the same state and one would be lost.
    await this.#serial(folderId, async () => {
      const record = await this.store.getItinerary(folderId);
      if (!record) throw new Error(`Trip ${folderId} is not loaded`);

      await this.#push(folderId, {
        ...record.doc,
        items: change(record.doc.items),
        updatedAt: new Date().toISOString(),
      });
    });
  }

  /** Adds an item, returning the id it was given. */
  async addItem(folderId: string, item: NewItem): Promise<string> {
    const id = crypto.randomUUID();

    await this.#mutateItems(folderId, (items) => [
      ...items,
      parseItem({
        ...item,
        id,
        attachments: item.attachments ?? [],
        updatedAt: new Date().toISOString(),
        deleted: false,
      }),
    ]);

    return id;
  }

  /** Edits one item, leaving fields the caller did not mention alone. */
  async updateItem(
    folderId: string,
    itemId: string,
    patch: Partial<ItineraryItem>,
  ): Promise<void> {
    const record = await this.store.getItinerary(folderId);
    if (!record?.doc.items.some((i) => i.id === itemId)) {
      throw new Error(`No item "${itemId}" in this trip`);
    }

    await this.#mutateItems(folderId, (items) =>
      items.map((item) =>
        item.id === itemId
          ? parseItem({ ...item, ...patch, id: itemId, updatedAt: new Date().toISOString() })
          : item,
      ),
    );
  }

  /**
   * Removes an item by tombstoning it.
   *
   * The row survives so that a later merge can tell "deleted" from "never
   * existed" — which is the whole reason the schema carries a deleted flag
   * rather than splicing rows out of the array.
   */
  async removeItem(folderId: string, itemId: string): Promise<void> {
    await this.updateItem(folderId, itemId, { deleted: true });
  }

  /**
   * Uploads a file and attaches it to an item — or to the trip itself when
   * `itemId` is null, which is where passports and insurance belong.
   *
   * The document kind is inferred from the item's type unless one is chosen,
   * so the Documents lens groups correctly without anything being tagged by
   * hand.
   */
  async attachDocument(
    folderId: string,
    itemId: string | null,
    file: File,
    options: { docType?: DocType; label?: string } = {},
  ): Promise<void> {
    const existing = await this.store.getItinerary(folderId);
    if (!existing) throw new Error(`Trip ${folderId} is not loaded`);

    const item = itemId === null ? null : existing.doc.items.find((i) => i.id === itemId);
    if (itemId !== null && !item) {
      throw new Error(`No item "${itemId}" in this trip`);
    }

    // Uploaded before taking the lock: the bytes can be large, and holding up
    // every other operation on the trip for the duration would be worse than
    // the small chance of the upload succeeding and the write failing.
    const uploaded = await this.drive.uploadFile({
      folderId,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      content: file,
      // Redundant with itinerary.json on purpose: if that file is ever lost,
      // the trip can be rebuilt from the folder's contents alone.
      appProperties: itemId === null ? { tripLevel: 'true' } : { itemId },
    });

    const attachment = {
      driveFileId: uploaded.id,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      docType: options.docType ?? (item ? inferDocType(item.type) : 'other'),
      ...(options.label ? { label: options.label } : {}),
      size: file.size,
    };

    const now = new Date().toISOString();

    if (item === null) {
      // Trip-level attachment: re-read inside the lock so a concurrent edit is
      // not overwritten by state captured before the upload began.
      await this.#serial(folderId, async () => {
        const current = await this.store.getItinerary(folderId);
        if (!current) throw new Error(`Trip ${folderId} is not loaded`);
        await this.#push(folderId, {
          ...current.doc,
          attachments: [...current.doc.attachments, attachment],
          updatedAt: now,
        });
      });
    } else {
      await this.#mutateItems(folderId, (items) =>
        items.map((candidate) =>
          candidate.id === itemId
            ? {
                ...candidate,
                attachments: [...candidate.attachments, attachment],
                updatedAt: now,
              }
            : candidate,
        ),
      );
    }

    // The bytes are already in hand, so cache them rather than making the user
    // download what they just uploaded.
    await this.store.putAttachment({
      driveFileId: uploaded.id,
      folderId,
      itemId,
      name: file.name,
      mimeType: attachment.mimeType,
      size: file.size,
      md5Checksum: uploaded.md5Checksum ?? null,
      bytes: await file.arrayBuffer(),
      cachedAt: now,
    });
  }

  /**
   * Replaces a trip's itinerary wholesale, as when pasting one in.
   *
   * Validates before writing anything, so a malformed paste cannot damage a
   * trip. The name stays whatever the Drive folder is called: the folder is the
   * unit of sharing, and letting a paste rename one but not the other would
   * split them apart.
   */
  async replaceItinerary(folderId: string, raw: unknown): Promise<void> {
    const parsed = parseItinerary(raw);

    // Reconcile first when the trip is not held locally — reached by deep link
    // or by reloading on the import screen. This is not only self-healing: an
    // overwrite needs a known Drive revision to compare against, and without a
    // pull there is no baseline for the compare-and-swap in `push`.
    if (!(await this.store.getTrip(folderId))) {
      await this.pull(folderId);
    }
    const trip = await this.store.getTrip(folderId);

    await this.push(folderId, {
      ...parsed,
      name: trip?.name ?? parsed.name,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Downloads every document in a trip for offline use.
   *
   * Per-file and fault-tolerant: an interruption or a single failure leaves the
   * documents that did arrive cached and usable, and names the ones that did
   * not. All-or-nothing would throw away a mostly-finished download at exactly
   * the moment connectivity is worst.
   */
  async downloadForOffline(
    folderId: string,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<DownloadResult> {
    const attachments = await this.store.listAttachments(folderId);
    const total = attachments.length;
    const failed: string[] = [];
    let cached = 0;
    let completed = 0;

    for (const attachment of attachments) {
      if (this.#isCurrent(attachment)) {
        cached++;
        completed++;
        onProgress?.({ completed, total });
        continue;
      }

      try {
        const blob = await this.drive.downloadFile(attachment.driveFileId);
        await this.store.cacheAttachmentBlob(
          attachment.driveFileId,
          blob,
          new Date().toISOString(),
        );
        cached++;
      } catch {
        failed.push(attachment.name);
      }
      completed++;
      onProgress?.({ completed, total });
    }

    if (cached > 0) await this.#setOfflineEnabled(folderId, true);

    return { cached, failed };
  }

  /** Cached, and matching what Drive currently holds. */
  #isCurrent(attachment: AttachmentRecord): boolean {
    return attachment.bytes !== null && attachment.cachedAt !== null;
  }

  async evictOffline(folderId: string): Promise<void> {
    await this.store.evictTripBlobs(folderId);
    await this.#setOfflineEnabled(folderId, false);
  }

  async #setOfflineEnabled(folderId: string, offlineEnabled: boolean): Promise<void> {
    const trip = await this.store.getTrip(folderId);
    if (!trip) return;
    await this.store.putTrip({ ...trip, offlineEnabled });
  }
}
