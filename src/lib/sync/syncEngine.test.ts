import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { FakeDriveClient } from '../drive/fakeDriveClient';
import { TripStore } from '../store/tripStore';
import { ConflictError, ITINERARY_FILENAME, SyncEngine } from './syncEngine';
import { parseItinerary } from '../model/itinerary';

const ITINERARY = {
  schemaVersion: 1,
  tripId: 't1',
  name: 'Japan 2026',
  items: [{ id: 'i1', type: 'flight', title: 'AA123' }],
};

let drive: FakeDriveClient;
let store: TripStore;
let sync: SyncEngine;

beforeEach(async () => {
  drive = new FakeDriveClient();
  store = await TripStore.open(`test-${Math.random().toString(36).slice(2)}`);
  sync = new SyncEngine(drive, store);
});

afterEach(() => store.close());

describe('pull', () => {
  test('stores the itinerary it finds in the folder', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);

    await sync.pull('folder-1');

    expect((await store.getItinerary('folder-1'))?.doc.name).toBe('Japan 2026');
  });

  test('records attachment metadata for the other files in the folder', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    await drive.uploadFile({
      folderId: 'folder-1',
      name: 'boarding.pdf',
      mimeType: 'application/pdf',
      content: new Blob(['%PDF']),
    });

    await sync.pull('folder-1');

    const attachments = await store.listAttachments('folder-1');
    expect(attachments.map((a) => a.name)).toEqual(['boarding.pdf']);
  });

  test('does not download any attachment bytes', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    await drive.uploadFile({
      folderId: 'folder-1',
      name: 'boarding.pdf',
      mimeType: 'application/pdf',
      content: new Blob(['%PDF']),
    });

    await sync.pull('folder-1');

    // A refresh must cost kilobytes, not megabytes. Bytes move only when the
    // user asks for a trip to be made available offline.
    expect((await store.listAttachments('folder-1'))[0]!.bytes).toBeNull();
  });

  test('skips re-downloading an itinerary Drive reports as unchanged', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    await sync.pull('folder-1');

    const downloads = vi.spyOn(drive, 'downloadText');
    await sync.pull('folder-1');

    expect(downloads).not.toHaveBeenCalled();
  });

  test('re-downloads an itinerary once Drive reports it changed', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    await sync.pull('folder-1');
    const [file] = await drive.listFolder('folder-1');
    await drive.updateJson(file!.id, { ...ITINERARY, name: 'Japan 2026 (revised)' });

    await sync.pull('folder-1');

    expect((await store.getItinerary('folder-1'))?.doc.name).toBe('Japan 2026 (revised)');
  });

  test('records whether this user may edit the trip', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    drive.setReadOnly('folder-1');

    await sync.pull('folder-1');

    expect((await store.getTrip('folder-1'))?.canEdit).toBe(false);
  });

  test('stamps the time of the last successful sync', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);

    await sync.pull('folder-1');

    expect((await store.getTrip('folder-1'))?.lastSyncedAt).not.toBeNull();
  });

  test('reports a folder with no itinerary rather than inventing one', async () => {
    await drive.uploadFile({
      folderId: 'folder-1',
      name: 'stray.pdf',
      mimeType: 'application/pdf',
      content: new Blob(['%PDF']),
    });

    const result = await sync.pull('folder-1');

    expect(result.status).toBe('no-itinerary');
    expect(await store.getItinerary('folder-1')).toBeUndefined();
  });

  test('keeps the last good itinerary when Drive serves a corrupt one', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    await sync.pull('folder-1');
    const [file] = await drive.listFolder('folder-1');
    await drive.updateJson(file!.id, { totally: 'wrong' });

    const result = await sync.pull('folder-1');

    // Replacing a working trip with nothing, mid-trip, would be the worst
    // possible moment to lose it.
    expect(result.status).toBe('invalid-itinerary');
    expect((await store.getItinerary('folder-1'))?.doc.name).toBe('Japan 2026');
  });
});

