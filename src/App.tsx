import { lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ServicesProvider, useOnlineTracking, useServices } from './hooks/useServices';
import type { DriveClient } from './lib/drive/types';
import { TripShell } from './components/TripShell';
import { TripsScreen } from './routes/TripsScreen';
import { NowScreen } from './routes/NowScreen';
import { TimelineScreen } from './routes/TimelineScreen';
import { DocumentsScreen } from './routes/DocumentsScreen';
import { DocumentViewerScreen } from './routes/DocumentViewerScreen';

/*
 * The builder is loaded on demand.
 *
 * Planning a trip and carrying one are different occasions: the forms, the
 * route sketch and the leg warnings are only ever reached from inside a trip,
 * and never at all on the journey the app exists for. Paying for them in the
 * first download made opening a boarding pass slower to fund a screen that is
 * not being opened.
 *
 * The viewer stays eager on purpose — see below.
 */
const RouteScreen = lazy(() =>
  import('./routes/RouteScreen').then((m) => ({ default: m.RouteScreen })),
);
const LegsScreen = lazy(() =>
  import('./routes/LegsScreen').then((m) => ({ default: m.LegsScreen })),
);
const ItemFormScreen = lazy(() =>
  import('./routes/ItemFormScreen').then((m) => ({ default: m.ItemFormScreen })),
);
const ImportScreen = lazy(() =>
  import('./routes/ImportScreen').then((m) => ({ default: m.ImportScreen })),
);

function Splash() {
  return (
    <div className="flex min-h-full items-center justify-center text-sm text-muted">
      Loading…
    </div>
  );
}

/** Demo only: pulls the seeded folder once so a trip exists to open. */
function DemoSeed() {
  const { sync, app } = useServices();

  useEffect(() => {
    void (async () => {
      const { DEMO_FOLDER_ID } = await import('./lib/app/demoTrip');
      await sync.pull(DEMO_FOLDER_ID);
      await app.loadTrips();
    })();
  }, [sync, app]);

  return null;
}

function Router() {
  useOnlineTracking();

  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/" element={<TripsScreen />} />

        {/* The viewer sits outside TripShell: it takes the whole screen, with no
            tab bar competing for space or for taps.

            It is also deliberately not lazy. It is the one screen that has to
            open at a gate, on a dead connection, and a chunk that was never
            fetched while online is a chunk that is not there. */}
        <Route path="/trip/:folderId/doc/:fileId" element={<DocumentViewerScreen />} />
        <Route path="/trip/:folderId/import" element={<ImportScreen />} />

        {/* Builder screens stand alone: each is a focused task, and the tab bar
            would compete for both space and attention. */}
        <Route path="/trip/:folderId/route" element={<RouteScreen />} />
        <Route path="/trip/:folderId/legs" element={<LegsScreen />} />
        <Route path="/trip/:folderId/item/new" element={<ItemFormScreen />} />
        <Route path="/trip/:folderId/item/:itemId" element={<ItemFormScreen />} />

        <Route path="/trip/:folderId" element={<TripShell />}>
          <Route index element={<NowScreen />} />
          <Route path="timeline" element={<TimelineScreen />} />
          <Route path="documents" element={<DocumentsScreen />} />
        </Route>

        <Route path="*" element={<TripsScreen />} />
      </Routes>
    </Suspense>
  );
}

/**
 * Runs the whole app against the in-memory Drive when VITE_DEMO=1.
 *
 * Same fake the sync tests use, so the app can be opened and inspected with no
 * Google credentials, no network and no quota.
 */
function useDemoDrive(): DriveClient | undefined | null {
  const enabled = import.meta.env.VITE_DEMO === '1';
  const [drive, setDrive] = useState<DriveClient | null>(null);

  useEffect(() => {
    if (!enabled) return;
    void import('./lib/app/demoTrip').then(async ({ createDemoDrive }) => {
      setDrive(await createDemoDrive());
    });
  }, [enabled]);

  if (!enabled) return undefined;
  return drive;
}

export default function App() {
  const demoDrive = useDemoDrive();

  // Demo mode has to wait for its seeded Drive; a normal build never does.
  if (demoDrive === null) return <Splash />;

  return (
    <ServicesProvider drive={demoDrive} fallback={<Splash />}>
      {demoDrive ? <DemoSeed /> : null}
      <Router />
    </ServicesProvider>
  );
}
