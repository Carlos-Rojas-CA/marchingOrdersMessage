import { DRIVE_SCOPE } from '../../config';
import type { TokenGrant, TokenSource } from './googleAuth';

/**
 * Adapter from Google Identity Services to the `TokenSource` seam.
 *
 * All the interesting logic — caching, early renewal, silent-then-interactive —
 * lives in `GoogleAuth` and is unit tested. This file is the untestable part:
 * loading Google's script and translating its callback API into promises.
 */

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface GisTokenClient {
  callback: (response: GisTokenResponse) => void;
  error_callback?: (error: { type?: string; message?: string }) => void;
  requestAccessToken(options?: { prompt?: string }): void;
}

interface GoogleGlobal {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: GisTokenResponse) => void;
        error_callback?: (error: { type?: string; message?: string }) => void;
      }): GisTokenClient;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleGlobal;
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';

let scriptPromise: Promise<void> | null = null;

/** Loads Google's script once, no matter how many callers ask. */
function loadGis(): Promise<void> {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      // Reset so a later attempt (back online) can retry rather than being
      // stuck with a permanently rejected promise.
      scriptPromise = null;
      reject(new Error('Could not load Google sign-in. Are you offline?'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function createGisTokenSource(clientId: string): TokenSource {
  let client: GisTokenClient | null = null;

  return {
    async request({ silent }): Promise<TokenGrant> {
      await loadGis();
      const google = window.google;
      if (!google) throw new Error('Google sign-in is unavailable.');

      client ??= google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        // Replaced per request below; GIS requires one at construction.
        callback: () => {},
      });

      return await new Promise<TokenGrant>((resolve, reject) => {
        const active = client!;
        active.callback = (response) => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error ?? 'Authorization was not granted.'));
            return;
          }
          resolve({
            accessToken: response.access_token,
            expiresInSeconds: response.expires_in ?? 3600,
          });
        };
        active.error_callback = (error) => {
          reject(new Error(error.message ?? error.type ?? 'Sign-in was dismissed.'));
        };

        // An empty prompt asks Google to reuse the existing session without
        // showing anything; it fails if there is no session, and GoogleAuth
        // then retries interactively.
        active.requestAccessToken({ prompt: silent ? '' : 'consent' });
      });
    },
  };
}
