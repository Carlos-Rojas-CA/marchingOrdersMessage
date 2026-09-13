import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { FakeDriveClient } from '../drive/fakeDriveClient';
import { TripStore } from '../store/tripStore';
import { ConflictError, ITINERARY_FILENAME, SyncEngine } from './syncEngine';
import { liveItems, parseItinerary } from '../model/itinerary';

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

describe('createTrip', () => {
  test('creates a folder and seeds an itinerary in it', async () => {
    const folderId = await sync.createTrip('Japan 2026');

    const files = await drive.listFolder(folderId);
    expect(files.map((f) => f.name)).toEqual([ITINERARY_FILENAME]);
  });

  test('leaves the new trip immediately readable from the local store', async () => {
    const folderId = await sync.createTrip('Japan 2026');

    // Creating a trip must not require a round trip back through Drive before
    // the UI can render it.
    expect((await store.getItinerary(folderId))?.doc.name).toBe('Japan 2026');
    expect((await store.getTrip(folderId))?.canEdit).toBe(true);
  });

  test('gives the itinerary a distinct trip id', async () => {
    const first = await sync.createTrip('Trip A');
    const second = await sync.createTrip('Trip B');

    const a = (await store.getItinerary(first))!.doc.tripId;
    const b = (await store.getItinerary(second))!.doc.tripId;
    expect(a).not.toBe(b);
  });

  test('starts with no items rather than placeholder content', async () => {
    const folderId = await sync.createTrip('Japan 2026');

    expect((await store.getItinerary(folderId))?.doc.items).toEqual([]);
  });
});

describe('attachDocument', () => {
  async function newTrip() {
    const folderId = await sync.createTrip('Japan 2026');
    await sync.push(
      folderId,
      parseItinerary({
        schemaVersion: 1,
        tripId: 't1',
        name: 'Japan 2026',
        items: [{ id: 'flight', type: 'flight', title: 'AA123' }],
      }),
    );
    return folderId;
  }

  test('uploads the file into the trip folder', async () => {
    const folderId = await newTrip();

    await sync.attachDocument(folderId, 'flight', new File(['%PDF'], 'boarding.pdf'));

    const names = (await drive.listFolder(folderId)).map((f) => f.name);
    expect(names).toContain('boarding.pdf');
  });

  test('records the attachment against the item that owns it', async () => {
    const folderId = await newTrip();

    await sync.attachDocument(folderId, 'flight', new File(['%PDF'], 'boarding.pdf'));

    const item = (await store.getItinerary(folderId))!.doc.items[0]!;
    expect(item.attachments).toHaveLength(1);
    expect(item.attachments[0]!.name).toBe('boarding.pdf');
  });

  test('infers the document kind from the item so nothing needs tagging', async () => {
    const folderId = await newTrip();

    await sync.attachDocument(folderId, 'flight', new File(['%PDF'], 'boarding.pdf'));

    const item = (await store.getItinerary(folderId))!.doc.items[0]!;
    expect(item.attachments[0]!.docType).toBe('travel');
  });

  test('honours an explicitly chosen kind over the inferred one', async () => {
    const folderId = await newTrip();

    await sync.attachDocument(folderId, 'flight', new File(['%PDF'], 'receipt.pdf'), {
      docType: 'other',
    });

    const item = (await store.getItinerary(folderId))!.doc.items[0]!;
    expect(item.attachments[0]!.docType).toBe('other');
  });

  test('attaches to the trip itself when no item is named', async () => {
    const folderId = await newTrip();

    await sync.attachDocument(folderId, null, new File(['%PDF'], 'passport.pdf'), {
      docType: 'identity',
    });

    const doc = (await store.getItinerary(folderId))!.doc;
    expect(doc.attachments).toHaveLength(1);
    expect(doc.items[0]!.attachments).toHaveLength(0);
  });

  test('tags the uploaded file so the trip can be rebuilt from the folder alone', async () => {
    const folderId = await newTrip();

    await sync.attachDocument(folderId, 'flight', new File(['%PDF'], 'boarding.pdf'));

    const file = (await drive.listFolder(folderId)).find((f) => f.name === 'boarding.pdf')!;
    expect(file.appProperties?.itemId).toBe('flight');
  });

  test('makes the document readable locally straight away', async () => {
    const folderId = await newTrip();

    await sync.attachDocument(folderId, 'flight', new File(['%PDF'], 'boarding.pdf'));

    // Just-uploaded bytes are already in hand; re-downloading them to view the
    // thing you just added would be absurd.
    const attachments = await store.listAttachments(folderId);
    const record = attachments.find((a) => a.name === 'boarding.pdf')!;
    expect(record.bytes).not.toBeNull();
  });

  test('refuses to attach to an item that does not exist', async () => {
    const folderId = await newTrip();

    await expect(
      sync.attachDocument(folderId, 'ghost', new File(['%PDF'], 'x.pdf')),
    ).rejects.toThrow(/ghost/);
  });
});

