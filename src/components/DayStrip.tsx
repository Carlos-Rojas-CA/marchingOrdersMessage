import { useEffect, useRef, useState } from 'react';
import { cn } from './ui';
import { formatDayLabel } from '../lib/model/format';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function weekday(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}

function dayNumber(date: string): string {
  return String(Number(date.slice(8, 10)));
}

/**
 * Jumps to a day without hiding the rest of the trip.
 *
 * Deliberately not a filter. Seeing the whole trip broken down day by day is
 * the point of the timeline; this is a way to get down it quickly, so tapping
 * scrolls rather than narrows, and the chip for whatever is on screen lights
 * up as you scroll past it.
 */
export function DayStrip({
  days,
  activeDate,
  onJump,
}: {
  days: string[];
  activeDate: string | null;
  onJump: (date: string) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  // Keeps the highlighted chip in view as the list scrolls under it, without
  // fighting a scroll the user is doing inside the strip itself.
  useEffect(() => {
    if (!activeDate || pinned === activeDate) return;
    setPinned(activeDate);
    const chip = stripRef.current?.querySelector(`[data-day="${activeDate}"]`);
    chip?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [activeDate, pinned]);

  if (days.length < 2) return null;

  return (
    <div
      ref={stripRef}
      className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {days.map((date) => {
        const active = date === activeDate;
        return (
          <button
            key={date}
            type="button"
            data-day={date}
            onClick={() => onJump(date)}
            // Spelled out: the visible chip is two fragments that a screen
            // reader would run together as "Sat9".
            aria-label={`Jump to ${formatDayLabel(date)}`}
            aria-current={active ? 'true' : undefined}
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
              {dayNumber(date)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
