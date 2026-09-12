import { NavLink, Outlet, useParams } from 'react-router-dom';
import {
  CalendarDays,
  ChevronLeft,
  Clock,
  FileText,
  Map,
  Plus,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAppState, useServices } from '../hooks/useServices';
import { cn } from './ui';
import { formatDayLabel } from '../lib/model/format';
import { AddSheet } from './AddSheet';
import { SyncBanner } from './SyncBanner';

/**
 * Frame around the three lenses onto a trip.
 *
 * The lenses are a flat, always-visible choice rather than a menu: the whole
 * point of Documents is that it is one tap away when you are standing at a gate.
 */
function TabLink({
  to,
  end,
  icon: Icon,
  label,
}: {
  to: string;
  end?: boolean;
  icon: typeof Clock;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex flex-1 flex-col items-center gap-1 py-2 font-display text-[0.7rem] font-semibold tracking-wide',
          isActive ? 'text-accent' : 'text-muted',
        )
      }
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </NavLink>
  );
}

export function TripShell() {
  const { folderId = '' } = useParams();
  const { app, auth } = useServices();
  const state = useAppState();
  const trip = state.current?.trip;
  const [adding, setAdding] = useState(false);

  const doc = state.current?.doc;
  const span =
    doc?.startDate && doc.endDate
      ? `${formatDayLabel(doc.startDate)} – ${formatDayLabel(doc.endDate)}`
      : null;

  useEffect(() => {
    // Render from local storage first, then reconcile in the background. The
    // refresh is deliberately not awaited by anything the user can see, and is
    // skipped without a token rather than prompting: opening a trip is not a
    // request to sign in.
    void app.openTrip(folderId).then(() => {
      if (auth.hasValidToken()) return app.refresh(folderId);
    });
  }, [app, auth, folderId]);

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col">
      <header className="pad-safe-top sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-2">
          <Link
            to="/"
            aria-label="All trips"
            className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg leading-tight font-semibold">
              {trip?.name ?? 'Trip'}
            </h1>
            {span ? <p className="tnum truncate text-xs text-muted">{span}</p> : null}
          </div>

          {!state.online ? (
            <span
              className="flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-xs text-muted"
              role="status"
            >
              <WifiOff className="size-3.5" aria-hidden />
              Offline
            </span>
          ) : null}

          <Link
            to={`/trip/${folderId}/legs`}
            aria-label="Legs and gaps"
            className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
          >
            <Map className="size-4" aria-hidden />
          </Link>

          <button
            type="button"
            onClick={() => void auth.signIn().then(() => app.refresh(folderId))}
            disabled={state.syncing || !state.online}
            aria-label="Refresh from Drive"
            className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-40"
          >
            <RefreshCw className={cn('size-4', state.syncing && 'animate-spin')} aria-hidden />
          </button>
        </div>

        {trip && !trip.canEdit ? (
          <p className="border-t border-border px-3 py-1.5 text-xs text-muted">
            You have view-only access to this trip.
          </p>
        ) : null}

        {state.syncError && state.online ? (
          <p className="border-t border-border px-3 py-1.5 text-xs text-warning">
            Could not reach Drive: {state.syncError}. Showing saved data.
          </p>
        ) : null}
      </header>

      <main className="flex-1 px-3 pb-24">
        <div className="pt-3">
          <SyncBanner folderId={folderId} />
        </div>
        <Outlet />
      </main>

      {trip?.canEdit ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="Add to trip"
          className="fixed right-4 bottom-20 z-20 flex size-14 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-lg"
        >
          <Plus className="size-6" aria-hidden />
        </button>
      ) : null}

      {adding ? (
        <AddSheet folderId={folderId} onClose={() => setAdding(false)} />
      ) : null}

      <nav className="pad-safe-bottom fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-2xl border-t border-border bg-surface/95 backdrop-blur">
        <TabLink to={`/trip/${folderId}`} end icon={Clock} label="Now" />
        <TabLink to={`/trip/${folderId}/timeline`} icon={CalendarDays} label="Timeline" />
        <TabLink to={`/trip/${folderId}/documents`} icon={FileText} label="Documents" />
      </nav>
    </div>
  );
}
