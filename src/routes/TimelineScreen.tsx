import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarDays, Plus } from 'lucide-react';
import { useAppState } from '../hooks/useServices';
import { groupByDay } from '../lib/model/days';
import { dayPlace, tripDays } from '../lib/model/route';
import { formatDayLabel } from '../lib/model/format';
import { ItemRow } from '../components/ItemRow';
import { DayStrip } from '../components/DayStrip';
import { EmptyState } from '../components/ui';

/** The place a day happens, or the move it is. */
function PlaceLine({ place }: { place: { from: string; to?: string } | null }) {
  if (!place) return null;
  return (
    <p className="day-rule pt-1.5 pb-0.5 text-muted">
      {place.to ? `${place.from} → ${place.to}` : place.from}
    </p>
  );
}

/**
 * The trip day by day.
 *
 * Two ways to read it, because both were asked for and both are right at
 * different moments: All, to see the shape of the whole trip; or one day, to
 * deal with the day you are in. A single day is shown as tiles — a handful of
 * things wants room to read — while the whole trip stays a timetable, because
 * a long list wants rules and alignment instead.
 */
export function TimelineScreen() {
  const { folderId = '' } = useParams();
  const state = useAppState();
  const doc = state.current?.doc;

  const grouped = useMemo(() => (doc ? groupByDay(doc) : null), [doc]);
  const days = useMemo(() => (doc ? tripDays(doc) : []), [doc]);
  const busy = useMemo(
    () => new Set(grouped?.days.map((d) => d.date) ?? []),
    [grouped],
  );

  const [selected, setSelected] = useState<string | null>(null);

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

  const day = selected ? grouped.days.find((d) => d.date === selected) : null;

  return (
    <div className="pb-4">
      <div className="sticky top-14 z-[2] bg-bg/95 pt-2 backdrop-blur">
        <DayStrip days={days} busy={busy} selected={selected} onSelect={setSelected} />
      </div>

      {selected ? (
        <section className="pt-2">
          <h2 className="day-rule border-b border-text/15 pb-1.5 text-text">
            {formatDayLabel(selected)}
          </h2>
          <PlaceLine place={dayPlace(doc, selected)} />

          {day ? (
            <div className="mt-2 flex flex-col gap-2">
              {day.items.map((item) => (
                <ItemRow key={item.id} item={item} folderId={folderId} variant="tile" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted">Nothing on this day yet.</p>
              <Link
                to={`/trip/${folderId}/item/new?type=activity&date=${selected}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-contrast"
              >
                <Plus className="size-4" aria-hidden />
                Add something
              </Link>
            </div>
          )}
        </section>
      ) : (
        <div className="space-y-5">
          {grouped.days.map((entry) => (
            <section key={entry.date}>
              <h2 className="day-rule -mx-3 border-b border-text/15 bg-bg/95 px-3 pt-3 pb-1.5 text-text backdrop-blur">
                {formatDayLabel(entry.date)}
              </h2>
              <PlaceLine place={dayPlace(doc, entry.date)} />
              {entry.items.map((item) => (
                <ItemRow key={item.id} item={item} folderId={folderId} />
              ))}
            </section>
          ))}

          {grouped.unscheduled.length > 0 ? (
            <section>
              <h2 className="day-rule mb-1 border-b border-text/15 pt-3 pb-1.5 text-muted">
                Unscheduled
              </h2>
              {grouped.unscheduled.map((item) => (
                <ItemRow key={item.id} item={item} folderId={folderId} />
              ))}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
