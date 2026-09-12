import { DriveAuthError, DriveError, DriveRateLimitError } from './errors';
import {
  FILE_FIELDS,
  type DriveClient,
  type DriveFile,
  type UploadRequest,
} from './types';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export interface GoogleDriveClientOptions {
  getAccessToken: () => Promise<string>;
  /** Injectable so the request shaping can be tested without a network. */
  fetch?: typeof fetch;
}

interface DriveErrorBody {
  error?: { message?: string; errors?: { reason?: string }[] };
}

/** Reasons Drive reports for a 403 that mean "slow down", not "you may not". */
const THROTTLE_REASONS = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'sharingRateLimitExceeded',
]);

export class GoogleDriveClient implements DriveClient {
  readonly #getAccessToken: () => Promise<string>;
  readonly #fetch: typeof fetch;

  constructor(options: GoogleDriveClientOptions) {
    this.#getAccessToken = options.getAccessToken;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async #request(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.#getAccessToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);

    const response = await this.#fetch(url, { ...init, headers });
    if (response.ok) return response;

    throw await this.#toError(response);
  }

  async #toError(response: Response): Promise<DriveError> {
    let body: DriveErrorBody = {};
    try {
      body = (await response.clone().json()) as DriveErrorBody;
    } catch {
      // A non-JSON error body is not itself worth failing over; the status
      // code still carries enough to classify the failure.
      console.warn(`Drive returned a non-JSON error body (${response.status})`);
    }
    const message = body.error?.message ?? `Drive request failed (${response.status})`;

    if (response.status === 401) return new DriveAuthError(message);
    if (response.status === 403) {
      const throttled = body.error?.errors?.some(
        (e) => e.reason && THROTTLE_REASONS.has(e.reason),
      );
      if (throttled) return new DriveRateLimitError(message);
      return new DriveAuthError(message, 403);
    }
    if (response.status === 429) return new DriveRateLimitError(message, 429);
    return new DriveError(message, response.status);
  }

  async listFolder(folderId: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(`${API}/files`);
      url.searchParams.set('q', `'${folderId}' in parents and trashed = false`);
      url.searchParams.set('fields', `files(${FILE_FIELDS}),nextPageToken`);
      url.searchParams.set('pageSize', '1000');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const response = await this.#request(url.toString());
      const page = (await response.json()) as {
        files?: DriveFile[];
        nextPageToken?: string;
      };
      files.push(...(page.files ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);

    return files;
  }

  async createFolder(name: string): Promise<DriveFile> {
    const url = new URL(`${API}/files`);
    url.searchParams.set('fields', FILE_FIELDS);
    const response = await this.#request(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    return (await response.json()) as DriveFile;
  }

  async getFile(fileId: string): Promise<DriveFile> {
    const url = new URL(`${API}/files/${fileId}`);
    url.searchParams.set('fields', FILE_FIELDS);
    const response = await this.#request(url.toString());
    return (await response.json()) as DriveFile;
  }

  async downloadFile(fileId: string): Promise<Blob> {
    const url = new URL(`${API}/files/${fileId}`);
    url.searchParams.set('alt', 'media');
    const response = await this.#request(url.toString());
    return await response.blob();
  }

  async downloadText(fileId: string): Promise<string> {
    const url = new URL(`${API}/files/${fileId}`);
    url.searchParams.set('alt', 'media');
    const response = await this.#request(url.toString());
    return await response.text();
  }

  async updateJson(fileId: string, value: unknown): Promise<DriveFile> {
    const url = new URL(`${UPLOAD_API}/files/${fileId}`);
    url.searchParams.set('uploadType', 'media');
    url.searchParams.set('fields', FILE_FIELDS);

    const response = await this.#request(url.toString(), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    return (await response.json()) as DriveFile;
  }

  async createJson(folderId: string, name: string, value: unknown): Promise<DriveFile> {
    return await this.uploadFile({
      folderId,
      name,
      mimeType: 'application/json',
      content: new Blob([JSON.stringify(value)], { type: 'application/json' }),
    });
  }

  async uploadFile(request: UploadRequest): Promise<DriveFile> {
    const metadata = {
      name: request.name,
      mimeType: request.mimeType,
      parents: [request.folderId],
      ...(request.appProperties ? { appProperties: request.appProperties } : {}),
    };

    // Multipart: one round trip for metadata plus bytes.
    const form = new FormData();
    form.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
    );
    form.append('file', request.content);

    const url = new URL(`${UPLOAD_API}/files`);
    url.searchParams.set('uploadType', 'multipart');
    url.searchParams.set('fields', FILE_FIELDS);

    const response = await this.#request(url.toString(), { method: 'POST', body: form });
    return (await response.json()) as DriveFile;
  }
}
