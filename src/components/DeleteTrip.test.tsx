import { describe, expect, test } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TripsScreen } from '../routes/TripsScreen';
import { ServicesProvider } from '../hooks/useServices';
import { FakeDriveClient } from '../lib/drive/fakeDriveClient';
import { TripStore } from '../lib/store/tripStore';
import { SyncEngine, ITINERARY_FILENAME } from '../lib/sync/syncEngine';

async function renderTrips() {
  const drive = new FakeDriveClient();
  const storeName = `test-${Math.random().toString(36).slice(2)}`;

  for (const [folderId, name] of [
    ['folder-1', 'Test 1'],
    ['folder-2', 'Test 2'],
  ]) {
    drive.seedJson(folderId!, ITINERARY_FILENAME, {
      schemaVersion: 1,
      tripId: folderId,
      name,
      items: [],
    });
  }

  const store = await TripStore.open(storeName);
  const sync = new SyncEngine(drive, store);
  await sync.pull('folder-1');
  await sync.pull('folder-2');
  store.close();

  const result = render(
    <ServicesProvider drive={drive} storeName={storeName} fallback={<p>Loading…</p>}>
      <MemoryRouter initialEntries={['/']}>
        <TripsScreen />
      </MemoryRouter>
    </ServicesProvider>,
  );

  return { ...result, drive };
}

describe('deleting a trip', () => {
  test('asks before doing anything', async () => {
    await renderTrips();
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Delete Test 1'));

    expect(await screen.findByRole('dialog', { name: /Delete Test 1/ })).toBeInTheDocument();
    // Nothing has happened yet.
    expect(screen.getByText('Test 1')).toBeInTheDocument();
  });

  test('names the trip in the question, not just "this trip"', async () => {
    await renderTrips();
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Delete Test 1'));

    expect(await screen.findByText(/Delete “Test 1”\?/)).toBeInTheDocument();
  });

  test('says that Drive keeps it recoverable', async () => {
    await renderTrips();
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Delete Test 1'));

    expect(await screen.findByText(/30 days/)).toBeInTheDocument();
  });

  test('cancelling leaves the trip alone', async () => {
    await renderTrips();
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Delete Test 1'));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Test 1')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('removing from the device leaves the Drive folder intact', async () => {
    const { drive } = await renderTrips();
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Delete Test 1'));
    await user.click(
      await screen.findByRole('button', { name: 'Remove from this device only' }),
    );

    await waitFor(() => expect(screen.queryByText('Test 1')).not.toBeInTheDocument());
    expect(await drive.listFolder('folder-1')).not.toHaveLength(0);
  });

  test('deleting trashes the Drive folder too', async () => {
    const { drive } = await renderTrips();
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Delete Test 1'));
    await user.click(
      await screen.findByRole('button', { name: 'Delete and trash in Drive' }),
    );

    await waitFor(async () => {
      expect(await drive.listFolder('folder-1')).toHaveLength(0);
    });
  });

  test('leaves the other trip alone', async () => {
    const { drive } = await renderTrips();
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Delete Test 1'));
    await user.click(
      await screen.findByRole('button', { name: 'Delete and trash in Drive' }),
    );

    // Over-deleting is the failure that would hurt most, so it gets its own
    // test rather than riding along with the one above.
    await waitFor(() => expect(screen.queryByText('Test 1')).not.toBeInTheDocument());
    expect(screen.getByText('Test 2')).toBeInTheDocument();
    expect(await drive.listFolder('folder-2')).not.toHaveLength(0);
  });
});
