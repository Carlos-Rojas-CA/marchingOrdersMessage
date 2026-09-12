import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { bootstrap, type Services } from '../lib/app/bootstrap';
import type { AppState } from '../lib/app/appStore';
import type { DriveClient } from '../lib/drive/types';

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({
  children,
  drive,
  fallback,
  storeName,
}: {
  children: ReactNode;
  /** Injectable so previews and tests can run against a fake Drive. */
  drive?: DriveClient;
  fallback?: ReactNode;
  /** Lets each test own its IndexedDB instead of sharing one. */
  storeName?: string;
}) {
  const [services, setServices] = useState<Services | null>(null);

  useEffect(() => {
    let cancelled = false;
    void bootstrap(drive, storeName).then((ready) => {
      if (!cancelled) setServices(ready);
    });
    return () => {
      cancelled = true;
    };
  }, [drive, storeName]);

  if (!services) return <>{fallback ?? null}</>;

  return (
    <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>
  );
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside a ServicesProvider');
  return services;
}

/** Subscribes to app state. The snapshot is reference-stable between changes. */
export function useAppState(): AppState {
  const { app } = useServices();
  return useSyncExternalStore(app.subscribe, app.getSnapshot, app.getSnapshot);
}

/** Keeps app state in step with the browser's view of connectivity. */
export function useOnlineTracking(): void {
  const { app } = useServices();

  useEffect(() => {
    const update = () => app.setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [app]);
}
