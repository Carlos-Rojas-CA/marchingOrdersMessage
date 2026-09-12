import { describe, expect, test } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ItemFormScreen } from './ItemFormScreen';
import { RouteScreen } from './RouteScreen';
import { LegsScreen } from './LegsScreen';
import { ServicesProvider } from '../hooks/useServices';
import { FakeDriveClient } from '../lib/drive/fakeDriveClient';
import { ITINERARY_FILENAME } from '../lib/sync/syncEngine';

const FOLDER = 'folder-1';

async function renderAt(path: string, items: unknown[] = []) {
  const drive = new FakeDriveClient();
  drive.seedJson(FOLDER, ITINERARY_FILENAME, {
    schemaVersion: 1,
    tripId: 't1',
    name: 'Europe 2026',
    startDate: '2026-05-08',
    endDate: '2026-05-21',
    items,
  });

  const result = render(
    <ServicesProvider
      drive={drive}
      storeName={`test-${Math.random().toString(36).slice(2)}`}
      fallback={<p>Loading…</p>}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/trip/:folderId/route" element={<RouteScreen />} />
          <Route path="/trip/:folderId/legs" element={<LegsScreen />} />
          <Route path="/trip/:folderId/item/new" element={<ItemFormScreen />} />
        </Routes>
      </MemoryRouter>
    </ServicesProvider>,
  );

  async function itinerary() {
    const file = (await drive.listFolder(FOLDER)).find(
      (f) => f.name === ITINERARY_FILENAME,
    )!;
    return JSON.parse(await drive.downloadText(file.id));
  }

  return { ...result, drive, itinerary };
}

const stay = (city: string, from: string, to: string, tz = 'Europe/Rome') => ({
  id: `stay-${city}`,
  type: 'lodging',
  title: `Hotel ${city}`,
  startsAt: `${from}T15:00:00+02:00`,
  endsAt: `${to}T11:00:00+02:00`,
  location: { name: `Hotel ${city}`, city, timeZone: tz },
});

describe('adding a flight', () => {
  test('stamps departure and arrival with their own time zones', async () => {
    const { itinerary } = await renderAt(`/trip/${FOLDER}/item/new?type=flight`);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Flight or service number'), 'UA 123');

    await user.type(screen.getByLabelText('Departs from'), 'San Diego');
    await user.click(await screen.findByRole('button', { name: /San Diego/ }));
    await user.type(screen.getByLabelText('Departure date'), '2026-05-08');
    await user.type(screen.getByLabelText('Departure time'), '11:40');

    await user.type(screen.getByLabelText('Arrives at'), 'Rome');
    await user.click(await screen.findByRole('button', { name: /^Rome/ }));
    await user.type(screen.getByLabelText('Arrival date'), '2026-05-09');
    await user.type(screen.getByLabelText('Arrival time'), '13:25');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      const [item] = (await itinerary()).items;
      // The case the whole design exists for: one item, two different zones,
      // neither of them typed by a person.
      expect(item.startsAt).toBe('2026-05-08T11:40:00-07:00');
      expect(item.endsAt).toBe('2026-05-09T13:25:00+02:00');
    });
  });

  test('shows the offset it resolved to, so a wrong one is caught at entry', async () => {
    await renderAt(`/trip/${FOLDER}/item/new?type=flight`);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Departs from'), 'San Diego');
    await user.click(await screen.findByRole('button', { name: /San Diego/ }));
    await user.type(screen.getByLabelText('Departure date'), '2026-05-08');

    expect(await screen.findByText(/-07:00/)).toBeInTheDocument();
  });
});

describe('adding a stay', () => {
  test('records the address and phone alongside the span', async () => {
    const { itinerary } = await renderAt(`/trip/${FOLDER}/item/new?type=lodging`);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Hotel or rental name'), 'Hotel Artemide');
    await user.type(screen.getByLabelText('City'), 'Rome');
    await user.click(await screen.findByRole('button', { name: /^Rome/ }));
    await user.type(screen.getByLabelText('Check in date'), '2026-05-09');
    await user.type(screen.getByLabelText('Check in time'), '15:00');
    await user.type(screen.getByLabelText('Check out date'), '2026-05-13');
    await user.type(screen.getByLabelText('Check out time'), '11:00');
    await user.type(screen.getByLabelText('Address'), 'Via Nazionale, 22');
    await user.type(screen.getByLabelText('Phone'), '+39-06-489911');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      const [item] = (await itinerary()).items;
      expect(item.startsAt).toBe('2026-05-09T15:00:00+02:00');
      expect(item.endsAt).toBe('2026-05-13T11:00:00+02:00');
      expect(item.location.phone).toBe('+39-06-489911');
      expect(item.location.city).toBe('Rome');
    });
  });
});

describe('the route sketch', () => {
  test('turns nights into dates and cascades a change through later stops', async () => {
    await renderAt(`/trip/${FOLDER}/route`);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Add a place'), 'Rome');
    await user.click(await screen.findByRole('button', { name: /^Rome/ }));
    await user.type(await screen.findByLabelText('Add a place'), 'Barcelona');
    await user.click(await screen.findByRole('button', { name: /^Barcelona/ }));

    // Three nights each, running from the trip's first day.
    expect(await screen.findByText(/Fri, May 8 – Mon, May 11/)).toBeInTheDocument();
    expect(screen.getByText(/Mon, May 11 – Thu, May 14/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'One night more in Rome' }));

    // Barcelona has to move with it — the whole point of entering nights.
    expect(await screen.findByText(/Tue, May 12 – Fri, May 15/)).toBeInTheDocument();
  });

  test('writes one stay per stop', async () => {
    const { itinerary } = await renderAt(`/trip/${FOLDER}/route`);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Add a place'), 'Rome');
    await user.click(await screen.findByRole('button', { name: /^Rome/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(async () => {
      const items = (await itinerary()).items;
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('lodging');
      expect(items[0].location.city).toBe('Rome');
    });
  });
});

describe('the legs screen', () => {
  test('warns about nights with nowhere to sleep', async () => {
    await renderAt(`/trip/${FOLDER}/legs`, [stay('Rome', '2026-05-09', '2026-05-13')]);

    // Both ends are uncovered: the night before checking in, and the eight
    // after checking out.
    const warnings = await screen.findAllByText(/No stay for/);
    expect(warnings).toHaveLength(2);
    expect(warnings[1]).toHaveTextContent('Wed, May 13 – Thu, May 21');
  });

  test('warns about a move between cities with nothing booked', async () => {
    await renderAt(`/trip/${FOLDER}/legs`, [
      stay('Rome', '2026-05-08', '2026-05-13'),
      stay('Barcelona', '2026-05-13', '2026-05-21', 'Europe/Madrid'),
    ]);

    // The mistake that actually happens on a multi-country trip.
    expect(await screen.findByText(/Rome → Barcelona/)).toBeInTheDocument();
    expect(screen.getByText(/nothing booked to get you there/)).toBeInTheDocument();
  });

  test('says so plainly when nothing is missing', async () => {
    await renderAt(`/trip/${FOLDER}/legs`, [
      stay('Rome', '2026-05-08', '2026-05-13'),
      stay('Rome', '2026-05-13', '2026-05-21'),
    ]);

    expect(
      await screen.findByText(/Every night has a bed/),
    ).toBeInTheDocument();
  });
});
