import type { Itinerary } from '../model/itinerary';
import type { AttachmentRecord, TripRecord, TripStore } from '../store/tripStore';
import type { SyncEngine } from '../sync/syncEngine';

export interface LoadedTrip {
  trip: TripRecord;
  doc: Itinerary;
  attachments: AttachmentRecord[];
}

export interface AppState {
  trips: TripRecord[];
  current: LoadedTrip | null;
  syncing: boolean;
  syncError: string | null;
  online: boolean;
  /** The Google account this device's data belongs to, once known. */
  account: string | null;
}

type Listener = () => void;

/**
 * The state the React tree renders from.
 *
 * Reads come from the local store and never await the network; `refresh` runs
 * Drive reconciliation in the background and updates state when it lands. A
 * failed refresh leaves the loaded trip exactly where it was — losing an
 * itinerary because a background sync failed would defeat the point of the app.
 */
export class AppStore {
  #state: AppState = {
    trips: [],
    current: null,
    syncing: false,
    syncError: null,
    online: true,
    account: null,
  };
  #listeners = new Set<Listener>();

  constructor(
    private readonly store: TripStore,
    private readonly sync: SyncEngine,
  ) {}

  /**
   * Returns a stable reference until something actually changes.
   *
   * `useSyncExternalStore` re-renders whenever this returns a new object, so
   * building a fresh snapshot per call would loop forever.
   */
  getSnapshot = (): AppState => this.#state;

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Replaces state only if a field actually differs, then notifies. */
  #update(patch: Partial<AppState>): void {
    const next = { ...this.#state, ...patch };
    const changed = (Object.keys(patch) as (keyof AppState)[]).some(
      (key) => this.#state[key] !== next[key],
    );
    if (!changed) return;

    this.#state = next;
    for (const listener of this.#listeners) listener();
  }

  setOnline(online: boolean): void {
    this.#update({ online });
  }

  async loadTrips(): Promise<void> {
    this.#update({ trips: await this.store.listTrips() });
  }

  /** The account recorded locally, without asking Drive. */
  async loadAccount(): Promise<void> {
    this.#update({ account: (await this.store.getAccount()) ?? null });
  }

  /**
   * Checks who is signed in and clears local data if it is someone new.
   *
   * Trips belong to one Google account's Drive; another account cannot read
   * them. Keeping them across a switch would show a list of trips that
   * mysteriously refuse to open.
   *
   * A failed identity check is deliberately *not* treated as a changed
   * account. Being offline is not evidence of a different user, and deleting
   * someone's downloaded documents because the network blipped would be
   * unforgivable.
   */
  async reconcileAccount(): Promise<void> {
    let email: string;
    try {
      email = (await this.sync.currentUser()).email;
    } catch {
      return;
    }
    if (!email) return;

    const previous = await this.store.getAccount();
    if (previous !== undefined && previous !== email) {
      await this.store.clearAll();
      this.#update({ current: null });
    }

    await this.store.setAccount(email);
    this.#update({ account: email, trips: await this.store.listTrips() });
  }

  /** Removes one trip, optionally trashing its Drive folder too. */
  async deleteTrip(folderId: string, options: { fromDrive: boolean }): Promise<void> {
    try {
      await this.sync.deleteTrip(folderId, options);
    } finally {
      // The local records are gone whether or not Drive cooperated, so the
      // list must reflect that either way.
      this.#update({
        trips: await this.store.listTrips(),
        current:
          this.#state.current?.trip.folderId === folderId ? null : this.#state.current,
      });
    }
  }

  /** Forgets everything held for the current account. */
  async signOut(): Promise<void> {
    await this.store.clearAll();
    this.#update({ account: null, current: null, trips: [], syncError: null });
  }

  /** Loads a trip from local storage. Touches no network. */
  async openTrip(folderId: string): Promise<void> {
    const loaded = await this.#read(folderId);
    this.#update({ current: loaded });
  }

  async #read(folderId: string): Promise<LoadedTrip | null> {
    const [trip, itinerary] = await Promise.all([
      this.store.getTrip(folderId),
      this.store.getItinerary(folderId),
    ]);
    if (!trip || !itinerary) return null;
    return {
      trip,
      doc: itinerary.doc,
      attachments: await this.store.listAttachments(folderId),
    };
  }

  /**
   * Reconciles one trip with Drive, then re-reads local state.
   *
   * Never throws: a sync failure is reported through `syncError` rather than
   * propagating into a render.
   */
  async refresh(folderId: string): Promise<void> {
    if (!this.#state.online) return;

    this.#update({ syncing: true });
    try {
      await this.sync.pull(folderId);
      this.#update({
        current: await this.#read(folderId),
        trips: await this.store.listTrips(),
        syncError: null,
      });
    } catch (error) {
      this.#update({
        syncError: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.#update({ syncing: false });
    }
  }

  async downloadForOffline(
    folderId: string,
    onProgress?: (p: { completed: number; total: number }) => void,
  ): Promise<{ cached: number; failed: string[] }> {
    const result = await this.sync.downloadForOffline(folderId, onProgress);
    this.#update({ current: await this.#read(folderId) });
    return result;
  }

  async evictOffline(folderId: string): Promise<void> {
    await this.sync.evictOffline(folderId);
    this.#update({ current: await this.#read(folderId) });
  }
}
