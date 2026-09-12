/**
 * Build-time configuration.
 *
 * The OAuth client id is public by design — it travels in every browser
 * request and is not a secret. There is no client secret anywhere in this app:
 * the browser uses PKCE, which does not have one. That is what makes publishing
 * this repository publicly safe.
 */

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

/**
 * The narrowest scope that does the job.
 *
 * `drive.file` reaches only files this app created or the user explicitly
 * picked. Every other file in the user's Drive is invisible to it, and this
 * scope avoids the verification review that full `drive` access triggers.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const isConfigured = (): boolean => GOOGLE_CLIENT_ID.length > 0;
