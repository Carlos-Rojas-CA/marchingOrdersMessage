import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TripsScreen } from '../routes/TripsScreen';
import { ServicesProvider } from '../hooks/useServices';
import { FakeDriveClient } from '../lib/drive/fakeDriveClient';
import { TripStore } from '../lib/store/tripStore';
import { SyncEngine } from '../lib/sync/syncEngine';
import { ITINERARY_FILENAME } from '../lib/sync/syncEngine';

const ITINERARY = { schemaVersion: 1, tripId: 't1', name: 'Test 1', items: [] };

/**
 * Seeds a store with a trip that has no account recorded against it — the
 * state that produced "Not signed in" sitting directly above a trip list.
 */
async function renderTrips({ withOrphanTrip }: { withOrphanTrip: boolean }) {
  const drive = new FakeDriveClient();
  const storeName = `test-${Math.random().toString(36).slice(2)}`;

  if (withOrphanTrip) {
    drive.seedJson('folder-1', ITINERARY_FILENAME, ITINERARY);
    const store = await TripStore.open(storeName);
    await new SyncEngine(drive, store).pull('folder-1');
    // Deliberately no setAccount: this is data from before the app tracked
    // which account it belonged to.
    store.close();
  }

  return render(
    <ServicesProvider drive={drive} storeName={storeName} fallback={<p>Loading…</p>}>
      <MemoryRouter initialEntries={['/']}>
        <TripsScreen />
      </MemoryRouter>
    </ServicesProvider>,
  );
}

describe('AccountBar', () => {
  test('does not claim you are signed out of trips you can already read', async () => {
    await renderTrips({ withOrphanTrip: true });

    // The reported bug: "Creating a trip will sign you in" sitting above a
    // trip that plainly already exists.
    expect(await screen.findByText('Test 1')).toBeInTheDocument();
    expect(screen.queryByText(/Creating a trip will sign you in/)).not.toBeInTheDocument();
  });

  test('says the trip is on the device and offers to sync it', async () => {
    await renderTrips({ withOrphanTrip: true });

    await screen.findByText('Test 1');
    expect(screen.getByText(/saved on this device and will open offline/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  test('keeps the simpler wording when there is nothing saved yet', async () => {
    await renderTrips({ withOrphanTrip: false });

    expect(
      await screen.findByText(/Creating a trip will sign you in/),
    ).toBeInTheDocument();
  });
});
