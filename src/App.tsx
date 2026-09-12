import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ServicesProvider, useOnlineTracking, useServices } from './hooks/useServices';
import type { DriveClient } from './lib/drive/types';
import { TripShell } from './components/TripShell';
import { TripsScreen } from './routes/TripsScreen';
import { NowScreen } from './routes/NowScreen';
import { TimelineScreen } from './routes/TimelineScreen';
import { DocumentsScreen } from './routes/DocumentsScreen';
import { DocumentViewerScreen } from './routes/DocumentViewerScreen';
import { ImportScreen } from './routes/ImportScreen';
import { RouteScreen } from './routes/RouteScreen';
import { LegsScreen } from './routes/LegsScreen';
import { ItemFormScreen } from './routes/ItemFormScreen';

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
    <Routes>
      <Route path="/" element={<TripsScreen />} />

      {/* The viewer sits outside TripShell: it takes the whole screen, with no
          tab bar competing for space or for taps. */}
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
