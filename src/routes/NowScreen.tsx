import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Luggage } from 'lucide-react';
import { useAppState } from '../hooks/useServices';
import { nowView } from '../lib/model/now';
import { formatDayLabel, formatTimeOfDay } from '../lib/model/format';
import { ItemRow } from '../components/ItemRow';
import { EmptyState } from '../components/ui';

/**
 * What is in play right now.
 *
 * The default screen during a trip, and the shortest path from a lock screen to
 * the document about to be scanned.
 */
export function NowScreen() {
  const { folderId = '' } = useParams();
  const state = useAppState();
  const doc = state.current?.doc;

  const view = useMemo(
    // Derived from data already in memory: switching lenses touches neither
    // storage nor the network.
    () => (doc ? nowView(doc, new Date()) : null),
    [doc],
  );

  if (!doc || !view) return null;

  const next = view.upcoming.slice(0, 3);

  if (view.current.length === 0 && next.length === 0) {
    return (
      <EmptyState icon={Luggage} title="Nothing scheduled right now">
        Anything with a date will show up here when its time comes. The Timeline
        has the full trip.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6 pt-4">
      {view.current.length > 0 ? (
        <section>
          {/*
            The one place a hero treatment earns its keep. Everything else in
            the app is a list to scan; this is the single thing that is true
            right now, and amber is the colour every departure hall uses to
            say exactly that.
          */}
          <h2 className="day-rule mb-2 flex items-center gap-2 text-live">
            <span className="inline-block size-1.5 rounded-full bg-live" aria-hidden />
            Happening now
          </h2>
          <div className="flex flex-col gap-2">
            {view.current.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                folderId={folderId}
                variant="tile"
                tone="live"
              />
            ))}
          </div>
        </section>
      ) : null}

      {next.length > 0 ? (
        <section>
          <h2 className="day-rule mb-1 border-b border-text/15 pb-1.5 text-muted">
            Next up
          </h2>
          <div className="flex flex-col gap-3 pt-2">
            {next.map((item) => (
              <div key={item.id} className="flex flex-col gap-1">
                <p className="tnum text-xs text-muted">
                  {item.startsAt
                    ? `${formatDayLabel(item.startsAt.slice(0, 10))} · ${formatTimeOfDay(item.startsAt)}`
                    : null}
                </p>
                <ItemRow item={item} folderId={folderId} variant="tile" />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
