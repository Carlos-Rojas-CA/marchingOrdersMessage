import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { useAppState } from '../hooks/useServices';
import { groupByDay } from '../lib/model/days';
import { dayPlace } from '../lib/model/route';
import { formatDayLabel } from '../lib/model/format';
import { ItemRow } from '../components/ItemRow';
import { DayStrip } from '../components/DayStrip';
import { EmptyState } from '../components/ui';

/** The trip day by day — for planning and orientation, not for retrieval. */
export function TimelineScreen() {
  const { folderId = '' } = useParams();
  const state = useAppState();
  const doc = state.current?.doc;

  const grouped = useMemo(() => (doc ? groupByDay(doc) : null), [doc]);
  const days = useMemo(() => grouped?.days.map((d) => d.date) ?? [], [grouped]);

  const [active, setActive] = useState<string | null>(null);
  const sections = useRef(new Map<string, HTMLElement>());

  /**
   * Tracks which day is at the top of the screen.
   *
   * The strip is a way of getting down the list, so it has to say where the
   * list currently is — otherwise it is a row of buttons with no relationship
   * to what is on screen.
   */
  useEffect(() => {
    if (days.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const onScreen = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const date = onScreen?.target.getAttribute('data-date');
        if (date) setActive(date);
      },
      // A band just under the sticky header: whatever sits there is the day
      // being read.
      { rootMargin: '-120px 0px -60% 0px', threshold: 0 },
    );

    for (const element of sections.current.values()) observer.observe(element);
    return () => observer.disconnect();
  }, [days]);

  const register = useCallback((date: string, element: HTMLElement | null) => {
    if (element) sections.current.set(date, element);
    else sections.current.delete(date);
  }, []);

  const jump = useCallback((date: string) => {
    sections.current.get(date)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(date);
  }, []);

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
    <div className="pb-4">
      <div className="sticky top-14 z-[2] bg-bg/95 pt-2 backdrop-blur">
        <DayStrip days={days} activeDate={active} onJump={jump} />
      </div>

      <div className="space-y-5">
        {grouped.days.map((day) => {
          const place = dayPlace(doc, day.date);
          return (
            <section
              key={day.date}
              data-date={day.date}
              ref={(element) => register(day.date, element)}
              // Clears the sticky header and strip when jumped to.
              className="scroll-mt-32"
            >
              <h2 className="day-rule -mx-3 border-b border-text/15 bg-bg/95 px-3 pt-3 pb-1.5 text-text backdrop-blur">
                {formatDayLabel(day.date)}
              </h2>

              {place ? (
                // A travel day is labelled with the move, not the city: the
                // 13th is neither Rome nor Barcelona, it is the day between.
                <p className="day-rule pt-1.5 pb-0.5 text-muted">
                  {place.to ? `${place.from} → ${place.to}` : place.from}
                </p>
              ) : null}

              {day.items.map((item) => (
                <ItemRow key={item.id} item={item} folderId={folderId} />
              ))}
            </section>
          );
        })}

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
    </div>
  );
}
