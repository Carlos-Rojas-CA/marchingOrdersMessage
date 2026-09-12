import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { ItemIcon } from './ui';
import type { ItemType } from '../lib/model/itinerary';
import { formatDayLabel } from '../lib/model/format';

/**
 * Four choices, scoped to a day.
 *
 * Flight, train, ferry, bus, car and other travel are all the same question —
 * "how am I getting somewhere" — so they are one button here and a switch
 * inside the form. Ten options to pick from is a menu; four is a decision.
 *
 * The date is answered here rather than inside the form: it is already known
 * from the day that was tapped, and asking again is a question with an answer
 * already in hand.
 */
const CHOICES: { type: ItemType; label: string }[] = [
  // Travel opens on a flight, the most common by far, with the rest a tap away.
  { type: 'flight', label: 'Travel' },
  { type: 'lodging', label: 'Stay' },
  { type: 'activity', label: 'Activity' },
  { type: 'poi', label: 'Place' },
];
export function AddSheet({
  folderId,
  date,
  onClose,
}: {
  folderId: string;
  date?: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 flex flex-col justify-end bg-black/40"
      role="dialog"
      aria-label="Add to trip"
      onClick={onClose}
    >
      <div
        className="pad-safe-bottom mx-auto w-full max-w-2xl rounded-t-2xl border-t border-border bg-surface p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          <p className="flex-1 text-sm text-muted">
            {date ? `Add to ${formatDayLabel(date)}` : 'Add to this trip'}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {CHOICES.map(({ type, label }) => (
            <Link
              key={label}
              to={`/trip/${folderId}/item/new?type=${type}${date ? `&date=${date}` : ''}`}
              onClick={onClose}
              className="flex min-h-14 items-center gap-2.5 rounded-xl border border-border px-3 font-medium hover:bg-surface-2"
            >
              <ItemIcon type={type} />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
