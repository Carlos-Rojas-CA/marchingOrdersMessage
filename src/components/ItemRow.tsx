import { Link } from 'react-router-dom';
import { FileText, MapPin } from 'lucide-react';
import type { ItineraryItem } from '../lib/model/itinerary';
import { formatTimeOfDay } from '../lib/model/format';
import { ItemIcon } from './ui';
import { AttachDocument } from './AttachDocument';

/**
 * One itinerary item.
 *
 * The time and title carry the weight; documents are shown as tappable chips
 * so a boarding pass is reachable from the timeline without a detour through a
 * detail screen.
 */
export function ItemRow({
  item,
  folderId,
}: {
  item: ItineraryItem;
  folderId: string;
}) {
  const time = formatTimeOfDay(item.startsAt);
  const mapQuery =
    item.location?.lat !== undefined && item.location.lng !== undefined
      ? `${item.location.lat},${item.location.lng}`
      : item.location?.address || item.location?.name;

  return (
    <div className="flex gap-3 border-b border-border py-3 last:border-0">
      <div className="w-16 shrink-0 pt-0.5 text-sm tabular-nums text-muted">
        {time || '—'}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <ItemIcon type={item.type} className="mt-0.5 text-muted" />
          <div className="min-w-0 flex-1">
            <p className="font-medium break-words">{item.title}</p>

            {item.confirmationNumber ? (
              <p className="mt-0.5 text-sm text-muted">
                Confirmation{' '}
                <span className="font-mono text-text select-all">
                  {item.confirmationNumber}
                </span>
              </p>
            ) : null}

            {item.location ? (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(mapQuery ?? '')}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-start gap-1 text-sm text-muted underline-offset-2 hover:underline"
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span className="break-words">
                  {item.location.address || item.location.name}
                </span>
              </a>
            ) : null}

            {item.notes ? (
              <p className="mt-1 text-sm text-muted break-words">{item.notes}</p>
            ) : null}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {item.attachments.map((attachment) => (
                  <Link
                    key={attachment.driveFileId}
                    to={`/trip/${folderId}/doc/${attachment.driveFileId}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-sm hover:bg-border"
                  >
                    <FileText className="size-3.5 shrink-0" aria-hidden />
                  <span className="max-w-44 truncate">
                    {attachment.label ?? attachment.name}
                  </span>
                </Link>
              ))}
              <AttachDocument folderId={folderId} itemId={item.id} label="Add" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
