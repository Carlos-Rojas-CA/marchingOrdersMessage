import { describe, expect, test } from 'vitest';
import { FakeDriveClient } from './fakeDriveClient';

/**
 * The fake stands in for Drive across the whole sync test suite, so the
 * invariants sync relies on have to actually hold here — above all that a write
 * moves `version` and `modifiedTime`, since that is how conflicts are detected.
 */
describe('FakeDriveClient', () => {
  test('lists only the files inside the requested folder', async () => {
    const drive = new FakeDriveClient();
    await drive.createJson('folder-a', 'a.json', {});
    await drive.createJson('folder-b', 'b.json', {});

    const files = await drive.listFolder('folder-a');

    expect(files.map((f) => f.name)).toEqual(['a.json']);
  });

  test('round-trips json content', async () => {
    const drive = new FakeDriveClient();
    const file = await drive.createJson('folder-a', 'itinerary.json', { name: 'Japan' });

    expect(JSON.parse(await drive.downloadText(file.id))).toEqual({ name: 'Japan' });
  });

  test('advances the version on every content update', async () => {
    const drive = new FakeDriveClient();
    const created = await drive.createJson('folder-a', 'itinerary.json', { v: 1 });

    const updated = await drive.updateJson(created.id, { v: 2 });

    expect(Number(updated.version)).toBeGreaterThan(Number(created.version));
  });

  test('advances modifiedTime on every content update', async () => {
    const drive = new FakeDriveClient();
    const created = await drive.createJson('folder-a', 'itinerary.json', { v: 1 });

    const updated = await drive.updateJson(created.id, { v: 2 });

    expect(Date.parse(updated.modifiedTime!)).toBeGreaterThan(
      Date.parse(created.modifiedTime!),
    );
  });

  test('reports a checksum that changes with content', async () => {
    const drive = new FakeDriveClient();
    const created = await drive.createJson('folder-a', 'f.json', { v: 1 });
    const updated = await drive.updateJson(created.id, { v: 2 });

    expect(created.md5Checksum).toBeTruthy();
    expect(updated.md5Checksum).not.toBe(created.md5Checksum);
  });

  test('downloads uploaded binary content unchanged', async () => {
    const drive = new FakeDriveClient();
    const file = await drive.uploadFile({
      folderId: 'folder-a',
      name: 'boarding.pdf',
      mimeType: 'application/pdf',
      content: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
    });

    expect(await (await drive.downloadFile(file.id)).text()).toBe('%PDF-1.4');
  });

  test('fails on a file that does not exist', async () => {
    const drive = new FakeDriveClient();

    await expect(drive.getFile('nope')).rejects.toThrow(/not found/i);
  });

  test('can be seeded so a test starts from an existing trip folder', async () => {
    const drive = new FakeDriveClient();
    drive.seedJson('folder-a', 'itinerary.json', { tripId: 't1' });

    const [file] = await drive.listFolder('folder-a');

    expect(file!.name).toBe('itinerary.json');
    expect(JSON.parse(await drive.downloadText(file!.id))).toEqual({ tripId: 't1' });
  });
});
