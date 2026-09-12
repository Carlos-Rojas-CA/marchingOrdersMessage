import { Link } from 'react-router-dom';
import { ChevronRight, FileText, MapPin, Phone } from 'lucide-react';
import type { ItineraryItem } from '../lib/model/itinerary';
import { formatDayLabel, formatTimeOfDay } from '../lib/model/format';
import { ItemIcon } from './ui';
import { devicePlatform, mapsLinkFor } from '../lib/model/maps';

/**
 * One itinerary item.
 *
 * The whole card opens its own edit form, because tapping the thing you want
 * to change is the only obvious way to change it. Documents, a phone number
 * and a map sit *outside* that link — a link inside a link is neither valid
 * nor operable, and each of those goes somewhere else entirely.
 */
export function ItemRow({
  item,
  folderId,
}: {
  item: ItineraryItem;
  folderId: string;
}) {
  const time = formatTimeOfDay(item.startsAt);
  // Rendered as a span rather than a moment only when both ends are known.
  const stay = item.type === 'lodging' && item.startsAt && item.endsAt;

  const place = item.location;
  // Opens the maps app the device actually uses, or the traveller's own link
  // when they pasted one.
  const mapLink = place ? mapsLinkFor(place, devicePlatform()) : null;

  // A placeholder stay names itself after its city, so the location line under
  // it would otherwise say the same words twice.
  const placeLine =
    place && place.name !== item.title ? (place.address ?? place.name) : place?.address;

  return (
    <div className="border-b border-border last:border-0">
      <Link
        to={`/trip/${folderId}/item/${item.id}?type=${item.type}`}
        className="-mx-2 flex gap-3 rounded-xl px-2 py-3 hover:bg-surface-2"
      >
        <span className="w-16 shrink-0 pt-0.5 text-sm tabular-nums text-muted">
          {time || '—'}
        </span>

        <ItemIcon type={item.type} className="mt-0.5 text-muted" />

        <span className="min-w-0 flex-1">
          <span className="block font-medium break-words">{item.title}</span>

          {stay ? (
            // A stay is a span, and the half people forget is the checkout.
            // A definition list says that these are labelled values rather
            // than four loose pieces of text.
            <dl className="mt-0.5 grid grid-cols-[auto_1fr] gap-x-2 text-sm text-muted">
              <dt>Check in</dt>
              <dd className="text-text">
                {formatDayLabel(item.startsAt!.slice(0, 10))} ·{' '}
                {formatTimeOfDay(item.startsAt)}
              </dd>
              <dt>Check out</dt>
              <dd className="text-text">
                {formatDayLabel(item.endsAt!.slice(0, 10))} ·{' '}
                {formatTimeOfDay(item.endsAt)}
              </dd>
            </dl>
          ) : null}

          {item.confirmationNumber ? (
            <span className="mt-0.5 block text-sm text-muted">
              Confirmation{' '}
              <span className="font-mono text-text">{item.confirmationNumber}</span>
            </span>
          ) : null}

          {placeLine ? (
            <span className="mt-1 flex items-start gap-1 text-sm text-muted">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="break-words">{placeLine}</span>
            </span>
          ) : null}

          {item.notes ? (
            <span className="mt-1 block text-sm break-words text-muted">{item.notes}</span>
          ) : null}
        </span>

        <ChevronRight
          className="mt-0.5 size-4 shrink-0 self-start text-muted"
          aria-hidden
        />
      </Link>

      <div className="flex flex-wrap items-center gap-2 pl-[4.75rem] empty:hidden [&:not(:empty)]:pb-3">
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

        {place?.phone ? (
          <a
            href={`tel:${place.phone}`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-sm hover:bg-border"
          >
            <Phone className="size-3.5 shrink-0" aria-hidden />
            {place.phone}
          </a>
        ) : null}

        {mapLink ? (
          <a
            href={mapLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-sm hover:bg-border"
          >
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            Directions
          </a>
        ) : null}
      </div>
    </div>
  );
}
