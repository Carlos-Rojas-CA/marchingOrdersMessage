import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { attachmentBlob, TripStore } from './tripStore';
import { parseItinerary } from '../model/itinerary';

const doc = (name = 'Japan 2026') =>
  parseItinerary({ schemaVersion: 1, tripId: 't1', name, items: [] });

let store: TripStore;
let dbName: string;

beforeEach(async () => {
  // A distinct database per test: IndexedDB is global state, and a shared one
  // would leak records between tests in ways that hide real bugs.
  dbName = `test-${Math.random().toString(36).slice(2)}`;
  store = await TripStore.open(dbName);
});

afterEach(() => {
  store.close();
});

describe('trips', () => {
  test('round-trips a trip record', async () => {
    await store.putTrip({
      folderId: 'folder-1',
      name: 'Japan 2026',
      itineraryFileId: 'file-1',
      lastSyncedAt: null,
      canEdit: true,
      offlineEnabled: false,
    });

    expect((await store.getTrip('folder-1'))?.name).toBe('Japan 2026');
  });

  test('returns undefined for a trip that was never saved', async () => {
    expect(await store.getTrip('missing')).toBeUndefined();
  });

  test('lists every saved trip', async () => {
    await store.putTrip({
      folderId: 'a',
      name: 'A',
      itineraryFileId: null,
      lastSyncedAt: null,
      canEdit: true,
      offlineEnabled: false,
    });
    await store.putTrip({
      folderId: 'b',
      name: 'B',
      itineraryFileId: null,
      lastSyncedAt: null,
      canEdit: true,
      offlineEnabled: false,
    });

    expect((await store.listTrips()).map((t) => t.folderId).sort()).toEqual(['a', 'b']);
  });
});

describe('itineraries', () => {
  test('round-trips a parsed document with its Drive revision markers', async () => {
    await store.putItinerary({
      folderId: 'folder-1',
      doc: doc(),
      driveModifiedTime: '2026-09-12T10:00:00Z',
      driveVersion: '4',
    });

    const record = await store.getItinerary('folder-1');

    expect(record?.doc.name).toBe('Japan 2026');
    expect(record?.driveVersion).toBe('4');
  });

  test('overwrites the previous document for the same trip', async () => {
    const base = {
      folderId: 'folder-1',
      driveModifiedTime: null,
      driveVersion: null,
    };
    await store.putItinerary({ ...base, doc: doc('Old') });
    await store.putItinerary({ ...base, doc: doc('New') });

    expect((await store.getItinerary('folder-1'))?.doc.name).toBe('New');
  });
});

describe('attachments', () => {
  const meta = (driveFileId: string, size = 100) => ({
    driveFileId,
    folderId: 'folder-1',
    itemId: 'item-1',
    name: `${driveFileId}.pdf`,
    mimeType: 'application/pdf',
    size,
    md5Checksum: 'abc',
    bytes: null,
    cachedAt: null,
  });

  test('stores metadata without any bytes', async () => {
    await store.putAttachment(meta('f1'));

    const record = await store.getAttachment('f1');
    expect(record?.bytes).toBeNull();
    expect(record?.cachedAt).toBeNull();
  });

  test('caches bytes against an existing attachment', async () => {
    await store.putAttachment(meta('f1'));

    await store.cacheAttachmentBlob('f1', new Blob(['%PDF']), '2026-09-12T10:00:00Z');

    const record = await store.getAttachment('f1');
    expect(await attachmentBlob(record!)!.text()).toBe('%PDF');
    expect(record!.cachedAt).toBe('2026-09-12T10:00:00Z');
  });

  test('rebuilds the blob with the attachment’s own media type', async () => {
    // The viewer hands this blob straight to a PDF renderer or an <img>, so a
    // lost media type would leave it unable to tell what it is holding.
    await store.putAttachment(meta('f1'));
    await store.cacheAttachmentBlob('f1', new Blob(['%PDF']), 'now');

    expect(attachmentBlob((await store.getAttachment('f1'))!)!.type).toBe('application/pdf');
  });

  test('has no blob to offer for an attachment that was never downloaded', async () => {
    await store.putAttachment(meta('f1'));

    expect(attachmentBlob((await store.getAttachment('f1'))!)).toBeNull();
  });

  test('lists only the attachments belonging to one trip', async () => {
    await store.putAttachment(meta('f1'));
    await store.putAttachment({ ...meta('f2'), folderId: 'other-folder' });

    const listed = await store.listAttachments('folder-1');

    expect(listed.map((a) => a.driveFileId)).toEqual(['f1']);
  });

  test('totals the bytes actually cached, not the bytes merely known about', async () => {
    await store.putAttachment(meta('f1', 100));
    await store.putAttachment(meta('f2', 250));
    await store.cacheAttachmentBlob('f1', new Blob(['x'.repeat(100)]), 'now');

    // The offline toggle reports what is really occupying the device, so an
    // attachment that has only been listed must not count toward it.
    expect(await store.cachedBytes('folder-1')).toBe(100);
  });

  test('drops cached bytes for a trip while keeping the metadata', async () => {
    await store.putAttachment(meta('f1'));
    await store.cacheAttachmentBlob('f1', new Blob(['%PDF']), 'now');

    await store.evictTripBlobs('folder-1');

    const record = await store.getAttachment('f1');
    expect(record).toBeDefined();
    expect(record!.bytes).toBeNull();
    expect(await store.cachedBytes('folder-1')).toBe(0);
  });
});

describe('outbox', () => {
  test('returns queued writes in the order they were enqueued', async () => {
    await store.enqueue({ folderId: 'folder-1', kind: 'itinerary', payload: { v: 1 } });
    await store.enqueue({ folderId: 'folder-1', kind: 'itinerary', payload: { v: 2 } });

    const pending = await store.pending();

    expect(pending.map((e) => (e.payload as { v: number }).v)).toEqual([1, 2]);
  });

  test('starts an entry at zero attempts with no recorded error', async () => {
    await store.enqueue({ folderId: 'folder-1', kind: 'itinerary', payload: {} });

    const [entry] = await store.pending();

    expect(entry!.attempts).toBe(0);
    expect(entry!.lastError).toBeNull();
  });

  test('records a failure so backoff and the unsynced indicator have something to read', async () => {
    await store.enqueue({ folderId: 'folder-1', kind: 'itinerary', payload: {} });
    const [entry] = await store.pending();

    await store.recordFailure(entry!.id!, 'network down');

    const [updated] = await store.pending();
    expect(updated!.attempts).toBe(1);
    expect(updated!.lastError).toBe('network down');
  });

  test('removes an entry once it has been flushed', async () => {
    await store.enqueue({ folderId: 'folder-1', kind: 'itinerary', payload: {} });
    const [entry] = await store.pending();

    await store.dequeue(entry!.id!);

    expect(await store.pending()).toEqual([]);
  });
});

describe('persistence', () => {
  test('data survives closing and reopening the database', async () => {
    await store.putTrip({
      folderId: 'folder-1',
      name: 'Japan 2026',
      itineraryFileId: null,
      lastSyncedAt: null,
      canEdit: true,
      offlineEnabled: false,
    });
    store.close();

    const reopened = await TripStore.open(dbName);
    expect((await reopened.getTrip('folder-1'))?.name).toBe('Japan 2026');
    reopened.close();
  });
});
