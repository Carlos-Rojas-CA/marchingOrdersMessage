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
  const auth = new GoogleAuth(createGisTokenSource(GOOGLE_CLIENT_ID));
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
