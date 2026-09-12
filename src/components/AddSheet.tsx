import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { ItemIcon } from './ui';
import { ADDABLE_TYPES, TYPE_LABELS } from '../routes/ItemFormScreen';
import { formatDayLabel } from '../lib/model/format';

/**
 * Chooses what to add, scoped to a day.
 *
 * The date is answered here rather than inside the form — it is already known
 * from the day that was tapped, and asking again is a question with a known
 * answer.
 */
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
          {ADDABLE_TYPES.map((type) => (
            <Link
              key={type}
              to={`/trip/${folderId}/item/new?type=${type}${date ? `&date=${date}` : ''}`}
              onClick={onClose}
              className="flex min-h-12 items-center gap-2 rounded-xl border border-border px-3 hover:bg-surface-2"
            >
              <ItemIcon type={type} className="text-muted" />
              {TYPE_LABELS[type]}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
