/**
 * The Drive operations this app needs, and nothing more.
 *
 * Everything above this interface (sync, model, UI) is written against it
 * rather than against Google's API, which is what lets the whole sync engine be
 * tested with `FakeDriveClient` and no network, no credentials, and no quota.
 */

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  md5Checksum?: string;
  size?: number;
  /** Monotonically increasing. Used for compare-and-swap on writes. */
  version?: string;
  appProperties?: Record<string, string>;
  capabilities?: { canEdit?: boolean };
}

export interface UploadRequest {
  folderId: string;
  name: string;
  mimeType: string;
  content: Blob;
  appProperties?: Record<string, string>;
}

export interface DriveUser {
  email: string;
  displayName?: string;
}

export interface DriveClient {
  /** Who the current access token belongs to. Local data is keyed to this. */
  getCurrentUser(): Promise<DriveUser>;
  /** Every non-trashed file directly inside a folder, following pagination. */
  listFolder(folderId: string): Promise<DriveFile[]>;
  /**
   * Creates a trip folder.
   *
   * Worth its own method: a folder the app created is reachable under the
   * narrow `drive.file` scope without the Picker, which makes "new trip" the
   * one flow that cannot be blocked by how folder-picking grants turn out.
   */
  createFolder(name: string): Promise<DriveFile>;
  /**
   * Moves a folder to Drive's trash.
   *
   * Trashed rather than deleted: a trip holds boarding passes, and Drive keeps
   * trashed items recoverable for 30 days.
   */
  trashFolder(folderId: string): Promise<void>;
  getFile(fileId: string): Promise<DriveFile>;
  downloadFile(fileId: string): Promise<Blob>;
  downloadText(fileId: string): Promise<string>;
  uploadFile(request: UploadRequest): Promise<DriveFile>;
  /** Replaces a JSON file's entire content. */
  updateJson(fileId: string, value: unknown): Promise<DriveFile>;
  createJson(folderId: string, name: string, value: unknown): Promise<DriveFile>;
}

/** Fields sync depends on. Requesting less makes change detection impossible. */
export const FILE_FIELDS =
  'id,name,mimeType,modifiedTime,md5Checksum,size,version,appProperties,capabilities(canEdit)';
