import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { useAppState } from '../hooks/useServices';
import { groupByDay } from '../lib/model/days';
import { formatDayLabel } from '../lib/model/format';
import { ItemRow } from '../components/ItemRow';
import { EmptyState } from '../components/ui';

/** The trip day by day — for planning and orientation, not for retrieval. */
export function TimelineScreen() {
  const { folderId = '' } = useParams();
  const state = useAppState();
  const doc = state.current?.doc;

  const grouped = useMemo(() => (doc ? groupByDay(doc) : null), [doc]);

  if (!doc || !grouped) return null;

  if (grouped.days.length === 0 && grouped.unscheduled.length === 0) {
    return (
      <EmptyState icon={CalendarDays} title="This trip is empty">
        Paste an itinerary to fill it in — that is also how you move a trip over
        from a document you already keep.
        <Link
          to={`/trip/${folderId}/import`}
          className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-contrast"
        >
          Paste an itinerary
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6 pt-4">
      {grouped.days.map((day) => (
        <section key={day.date}>
          <h2 className="sticky top-14 z-[1] -mx-3 bg-bg/95 px-3 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase backdrop-blur">
            {formatDayLabel(day.date)}
          </h2>
          {day.items.map((item) => (
            <ItemRow key={item.id} item={item} folderId={folderId} />
          ))}
        </section>
      ))}

      {grouped.unscheduled.length > 0 ? (
        <section>
          <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
            Unscheduled
          </h2>
          {grouped.unscheduled.map((item) => (
            <ItemRow key={item.id} item={item} folderId={folderId} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
