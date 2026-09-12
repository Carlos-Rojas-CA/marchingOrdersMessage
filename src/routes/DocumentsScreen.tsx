import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, FileText } from 'lucide-react';
import { useAppState } from '../hooks/useServices';
import { groupDocuments } from '../lib/model/documents';
import { formatDayLabel, formatTimeOfDay } from '../lib/model/format';
import { EmptyState } from '../components/ui';
import { OfflineToggle } from '../components/OfflineToggle';

/**
 * Every document in the trip, grouped by what kind of document it is.
 *
 * The timeline answers "what is happening today". This answers "where is my
 * boarding pass" — the question actually being asked at a gate, usually by
 * someone who does not remember which day the app filed it under.
 */
export function DocumentsScreen() {
  const { folderId = '' } = useParams();
  const state = useAppState();
  const doc = state.current?.doc;

  const groups = useMemo(() => (doc ? groupDocuments(doc) : []), [doc]);

  /** Which documents are actually resident on this device. */
  const cached = useMemo(
    () =>
      new Set(
        (state.current?.attachments ?? [])
          .filter((a) => a.bytes !== null)
          .map((a) => a.driveFileId),
      ),
    [state.current?.attachments],
  );

  if (!doc) return null;

  return (
    <div className="pt-4">
      <OfflineToggle folderId={folderId} />

      {groups.length === 0 ? (
        <EmptyState icon={FileText} title="No documents yet">
          Boarding passes, confirmations and tickets attached to this trip will be
          collected here.
        </EmptyState>
      ) : null}

      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.docType}>
            <h2 className="day-rule mb-1 flex items-baseline gap-2 border-b border-text/15 pb-1.5 text-text">
              {group.label}
              <span className="tnum font-sans text-xs font-normal tracking-normal text-muted">
                {group.entries.length}
              </span>
            </h2>

            <ul>
              {group.entries.map((entry) => (
                <li key={entry.attachment.driveFileId}>
                  <Link
                    to={`/trip/${folderId}/doc/${entry.attachment.driveFileId}`}
                    className="flex items-center gap-3 border-b border-border py-3 last:border-0"
                  >
                    <FileText className="size-5 shrink-0 text-muted" aria-hidden />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {entry.attachment.label ?? entry.itemTitle ?? entry.attachment.name}
                      </span>
                      <span className="block truncate text-sm text-muted">
                        {[
                          entry.attachment.label ? entry.itemTitle : null,
                          entry.startsAt
                            ? `${formatDayLabel(entry.startsAt.slice(0, 10))} · ${formatTimeOfDay(entry.startsAt)}`
                            : null,
                          entry.confirmationNumber,
                        ]
                          .filter(Boolean)
                          .join(' · ') || entry.attachment.name}
                      </span>
                    </span>

                    {cached.has(entry.attachment.driveFileId) ? (
                      <Check
                        className="size-4 shrink-0 text-ok"
                        aria-label="Saved on this device"
                      />
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
