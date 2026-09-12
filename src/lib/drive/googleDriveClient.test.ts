import { beforeEach, describe, expect, test, vi } from 'vitest';
import { GoogleDriveClient } from './googleDriveClient';
import { DriveAuthError, DriveRateLimitError } from './errors';

/** Records every request so tests can assert on the shape of the call. */
function recordingFetch(responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const queue = [...responses];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = queue.shift();
    if (!next) throw new Error('no queued response');
    return next;
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function clientWith(responses: Response[]) {
  const { fn, calls } = recordingFetch(responses);
  const client = new GoogleDriveClient({
    getAccessToken: async () => 'test-token',
    fetch: fn,
  });
  return { client, calls };
}

describe('GoogleDriveClient.listFolder', () => {
  test('asks only for files in the folder, excluding trashed ones', async () => {
    const { client, calls } = clientWith([json({ files: [] })]);

    await client.listFolder('folder-1');

    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get('q')).toBe("'folder-1' in parents and trashed = false");
  });

  test('requests the checksum and version fields sync depends on', async () => {
    const { client, calls } = clientWith([json({ files: [] })]);

    await client.listFolder('folder-1');

    const fields = new URL(calls[0]!.url).searchParams.get('fields')!;
    // Without these, sync cannot tell a changed file from an unchanged one and
    // would re-download every document on every refresh.
    expect(fields).toContain('md5Checksum');
    expect(fields).toContain('modifiedTime');
    expect(fields).toContain('version');
  });

  test('sends the access token as a bearer credential', async () => {
    const { client, calls } = clientWith([json({ files: [] })]);

    await client.listFolder('folder-1');

    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-token');
  });

  test('returns the files the API reported', async () => {
    const { client } = clientWith([
      json({ files: [{ id: 'f1', name: 'boarding.pdf', mimeType: 'application/pdf' }] }),
    ]);

    const files = await client.listFolder('folder-1');

    expect(files.map((f) => f.id)).toEqual(['f1']);
  });

  test('follows pagination until the API stops returning a token', async () => {
    const { client, calls } = clientWith([
      json({ files: [{ id: 'f1', name: 'a', mimeType: 'application/pdf' }], nextPageToken: 'p2' }),
      json({ files: [{ id: 'f2', name: 'b', mimeType: 'application/pdf' }] }),
    ]);

    const files = await client.listFolder('folder-1');

    expect(files.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(new URL(calls[1]!.url).searchParams.get('pageToken')).toBe('p2');
  });
});

describe('GoogleDriveClient.downloadFile', () => {
  test('fetches the file bytes rather than its metadata', async () => {
    const { client, calls } = clientWith([new Response('%PDF-1.4')]);

    await client.downloadFile('f1');

    const url = new URL(calls[0]!.url);
    expect(url.pathname).toContain('/files/f1');
    expect(url.searchParams.get('alt')).toBe('media');
  });

  test('returns the bytes as a blob', async () => {
    const { client } = clientWith([new Response('%PDF-1.4')]);

    const blob = await client.downloadFile('f1');

    expect(await blob.text()).toBe('%PDF-1.4');
  });
});

describe('GoogleDriveClient.updateJson', () => {
  test('replaces the file content with a media upload', async () => {
    const { client, calls } = clientWith([json({ id: 'f1', name: 'itinerary.json' })]);

    await client.updateJson('f1', { hello: 'world' });

    const url = new URL(calls[0]!.url);
    expect(calls[0]!.init.method).toBe('PATCH');
    expect(url.pathname).toContain('/upload/drive/v3/files/f1');
    expect(url.searchParams.get('uploadType')).toBe('media');
    expect(calls[0]!.init.body).toBe(JSON.stringify({ hello: 'world' }));
  });
});

describe('GoogleDriveClient error mapping', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    return () => warn.mockRestore();
  });

  test('reports an expired token as an auth error so the caller can re-auth', async () => {
    const { client } = clientWith([json({ error: { message: 'Invalid Credentials' } }, 401)]);

    await expect(client.listFolder('folder-1')).rejects.toBeInstanceOf(DriveAuthError);
  });

  test('distinguishes rate limiting from other 403s so it can be retried', async () => {
    const { client } = clientWith([
      json({ error: { message: 'Rate Limit Exceeded', errors: [{ reason: 'rateLimitExceeded' }] } }, 403),
    ]);

    await expect(client.listFolder('folder-1')).rejects.toBeInstanceOf(DriveRateLimitError);
  });

  test('surfaces the API message on an unexpected failure', async () => {
    const { client } = clientWith([json({ error: { message: 'File not found: f9' } }, 404)]);

    await expect(client.listFolder('folder-1')).rejects.toThrow(/File not found: f9/);
  });
});

describe('GoogleDriveClient.createFolder', () => {
  test('creates a Drive folder the app then owns outright', async () => {
    const { client, calls } = clientWith([json({ id: 'folder-9', name: 'Japan 2026' })]);

    await client.createFolder('Japan 2026');

    // Creating the folder is what makes it reachable under the narrow
    // drive.file scope without going through the Picker at all.
    expect(calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({
      name: 'Japan 2026',
      mimeType: 'application/vnd.google-apps.folder',
    });
  });

  test('returns the created folder', async () => {
    const { client } = clientWith([json({ id: 'folder-9', name: 'Japan 2026' })]);

    expect((await client.createFolder('Japan 2026')).id).toBe('folder-9');
  });
});

describe('GoogleDriveClient.getCurrentUser', () => {
  test('asks Drive who the current token belongs to', async () => {
    const { client, calls } = clientWith([
      json({ user: { emailAddress: 'carlos@example.com', displayName: 'Carlos' } }),
    ]);

    await client.getCurrentUser();

    const url = new URL(calls[0]!.url);
    expect(url.pathname).toContain('/about');
    expect(url.searchParams.get('fields')).toContain('user');
  });

  test('returns the signed-in address, which is what local data is keyed to', async () => {
    const { client } = clientWith([
      json({ user: { emailAddress: 'carlos@example.com', displayName: 'Carlos' } }),
    ]);

    expect((await client.getCurrentUser()).email).toBe('carlos@example.com');
  });
});