describe('push', () => {
  test('writes the document back to Drive', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    await sync.pull('folder-1');

    await sync.push('folder-1', parseItinerary({ ...ITINERARY, name: 'Renamed' }));

    const [file] = await drive.listFolder('folder-1');
    expect(JSON.parse(await drive.downloadText(file!.id)).name).toBe('Renamed');
  });

  test('refuses to overwrite a change made by someone else', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    await sync.pull('folder-1');
    const [file] = await drive.listFolder('folder-1');
    await drive.writeBehindOurBack(file!.id, { ...ITINERARY, name: 'Their edit' });

    await expect(sync.push('folder-1', parseItinerary({ ...ITINERARY, name: 'My edit' }))).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  test('leaves the other writer’s content intact when it refuses', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    await sync.pull('folder-1');
    const [file] = await drive.listFolder('folder-1');
    await drive.writeBehindOurBack(file!.id, { ...ITINERARY, name: 'Their edit' });

    await sync.push('folder-1', parseItinerary({ ...ITINERARY, name: 'My edit' })).catch(() => {});

    expect(JSON.parse(await drive.downloadText(file!.id)).name).toBe('Their edit');
  });

  test('tracks the new revision so the next push is not a false conflict', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    await sync.pull('folder-1');

    await sync.push('folder-1', parseItinerary({ ...ITINERARY, name: 'First' }));
    await sync.push('folder-1', parseItinerary({ ...ITINERARY, name: 'Second' }));

    const [file] = await drive.listFolder('folder-1');
    expect(JSON.parse(await drive.downloadText(file!.id)).name).toBe('Second');
  });
});

describe('downloadForOffline', () => {
  async function seedTripWithDocuments(count: number) {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    for (let i = 0; i < count; i++) {
      await drive.uploadFile({
        folderId: 'folder-1',
        name: `doc-${i}.pdf`,
        mimeType: 'application/pdf',
        content: new Blob([`%PDF-${i}`]),
      });
    }
    await sync.pull('folder-1');
  }

  test('caches the bytes of every document in the trip', async () => {
    await seedTripWithDocuments(2);

    await sync.downloadForOffline('folder-1');

    const attachments = await store.listAttachments('folder-1');
    expect(attachments.every((a) => a.bytes !== null)).toBe(true);
  });

  test('reports progress so a slow download can show where it is', async () => {
    await seedTripWithDocuments(2);
    const seen: { completed: number; total: number }[] = [];

    await sync.downloadForOffline('folder-1', (p) => seen.push({ ...p }));

    expect(seen.at(-1)).toEqual({ completed: 2, total: 2 });
  });

  test('does not re-download a document whose checksum still matches', async () => {
    await seedTripWithDocuments(1);
    await sync.downloadForOffline('folder-1');

    const downloads = vi.spyOn(drive, 'downloadFile');
    await sync.downloadForOffline('folder-1');

    expect(downloads).not.toHaveBeenCalled();
  });

  test('re-downloads a document whose checksum changed', async () => {
    await seedTripWithDocuments(1);
    await sync.downloadForOffline('folder-1');
    const doc = (await drive.listFolder('folder-1')).find((f) => f.name === 'doc-0.pdf')!;
    await drive.updateJson(doc.id, 'replaced');
    await sync.pull('folder-1');

    await sync.downloadForOffline('folder-1');

    const record = (await store.listAttachments('folder-1')).find(
      (a) => a.name === 'doc-0.pdf',
    )!;
    expect(new TextDecoder().decode(record.bytes!)).toContain('replaced');
  });

  test('keeps going when one document fails, and names the ones that did not make it', async () => {
    await seedTripWithDocuments(2);
    const real = drive.downloadFile.bind(drive);
    vi.spyOn(drive, 'downloadFile').mockImplementation(async (id) => {
      const file = await drive.getFile(id);
      if (file.name === 'doc-0.pdf') throw new Error('network died');
      return await real(id);
    });

    const result = await sync.downloadForOffline('folder-1');

    // A partial download is useful; an all-or-nothing one throws away the
    // documents that did arrive.
    expect(result.failed).toEqual(['doc-0.pdf']);
    expect(result.cached).toBe(1);
  });

  test('marks the trip as available offline once a download succeeds', async () => {
    await seedTripWithDocuments(1);

    await sync.downloadForOffline('folder-1');

    expect((await store.getTrip('folder-1'))?.offlineEnabled).toBe(true);
  });
});

describe('evictOffline', () => {
  test('frees the bytes and clears the offline flag', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    await drive.uploadFile({
      folderId: 'folder-1',
      name: 'doc.pdf',
      mimeType: 'application/pdf',
      content: new Blob(['%PDF']),
    });
    await sync.pull('folder-1');
    await sync.downloadForOffline('folder-1');

    await sync.evictOffline('folder-1');

    expect(await store.cachedBytes('folder-1')).toBe(0);
    expect((await store.getTrip('folder-1'))?.offlineEnabled).toBe(false);
  });
});
