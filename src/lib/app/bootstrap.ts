import { GOOGLE_CLIENT_ID } from '../../config';
import { createGisTokenSource } from '../auth/gisTokenSource';
import { GoogleAuth } from '../auth/googleAuth';
import { GoogleDriveClient } from '../drive/googleDriveClient';
import type { DriveClient } from '../drive/types';
import { TripStore } from '../store/tripStore';
import { SyncEngine } from '../sync/syncEngine';
import { AppStore } from './appStore';

export interface Services {
  store: TripStore;
  sync: SyncEngine;
  app: AppStore;
  auth: GoogleAuth;
}

/**
 * Assembles the object graph.
 *
 * `drive` is injectable so tests and previews can run the whole app against
 * `FakeDriveClient` — no credentials, no network, no quota. `storeName` lets
 * tests each get their own IndexedDB rather than sharing global state.
 */
export async function bootstrap(
  drive?: DriveClient,
  storeName?: string,
): Promise<Services> {
  // With an injected Drive — demo mode, or a test — there is no Google in the
  // picture, so the token source must never be reached. Handing it a stub is
  // clearer than scattering "unless we are pretending" checks through the UI.
  const auth = drive
    ? new GoogleAuth({
        request: async () => ({ accessToken: 'offline', expiresInSeconds: 3600 }),
      })
    : new GoogleAuth(createGisTokenSource(GOOGLE_CLIENT_ID));

  // The stub is primed so it reports as signed in: against a fake Drive there
  // is nothing to sign in to, and the guards that skip syncing without a token
  // should not mistake that for being signed out.
  if (drive) await auth.signIn();

  const driveClient =
    drive ??
    new GoogleDriveClient({ getAccessToken: () => auth.getAccessToken() });

  const store = await TripStore.open(storeName);
  const sync = new SyncEngine(driveClient, store);
  const app = new AppStore(store, sync);

  app.setOnline(navigator.onLine);
  await app.loadTrips();

  return { store, sync, app, auth };
}