describe('replaceItinerary', () => {
  test('accepts a pasted document and stores it', async () => {
    const folderId = await sync.createTrip('Japan 2026');

    await sync.replaceItinerary(folderId, {
      schemaVersion: 1,
      tripId: 'pasted',
      name: 'Japan 2026',
      items: [{ id: 'i1', type: 'flight', title: 'AA123' }],
    });

    expect((await store.getItinerary(folderId))!.doc.items).toHaveLength(1);
  });

  test('rejects a document that does not validate, leaving the trip untouched', async () => {
    const folderId = await sync.createTrip('Japan 2026');

    await expect(
      sync.replaceItinerary(folderId, { totally: 'wrong' }),
    ).rejects.toThrow();

    expect((await store.getItinerary(folderId))!.doc.name).toBe('Japan 2026');
  });

  test('keeps the trip name the folder was created with', async () => {
    const folderId = await sync.createTrip('Japan 2026');

    await sync.replaceItinerary(folderId, {
      schemaVersion: 1,
      tripId: 'pasted',
      name: 'Something Else',
      items: [],
    });

    // The Drive folder is named after the trip and is the unit of sharing;
    // letting a paste rename one but not the other would split them.
    expect((await store.getItinerary(folderId))!.doc.name).toBe('Japan 2026');
  });
});

describe('replaceItinerary on a trip that is not loaded locally', () => {
  test('reconciles first rather than failing', async () => {
    // Reached by deep link, or by reloading the app on the import screen.
    drive.seedJson('folder-9', ITINERARY_FILENAME, {
      schemaVersion: 1,
      tripId: 't9',
      name: 'Japan 2026',
      items: [],
    });

    await sync.replaceItinerary('folder-9', {
      schemaVersion: 1,
      tripId: 't9',
      name: 'Japan 2026',
      items: [{ id: 'i1', type: 'flight', title: 'AA123' }],
    });

    expect((await store.getItinerary('folder-9'))!.doc.items).toHaveLength(1);
  });

  test('still refuses a folder that holds no itinerary at all', async () => {
    await expect(
      sync.replaceItinerary('folder-empty', { schemaVersion: 1, tripId: 'x', name: 'X', items: [] }),
    ).rejects.toThrow();
  });
});

describe('item editing', () => {
  async function tripWith(items: unknown[] = []) {
    drive.seedJson('folder-1', ITINERARY_FILENAME, {
      schemaVersion: 1,
      tripId: 't1',
      name: 'Europe 2026',
      startDate: '2026-05-08',
      endDate: '2026-05-21',
      items,
    });
    await sync.pull('folder-1');
    return 'folder-1';
  }

  const flight = {
    type: 'flight' as const,
    title: 'UA 123 — SAN → FCO',
    startsAt: '2026-05-08T11:40:00-07:00',
    endsAt: '2026-05-09T13:25:00+02:00',
  };

  test('adds an item and gives it an id', async () => {
    const folderId = await tripWith();

    const id = await sync.addItem(folderId, flight);

    const doc = (await store.getItinerary(folderId))!.doc;
    expect(doc.items).toHaveLength(1);
    expect(doc.items[0]!.id).toBe(id);
  });

  test('gives every added item a distinct id', async () => {
    const folderId = await tripWith();

    const first = await sync.addItem(folderId, flight);
    const second = await sync.addItem(folderId, flight);

    expect(first).not.toBe(second);
  });

  test('stamps when the item was written, so a later merge can order it', async () => {
    const folderId = await tripWith();

    await sync.addItem(folderId, flight);

    expect((await store.getItinerary(folderId))!.doc.items[0]!.updatedAt).toBeTruthy();
  });

  test('writes the addition through to Drive', async () => {
    const folderId = await tripWith();

    await sync.addItem(folderId, flight);

    const file = (await drive.listFolder(folderId)).find((f) => f.name === ITINERARY_FILENAME)!;
    expect(JSON.parse(await drive.downloadText(file.id)).items).toHaveLength(1);
  });

  test('edits an existing item without disturbing the others', async () => {
    const folderId = await tripWith();
    const keep = await sync.addItem(folderId, flight);
    const change = await sync.addItem(folderId, { ...flight, title: 'Placeholder' });

    await sync.updateItem(folderId, change, { title: 'VY6503 — FCO → BCN' });

    const doc = (await store.getItinerary(folderId))!.doc;
    expect(doc.items.find((i) => i.id === change)!.title).toBe('VY6503 — FCO → BCN');
    expect(doc.items.find((i) => i.id === keep)!.title).toBe('UA 123 — SAN → FCO');
  });

  test('keeps fields the edit did not mention', async () => {
    const folderId = await tripWith();
    const id = await sync.addItem(folderId, { ...flight, confirmationNumber: 'PHKEYQ' });

    await sync.updateItem(folderId, id, { title: 'Renamed' });

    const item = (await store.getItinerary(folderId))!.doc.items[0]!;
    expect(item.confirmationNumber).toBe('PHKEYQ');
    expect(item.startsAt).toBe(flight.startsAt);
  });

  test('refuses to edit an item that is not there', async () => {
    const folderId = await tripWith();

    await expect(sync.updateItem(folderId, 'ghost', { title: 'x' })).rejects.toThrow(/ghost/);
  });

  test('removes an item by tombstoning it rather than deleting it', async () => {
    const folderId = await tripWith();
    const id = await sync.addItem(folderId, flight);

    await sync.removeItem(folderId, id);

    const doc = (await store.getItinerary(folderId))!.doc;
    // The row has to survive for a later merge to know it was deleted rather
    // than never created.
    expect(doc.items).toHaveLength(1);
    expect(doc.items[0]!.deleted).toBe(true);
  });

  test('hides a removed item from everything that reads the trip', async () => {
    const folderId = await tripWith();
    const id = await sync.addItem(folderId, flight);

    await sync.removeItem(folderId, id);

    const doc = (await store.getItinerary(folderId))!.doc;
    expect(liveItems(doc)).toEqual([]);
  });
});

