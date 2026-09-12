import { describe, expect, test } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ImportScreen } from './ImportScreen';
import { TimelineScreen } from './TimelineScreen';
import { TripShell } from '../components/TripShell';
import { ServicesProvider } from '../hooks/useServices';
import { FakeDriveClient } from '../lib/drive/fakeDriveClient';
import { ITINERARY_FILENAME } from '../lib/sync/syncEngine';

const FOLDER = 'folder-1';

const EMPTY_TRIP = {
  schemaVersion: 1,
  tripId: 't1',
  name: 'Japan 2026',
  items: [],
};

const PASTED = JSON.stringify({
  schemaVersion: 1,
  tripId: 'pasted',
  name: 'Whatever',
  items: [
    {
      id: 'flight',
      type: 'flight',
      title: 'AA123 SFO → NRT',
      startsAt: '2026-09-12T08:15:00-07:00',
    },
  ],
});

function renderImport() {
  const drive = new FakeDriveClient();
  drive.seedJson(FOLDER, ITINERARY_FILENAME, EMPTY_TRIP);

  const result = render(
    <ServicesProvider
      drive={drive}
      storeName={`test-${Math.random().toString(36).slice(2)}`}
      fallback={<p>Loading…</p>}
    >
      <MemoryRouter initialEntries={[`/trip/${FOLDER}/import`]}>
        <Routes>
          <Route path="/trip/:folderId/import" element={<ImportScreen />} />
          <Route path="/trip/:folderId" element={<TripShell />}>
            <Route path="timeline" element={<TimelineScreen />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ServicesProvider>,
  );

  return { ...result, drive };
}

describe('ImportScreen', () => {
  test('writes a pasted itinerary through to Drive', async () => {
    const { drive } = renderImport();
    const user = userEvent.setup();

    const box = await screen.findByLabelText('Itinerary JSON');
    await user.click(box);
    await user.paste(PASTED);
    await user.click(screen.getByRole('button', { name: /save to drive/i }));

    await waitFor(async () => {
      const file = (await drive.listFolder(FOLDER)).find(
        (f) => f.name === ITINERARY_FILENAME,
      )!;
      const written = JSON.parse(await drive.downloadText(file.id));
      expect(written.items).toHaveLength(1);
    });
  });

  test('shows the imported trip once it lands', async () => {
    renderImport();
    const user = userEvent.setup();

    const box = await screen.findByLabelText('Itinerary JSON');
    await user.click(box);
    await user.paste(PASTED);
    await user.click(screen.getByRole('button', { name: /save to drive/i }));

    expect(await screen.findByText('AA123 SFO → NRT')).toBeInTheDocument();
  });

  test('names malformed JSON as such rather than blaming the itinerary', async () => {
    renderImport();
    const user = userEvent.setup();

    const box = await screen.findByLabelText('Itinerary JSON');
    await user.click(box);
    await user.paste('{ "name": "Japan", }');
    await user.click(screen.getByRole('button', { name: /save to drive/i }));

    // "Not JSON" and "not an itinerary" are different problems with different
    // fixes, and saying which saves a lot of squinting.
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid JSON/i);
  });

  test('rejects valid JSON that is not an itinerary', async () => {
    renderImport();
    const user = userEvent.setup();

    const box = await screen.findByLabelText('Itinerary JSON');
    await user.click(box);
    await user.paste('{ "hello": "world" }');
    await user.click(screen.getByRole('button', { name: /save to drive/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  test('leaves the trip untouched when the paste is rejected', async () => {
    const { drive } = renderImport();
    const user = userEvent.setup();

    const box = await screen.findByLabelText('Itinerary JSON');
    await user.click(box);
    await user.paste('{ "hello": "world" }');
    await user.click(screen.getByRole('button', { name: /save to drive/i }));
    await screen.findByRole('alert');

    const file = (await drive.listFolder(FOLDER)).find(
      (f) => f.name === ITINERARY_FILENAME,
    )!;
    expect(JSON.parse(await drive.downloadText(file.id)).name).toBe('Japan 2026');
  });
});
