import { DriveError } from './errors';
import type { DriveClient, DriveFile, DriveUser, UploadRequest } from './types';

interface StoredFile extends DriveFile {
  folderId: string;
  content: Blob;
}

/**
 * An in-memory Drive, faithful in the ways sync depends on.
 *
 * This is what lets the entire sync engine be tested with no network, no
 * credentials and no quota. Its contract with the real client is narrow but
 * strict: a content write must advance both `version` and `modifiedTime`, since
 * those are exactly what conflict detection and change detection read.
 */
export class FakeDriveClient implements DriveClient {
  #files = new Map<string, StoredFile>();
  #nextId = 1;
  #clock = Date.parse('2026-01-01T00:00:00Z');

  /** Distinct per write so `modifiedTime` strictly increases. */
  #tick(): string {
    this.#clock += 1000;
    return new Date(this.#clock).toISOString();
  }

  /**
   * Cheap content-derived digest. Not MD5 — it only has to change when the
   * content changes. Deliberately synchronous and taking text rather than a
   * Blob, so seeding a file needs no await and cannot race a test's first read.
   */
  #digest(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16);
  }

  #require(fileId: string): StoredFile {
    const file = this.#files.get(fileId);
    if (!file) throw new DriveError(`File not found: ${fileId}`, 404);
    return file;
  }

  #meta(file: StoredFile): DriveFile {
    const { folderId: _folderId, content: _content, ...meta } = file;
    return { ...meta };
  }

  #put(
    folderId: string,
    name: string,
    mimeType: string,
    content: Blob,
    text: string,
    appProperties?: Record<string, string>,
  ): DriveFile {
    const id = `file-${this.#nextId++}`;
    const file: StoredFile = {
      id,
      name,
      mimeType,
      folderId,
      content,
      size: content.size,
      modifiedTime: this.#tick(),
      version: '1',
      md5Checksum: this.#digest(text),
      capabilities: { canEdit: true },
      ...(appProperties ? { appProperties } : {}),
    };
    this.#files.set(id, file);
    return this.#meta(file);
  }

  #putJson(folderId: string, name: string, value: unknown): DriveFile {
    const text = JSON.stringify(value);
    return this.#put(
      folderId,
      name,
      'application/json',
      new Blob([text], { type: 'application/json' }),
      text,
    );
  }

  /** Test helper: place a document as if it were already in Drive. */
  seedJson(folderId: string, name: string, value: unknown): void {
    this.#putJson(folderId, name, value);
  }

  /** Test helper: who the fake reports as signed in. */
  currentUser: DriveUser = { email: 'tester@example.com', displayName: 'Tester' };

  async getCurrentUser(): Promise<DriveUser> {
    return this.currentUser;
  }

  async createFolder(name: string): Promise<DriveFile> {
    // Modelled as a zero-byte file in a synthetic root so that listing it as a
    // parent behaves the same way a real Drive folder does.
    return this.#put('__root__', name, 'application/vnd.google-apps.folder', new Blob([]), '');
  }

  async trashFolder(folderId: string): Promise<void> {
    for (const [id, file] of this.#files) {
      if (file.folderId === folderId || file.name === folderId) this.#files.delete(id);
    }
  }

  async listFolder(folderId: string): Promise<DriveFile[]> {
    return [...this.#files.values()]
      .filter((f) => f.folderId === folderId)
      .map((f) => this.#meta(f));
  }

  async getFile(fileId: string): Promise<DriveFile> {
    return this.#meta(this.#require(fileId));
  }

  async downloadFile(fileId: string): Promise<Blob> {
    return this.#require(fileId).content;
  }

  async downloadText(fileId: string): Promise<string> {
    return await this.#require(fileId).content.text();
  }

  async uploadFile(request: UploadRequest): Promise<DriveFile> {
    return this.#put(
      request.folderId,
      request.name,
      request.mimeType,
      request.content,
      await request.content.text(),
      request.appProperties,
    );
  }

  async createJson(folderId: string, name: string, value: unknown): Promise<DriveFile> {
    return this.#putJson(folderId, name, value);
  }

  async updateJson(fileId: string, value: unknown): Promise<DriveFile> {
    const file = this.#require(fileId);
    const text = JSON.stringify(value);
    file.content = new Blob([text], { type: 'application/json' });
    file.size = file.content.size;
    file.modifiedTime = this.#tick();
    file.version = String(Number(file.version ?? '1') + 1);
    file.md5Checksum = this.#digest(text);
    return this.#meta(file);
  }

  /** Test helper: simulate another writer changing the file behind our back. */
  async writeBehindOurBack(fileId: string, value: unknown): Promise<DriveFile> {
    return await this.updateJson(fileId, value);
  }

  /** Test helper: make a folder read-only, as a Drive "Viewer" would see it. */
  setReadOnly(folderId: string): void {
    for (const file of this.#files.values()) {
      if (file.folderId === folderId) file.capabilities = { canEdit: false };
    }
  }
}
