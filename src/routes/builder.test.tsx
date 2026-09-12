import { describe, expect, test } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    await user.clear(screen.getByLabelText('Departure time'));
    await user.type(screen.getByLabelText('Departure time'), '11:40');

    await user.type(screen.getByLabelText('Arrives at'), 'Rome');
    await user.click(await screen.findByRole('button', { name: /^Rome/ }));
    await user.type(screen.getByLabelText('Arrival date'), '2026-05-09');
    await user.clear(screen.getByLabelText('Arrival time'));
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
    await user.clear(screen.getByLabelText('Check in time'));
    await user.type(screen.getByLabelText('Check in time'), '15:00');
    await user.type(screen.getByLabelText('Check out date'), '2026-05-13');
    await user.clear(screen.getByLabelText('Check out time'));
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

    // One night each, running from the trip's first day.
    expect(await screen.findByText(/Fri, May 8 – Sat, May 9/)).toBeInTheDocument();
    expect(screen.getByText(/Sat, May 9 – Sun, May 10/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'One night more in Rome' }));

    // Barcelona has to move with it — the whole point of entering nights.
    expect(await screen.findByText(/Sun, May 10 – Mon, May 11/)).toBeInTheDocument();
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

describe('a place that is not in the list', () => {
  test('accepts a typed name and gives it the zone of where you already are', async () => {
    // Positano has no time zone of its own and is in no list of cities. It is
    // still somewhere people stay, and it is plainly on Italian time.
    const { itinerary } = await renderAt(`/trip/${FOLDER}/item/new?type=lodging`, [
      stay('Naples', '2026-05-08', '2026-05-12'),
    ]);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Hotel or rental name'), 'Le Sirenuse');
    await user.type(screen.getByLabelText('City'), 'Positano');
    await user.click(await screen.findByRole('button', { name: /Use “Positano”/ }));
    await user.type(screen.getByLabelText('Check in date'), '2026-05-12');
    await user.clear(screen.getByLabelText('Check in time'));
    await user.type(screen.getByLabelText('Check in time'), '15:00');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      const added = (await itinerary()).items.find(
        (i: { title: string }) => i.title === 'Le Sirenuse',
      );
      expect(added.location.city).toBe('Positano');
      // Inherited from the Naples leg rather than asked for.
      expect(added.startsAt).toBe('2026-05-12T15:00:00+02:00');
    });
  });

  test('names where the zone came from, so a wrong one is visible', async () => {
    await renderAt(`/trip/${FOLDER}/item/new?type=lodging`, [
      stay('Naples', '2026-05-08', '2026-05-12'),
    ]);
    const user = userEvent.setup();

    // A date first: that is what lets the trip say where you already are.
    await user.type(await screen.findByLabelText('Check in date'), '2026-05-10');
    await user.type(screen.getByLabelText('City'), 'Positano');

    // "Naples time" rather than "Europe/Rome" — the place the traveller
    // recognises, not the zone identifier behind it.
    expect(
      await screen.findByRole('button', { name: /Use “Positano”.*Naples/ }),
    ).toBeInTheDocument();
  });

  test('still prefers a real match when there is one', async () => {
    await renderAt(`/trip/${FOLDER}/item/new?type=lodging`);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('City'), 'Naples');
    const options = await screen.findAllByRole('button', { name: /Naples/ });

    // The known city leads; the free-text escape hatch sits underneath it.
    expect(options[0]).toHaveTextContent('Italy');
  });
});

describe('entering a date without a time', () => {
  test('fills in a time rather than discarding the date', async () => {
    const { itinerary } = await renderAt(`/trip/${FOLDER}/item/new?type=flight`);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Flight or service number'), 'UA 123');
    await user.type(screen.getByLabelText('Departure date'), '2026-05-17');
    await user.type(screen.getByLabelText('Arrival date'), '2026-05-18');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      const [item] = (await itinerary()).items;
      // Requiring a time meant the dates were dropped entirely, which is the
      // opposite of "rough is fine".
      expect(item.startsAt).toMatch(/^2026-05-17T/);
      expect(item.endsAt).toMatch(/^2026-05-18T/);
    });
  });

  test('shows the time it filled in, so nothing is invented unseen', async () => {
    await renderAt(`/trip/${FOLDER}/item/new?type=flight`);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Departure date'), '2026-05-17');

    expect(await screen.findByLabelText('Departure time')).toHaveValue('12:00');
  });

  test('leaves a time alone once it has been typed', async () => {
    await renderAt(`/trip/${FOLDER}/item/new?type=flight`);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Departure time'), '06:30');
    await user.type(screen.getByLabelText('Departure date'), '2026-05-17');

    expect(screen.getByLabelText('Departure time')).toHaveValue('06:30');
  });
});

describe('the route start', () => {
  const overnightFlight = {
    id: 'out',
    type: 'flight',
    title: 'SAN → Naples',
    startsAt: '2026-05-08T16:00:00-07:00',
    endsAt: '2026-05-09T14:30:00+02:00',
  };

  test('begins on the day the flight lands, not the day it leaves', async () => {
    await renderAt(`/trip/${FOLDER}/route`, [overnightFlight]);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Add a place'), 'Rome');
    await user.click(await screen.findByRole('button', { name: /^Rome/ }));

    // Trip starts on the 8th; the flight lands on the 9th, and that is the
    // first night anyone needs a bed.
    expect(await screen.findByText(/Sat, May 9 – Sun, May 10/)).toBeInTheDocument();
  });

  test('starts a place at one night, not an assumed three', async () => {
    await renderAt(`/trip/${FOLDER}/route`, [overnightFlight]);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Add a place'), 'Rome');
    await user.click(await screen.findByRole('button', { name: /^Rome/ }));

    expect(await screen.findByText(/1 night ·/)).toBeInTheDocument();
  });

  test('lets the first day be corrected by hand', async () => {
    await renderAt(`/trip/${FOLDER}/route`, [overnightFlight]);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Add a place'), 'Rome');
    await user.click(await screen.findByRole('button', { name: /^Rome/ }));

    // A date input takes a whole value rather than keystrokes.
    fireEvent.change(screen.getByLabelText('First night'), {
      target: { value: '2026-05-11' },
    });

    // Everything downstream moves with it, same as changing a night count.
    expect(await screen.findByText(/Mon, May 11 – Tue, May 12/)).toBeInTheDocument();
  });
});

describe('answering a transition gap', () => {
  const twoCities = [
    stay('Rome', '2026-05-08', '2026-05-13'),
    stay('Barcelona', '2026-05-13', '2026-05-21', 'Europe/Madrid'),
  ];

  test('offers every way of getting there, not just the two with tickets', async () => {
    await renderAt(`/trip/${FOLDER}/legs`, twoCities);

    await screen.findByText(/Rome → Barcelona/);
    for (const how of ['Flight', 'Train', 'Ferry', 'Bus', 'Car or transfer', 'Other travel']) {
      expect(screen.getByRole('link', { name: how })).toBeInTheDocument();
    }
  });

  test('each one opens the form already dated to the day of the move', async () => {
    await renderAt(`/trip/${FOLDER}/legs`, twoCities);

    await screen.findByText(/Rome → Barcelona/);
    expect(screen.getByRole('link', { name: 'Ferry' })).toHaveAttribute(
      'href',
      expect.stringContaining('date=2026-05-13'),
    );
  });
});
