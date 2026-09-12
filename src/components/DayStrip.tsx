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
}: {
  days: string[];
  /** Days that have at least one item. */
  busy: ReadonlySet<string>;
  /** `null` means every day at once. */
  selected: string | null;
  onSelect: (date: string | null) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selected) return;
    stripRef.current
      ?.querySelector(`[data-day="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [selected]);

  if (days.length < 2) return null;

  return (
    <div
      ref={stripRef}
      className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
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
  );
}
