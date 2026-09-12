import { useEffect } from 'react';
import { useAppState, useServices } from './useServices';
import type { LoadedTrip } from '../lib/app/appStore';

/**
 * Makes sure a screen has its trip, however it was reached.
 *
 * Reads local storage first, which is instant and works offline. Only if
 * nothing is held locally — a deep link, a shared URL, or reopening the
 * installed app straight onto this route — does it reconcile with Drive.
 *
 * This existed three times with three slightly different behaviours before
 * being pulled out, and each copy was a screen that reported "not found" when
 * the truth was "not loaded yet".
 */
export function useLoadedTrip(folderId: string): LoadedTrip | null {
  const { app } = useServices();
  const state = useAppState();

  useEffect(() => {
    void (async () => {
      await app.openTrip(folderId);
      if (!app.getSnapshot().current) await app.refresh(folderId);
    })();
  }, [app, folderId]);

  return state.current;
}
