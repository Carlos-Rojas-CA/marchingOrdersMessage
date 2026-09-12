import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { FakeDriveClient } from '../drive/fakeDriveClient';
import { TripStore } from '../store/tripStore';
import { ITINERARY_FILENAME, SyncEngine } from '../sync/syncEngine';
import { AppStore } from './appStore';

const ITINERARY = {
  schemaVersion: 1,
  tripId: 't1',
  name: 'Japan 2026',
  items: [
    { id: 'i1', type: 'flight', title: 'AA123', startsAt: '2026-09-12T08:00:00-07:00' },
  ],
};

let drive: FakeDriveClient;
let store: TripStore;
let app: AppStore;

beforeEach(async () => {
  drive = new FakeDriveClient();
  store = await TripStore.open(`test-${Math.random().toString(36).slice(2)}`);
  app = new AppStore(store, new SyncEngine(drive, store));
});

afterEach(() => store.close());

describe('snapshot identity', () => {
  test('returns the same snapshot object while nothing has changed', async () => {
    // useSyncExternalStore re-renders whenever getSnapshot returns a new
    // reference. Building a fresh object each call would spin forever.
    expect(app.getSnapshot()).toBe(app.getSnapshot());
  });

  test('returns a new snapshot after state actually changes', async () => {
    const before = app.getSnapshot();
    app.setOnline(false);

    expect(app.getSnapshot()).not.toBe(before);
  });

  test('does not churn the snapshot when a setter changes nothing', () => {
    app.setOnline(false);
    const before = app.getSnapshot();

    app.setOnline(false);

    expect(app.getSnapshot()).toBe(before);
  });
});

describe('subscribers', () => {
  test('notifies on change', () => {
    const listener = vi.fn();
    app.subscribe(listener);

    app.setOnline(false);

    expect(listener).toHaveBeenCalled();
  });

  test('stops notifying once unsubscribed', () => {
    const listener = vi.fn();
    const unsubscribe = app.subscribe(listener);
    unsubscribe();

    app.setOnline(false);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('openTrip', () => {
  test('renders from local storage without contacting Drive', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    await new SyncEngine(drive, store).pull('folder-1');
    const listFolder = vi.spyOn(drive, 'listFolder');

    await app.openTrip('folder-1');

    // The whole design rests on this: a render never waits on the network.
    expect(listFolder).not.toHaveBeenCalled();
    expect(app.getSnapshot().current?.doc.name).toBe('Japan 2026');
  });

  test('reports a trip that is not held locally', async () => {
    await app.openTrip('never-seen');

    expect(app.getSnapshot().current).toBeNull();
  });
});

describe('refresh', () => {
  test('pulls Drive changes into the rendered trip', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    await app.refresh('folder-1');

    expect(app.getSnapshot().current?.doc.name).toBe('Japan 2026');
  });

  test('clears the syncing flag when it finishes', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);

    await app.refresh('folder-1');

    expect(app.getSnapshot().syncing).toBe(false);
  });

  test('keeps showing the loaded trip when a refresh fails', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    await app.refresh('folder-1');
    vi.spyOn(drive, 'listFolder').mockRejectedValue(new Error('offline'));

    await app.refresh('folder-1');

    // Losing the itinerary because a background refresh failed would be the
    // opposite of what this app is for.
    expect(app.getSnapshot().current?.doc.name).toBe('Japan 2026');
    expect(app.getSnapshot().syncError).toBe('offline');
  });

  test('clears a previous error after a refresh succeeds', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    const failing = vi.spyOn(drive, 'listFolder').mockRejectedValue(new Error('offline'));
    await app.refresh('folder-1');
    failing.mockRestore();

    await app.refresh('folder-1');

    expect(app.getSnapshot().syncError).toBeNull();
  });

  test('does not attempt a refresh while offline', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    app.setOnline(false);
    const listFolder = vi.spyOn(drive, 'listFolder');

    await app.refresh('folder-1');

    expect(listFolder).not.toHaveBeenCalled();
  });
});

describe('loadTrips', () => {
  test('lists the trips held locally', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    await new SyncEngine(drive, store).pull('folder-1');

    await app.loadTrips();

    expect(app.getSnapshot().trips.map((t) => t.name)).toEqual(['Japan 2026']);
  });
});

describe('account changes', () => {
  async function tripInStore() {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    await app.refresh('folder-1');
  }

  test('records the account the local data belongs to', async () => {
    await app.reconcileAccount();

    expect(app.getSnapshot().account).toBe('tester@example.com');
  });

  test('keeps local trips when the same account signs in again', async () => {
    await tripInStore();
    await app.reconcileAccount();

    await app.reconcileAccount();

    expect((await store.listTrips())).toHaveLength(1);
  });

  test('wipes local trips when a different account signs in', async () => {
    await tripInStore();
    await app.reconcileAccount();

    drive.currentUser = { email: 'someone-else@example.com' };
    await app.reconcileAccount();

    // The new account cannot read the old account's Drive, so keeping these
    // would show a list of trips that mysteriously refuse to open.
    expect(await store.listTrips()).toEqual([]);
    expect(app.getSnapshot().trips).toEqual([]);
  });

  test('records the new account after a switch', async () => {
    await tripInStore();
    await app.reconcileAccount();

    drive.currentUser = { email: 'someone-else@example.com' };
    await app.reconcileAccount();

    expect(app.getSnapshot().account).toBe('someone-else@example.com');
  });

  test('does not wipe anything when the account cannot be determined', async () => {
    await tripInStore();
    await app.reconcileAccount();
    vi.spyOn(drive, 'getCurrentUser').mockRejectedValue(new Error('offline'));

    await app.reconcileAccount();

    // A failed identity check is not evidence of a different user. Deleting
    // downloaded documents because the network blipped would be unforgivable.
    expect(await store.listTrips()).toHaveLength(1);
  });
});

describe('signOut', () => {
  test('clears local data and the recorded account', async () => {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    await app.refresh('folder-1');
    await app.reconcileAccount();

    await app.signOut();

    expect(await store.listTrips()).toEqual([]);
    expect(app.getSnapshot().account).toBeNull();
    expect(app.getSnapshot().current).toBeNull();
  });
});
