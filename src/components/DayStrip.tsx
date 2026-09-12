import { useEffect, useRef } from 'react';
import { cn } from './ui';
import { formatDayLabel } from '../lib/model/format';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function weekday(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}

/**
 * Picks a day to look at, or all of them.
 *
 * Every day of the trip is listed, including the empty ones — a strip that
 * skips them jumps 17, 18, 20, 23 and reads as broken rather than sparse, and
 * an empty day is exactly the one worth selecting, because it is the one still
 * to be filled. A dot marks the days that already have something.
 */
export function DayStrip({
  days,
  busy,
  selected,
  onSelect,
  openAt,
}: {
  days: string[];
  /** Days that have at least one item. */
  busy: ReadonlySet<string>;
  /** `null` means every day at once. */
  selected: string | null;
  onSelect: (date: string | null) => void;
  /** The day to scroll to on arrival — today, or the nearest end of the trip. */
  openAt?: string | null;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const landed = useRef(false);

  // Opens with the relevant day sitting against All, rather than at whichever
  // end of a three-week trip happens to come first alphabetically.
  useEffect(() => {
    if (landed.current || !openAt) return;
    const chip = scrollerRef.current?.querySelector(`[data-day="${openAt}"]`);
    if (!chip) return;
    landed.current = true;
    // `block: 'nearest'` so scrolling the strip sideways never drags the page
    // up or down with it.
    chip.scrollIntoView({ block: 'nearest', inline: 'start' });
  }, [openAt, days]);

  useEffect(() => {
    if (!selected) return;
    scrollerRef.current
      ?.querySelector(`[data-day="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [selected]);

  if (days.length < 2) return null;

  return (
    <div className="-mx-3 flex items-stretch gap-1.5 px-3 pb-2">
      {/*
        All stays put while the dates run past it: it is the way back, and a
        way back that scrolls off the screen is one you have to hunt for.
      */}
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={selected === null}
        className={cn(
          'flex shrink-0 items-center rounded-xl px-3 font-display text-xs font-bold tracking-wide uppercase transition-colors',
          selected === null
            ? 'bg-accent text-accent-contrast'
            : 'bg-surface-2 text-muted hover:bg-border',
        )}
      >
        All
      </button>

      <div
        ref={scrollerRef}
        className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {days.map((date) => {
          const active = date === selected;
          return (
            <button
              key={date}
              type="button"
              data-day={date}
              onClick={() => onSelect(active ? null : date)}
              // Spelled out: the visible chip is two fragments that a screen
              // reader would run together as "Sat9".
              aria-label={`Show ${formatDayLabel(date)}`}
              aria-pressed={active}
              className={cn(
                'flex w-12 shrink-0 flex-col items-center rounded-xl py-1.5 text-xs leading-tight transition-colors',
                active
                  ? 'bg-accent text-accent-contrast'
                  : 'bg-surface-2 text-muted hover:bg-border',
              )}
            >
              <span>{weekday(date)}</span>
              <span
                className={cn(
                  'tnum font-display text-base font-bold',
                  active ? 'text-accent-contrast' : 'text-text',
                )}
              >
                {Number(date.slice(8, 10))}
              </span>
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 size-1 rounded-full',
                  busy.has(date)
                    ? active
                      ? 'bg-accent-contrast'
                      : 'bg-accent'
                    : 'bg-transparent',
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
