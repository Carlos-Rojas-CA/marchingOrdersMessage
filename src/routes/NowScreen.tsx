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
          <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
            Happening now
          </h2>
          {view.current.map((item) => (
            <ItemRow key={item.id} item={item} folderId={folderId} />
          ))}
        </section>
      ) : null}

      {next.length > 0 ? (
        <section>
          <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
            Next up
          </h2>
          {next.map((item) => (
            <div key={item.id}>
              <p className="pt-2 text-xs text-muted">
                {item.startsAt
                  ? `${formatDayLabel(item.startsAt.slice(0, 10))} · ${formatTimeOfDay(item.startsAt)}`
                  : null}
              </p>
              <ItemRow item={item} folderId={folderId} />
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