describe('createTrip with dates', () => {
  test('records the dates the trip is bounded by', async () => {
    const folderId = await sync.createTrip('Europe 2026', {
      startDate: '2026-05-08',
      endDate: '2026-05-21',
    });

    const doc = (await store.getItinerary(folderId))!.doc;
    expect(doc.startDate).toBe('2026-05-08');
    expect(doc.endDate).toBe('2026-05-21');
  });

  test('still works for a trip with no dates yet', async () => {
    const folderId = await sync.createTrip('Someday');

    expect((await store.getItinerary(folderId))!.doc.startDate).toBeUndefined();
  });
});

describe('concurrent operations on one trip', () => {
  async function seeded() {
    drive.seedJson('folder-1', ITINERARY_FILENAME, {
      schemaVersion: 1,
      tripId: 't1',
      name: 'Europe 2026',
      items: [],
    });
    await sync.pull('folder-1');
    return 'folder-1';
  }

  const item = { type: 'lodging' as const, title: 'Stay in Rome' };

  test('a refresh landing after a write does not cause a false conflict', async () => {
    const folderId = await seeded();

    // A refresh already in flight when the write starts — exactly what happens
    // when a screen mounts and you save before its background pull returns.
    let releasePull: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      releasePull = resolve;
    });
    const realList = drive.listFolder.bind(drive);
    vi.spyOn(drive, 'listFolder').mockImplementation(async (id) => {
      await held;
      return await realList(id);
    });

    const refreshing = sync.pull(folderId);
    const writing = sync.addItem(folderId, item);
    releasePull();
    await Promise.all([refreshing, writing]);

    // The stale revision the slow pull carried must not have been written back
    // over the newer one the save produced.
    await expect(sync.addItem(folderId, item)).resolves.toBeTruthy();
  });

  test('writes queued together all land', async () => {
    const folderId = await seeded();

    // The route sketch saves one stay per stop, back to back.
    await Promise.all([
      sync.addItem(folderId, { ...item, title: 'Rome' }),
      sync.addItem(folderId, { ...item, title: 'Barcelona' }),
      sync.addItem(folderId, { ...item, title: 'Paris' }),
    ]);

    const titles = (await store.getItinerary(folderId))!.doc.items.map((i) => i.title);
    expect(titles.sort()).toEqual(['Barcelona', 'Paris', 'Rome']);
  });

  test('still reports a conflict when someone else really did write', async () => {
    const folderId = await seeded();
    const file = (await drive.listFolder(folderId)).find(
      (f) => f.name === ITINERARY_FILENAME,
    )!;

    await drive.writeBehindOurBack(file.id, {
      schemaVersion: 1,
      tripId: 't1',
      name: 'Their edit',
      items: [],
    });

    // Serialising our own work must not blind us to a genuine second writer.
    await expect(sync.addItem(folderId, item)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('deleteTrip', () => {
  async function aTrip() {
    const folderId = await sync.createTrip('Test trip');
    await sync.addItem(folderId, { type: 'lodging', title: 'Somewhere' });
    return folderId;
  }

  test('forgets the trip locally', async () => {
    const folderId = await aTrip();

    await sync.deleteTrip(folderId, { fromDrive: false });

    expect(await store.getTrip(folderId)).toBeUndefined();
    expect(await store.getItinerary(folderId)).toBeUndefined();
  });

  test('leaves the Drive folder alone when only removing it from the device', async () => {
    const folderId = await aTrip();

    await sync.deleteTrip(folderId, { fromDrive: false });

    // Removing an app's copy must never quietly destroy the original.
    expect(await drive.listFolder(folderId)).not.toHaveLength(0);
  });

  test('trashes the Drive folder when asked to', async () => {
    const folderId = await aTrip();
    const trashing = vi.spyOn(drive, 'trashFolder');

    await sync.deleteTrip(folderId, { fromDrive: true });

    expect(trashing).toHaveBeenCalledWith(folderId);
  });

  test('still forgets it locally when Drive refuses', async () => {
    const folderId = await aTrip();
    vi.spyOn(drive, 'trashFolder').mockRejectedValue(new Error('offline'));

    await expect(sync.deleteTrip(folderId, { fromDrive: true })).rejects.toThrow();

    // Leaving a half-deleted trip listed, pointing at a folder the user
    // believes is gone, is worse than either outcome on its own.
    expect(await store.getTrip(folderId)).toBeUndefined();
  });
});

describe('telling a real conflict from Drive bumping its own metadata', () => {
  async function loaded() {
    drive.seedJson('folder-1', ITINERARY_FILENAME, {
      schemaVersion: 1,
      tripId: 't1',
      name: 'Europe 2026',
      items: [],
    });
    await sync.pull('folder-1');
    const file = (await drive.listFolder('folder-1')).find(
      (f) => f.name === ITINERARY_FILENAME,
    )!;
    return { folderId: 'folder-1', fileId: file.id };
  }

  test('accepts a write when only the revision counter moved', async () => {
    const { folderId, fileId } = await loaded();

    // Drive increments version for its own reasons — reindexing, metadata
    // housekeeping — and a freshly created file often reads back at a higher
    // revision than the one its creation returned.
    drive.touchMetadata(fileId);

    await expect(
      sync.addItem(folderId, { type: 'flight', title: 'UA 123' }),
    ).resolves.toBeTruthy();
  });

  test('still refuses when the content itself diverged', async () => {
    const { folderId, fileId } = await loaded();

    await drive.writeBehindOurBack(fileId, {
      schemaVersion: 1,
      tripId: 't1',
      name: 'Their edit',
      items: [],
    });

    await expect(
      sync.addItem(folderId, { type: 'flight', title: 'UA 123' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  test('leaves the other writer’s content intact when it refuses', async () => {
    const { folderId, fileId } = await loaded();
    await drive.writeBehindOurBack(fileId, {
      schemaVersion: 1,
      tripId: 't1',
      name: 'Their edit',
      items: [],
    });

    await sync.addItem(folderId, { type: 'flight', title: 'UA 123' }).catch(() => {});

    expect(JSON.parse(await drive.downloadText(fileId)).name).toBe('Their edit');
  });
});

describe('a home folder', () => {
  test('puts a new trip inside one rather than loose in Drive', async () => {
    const folderId = await sync.createTrip('Japan 2026');

    const home = (await drive.listFolders()).find((f) => f.name === 'Marching Orders');
    expect(home).toBeDefined();
    const trip = (await drive.listFolders()).find((f) => f.id === folderId)!;
    expect(trip.parents).toEqual([home!.id]);
  });

  test('reuses the same home folder for every trip', async () => {
    await sync.createTrip('Japan 2026');
    await sync.createTrip('Italy 2027');

    const homes = (await drive.listFolders()).filter((f) => f.name === 'Marching Orders');
    // A second home folder would scatter the trips it exists to gather.
    expect(homes).toHaveLength(1);
  });
});

describe('finding trips again', () => {
  test('recovers a trip whose local record is gone', async () => {
    const folderId = await sync.createTrip('Japan 2026');
    // Signing out, or opening the app on a different device.
    await store.clearAll();

    const found = await sync.discoverTrips();

    // drive.file sees the files this app created, which is exactly the set of
    // trips it should be able to offer back.
    expect(found.map((t) => t.folderId)).toEqual([folderId]);
    expect(found[0]!.name).toBe('Japan 2026');
  });

  test('finds every trip, not just the most recent', async () => {
    await sync.createTrip('Japan 2026');
    await sync.createTrip('Italy 2027');
    await store.clearAll();

    const found = await sync.discoverTrips();

    expect(found.map((t) => t.name).sort()).toEqual(['Italy 2027', 'Japan 2026']);
  });

  test('ignores a folder with no itinerary in it', async () => {
    await drive.createFolder('Holiday photos');

    expect(await sync.discoverTrips()).toEqual([]);
  });

  test('says nothing when the account has no trips at all', async () => {
    expect(await sync.discoverTrips()).toEqual([]);
  });
});
