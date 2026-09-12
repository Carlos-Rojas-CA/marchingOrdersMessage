import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, CircleAlert, Download, X } from 'lucide-react';
import { useAppState, useServices } from '../hooks/useServices';
import { groupDocuments } from '../lib/model/documents';
import { attachmentBlob } from '../lib/store/tripStore';
import { formatDayLabel, formatTimeOfDay } from '../lib/model/format';
import { Button } from '../components/ui';
import { useWakeLock } from '../hooks/useWakeLock';

const PdfCanvas = lazy(() => import('../components/PdfCanvas'));

/**
 * A document, full screen, arranged for actually using it.
 *
 * Three things matter here that a generic file preview gets wrong: the screen
 * must not sleep while you queue, the confirmation number must be readable
 * without zooming into a PDF, and moving between three boarding passes must be
 * a swipe rather than three trips back through a list.
 */
export function DocumentViewerScreen() {
  const { folderId = '', fileId = '' } = useParams();
  const navigate = useNavigate();
  const { app } = useServices();
  const state = useAppState();
  const [downloading, setDownloading] = useState(false);

  // Keeps the screen awake while a document is open. The web cannot raise
  // brightness, which is the one thing a dim barcode really wants — see the
  // native-app note in the design spec.
  useWakeLock();

  useEffect(() => {
    void (async () => {
      await app.openTrip(folderId);
      // A deep link — or reopening the installed app straight onto this route —
      // arrives with nothing loaded. Reconcile once before concluding the
      // document is gone.
      if (!app.getSnapshot().current) await app.refresh(folderId);
    })();
  }, [app, folderId]);

  const doc = state.current?.doc;

  /** Siblings in the same group, so "next boarding pass" is one swipe. */
  const siblings = useMemo(() => {
    if (!doc) return [];
    const group = groupDocuments(doc).find((g) =>
      g.entries.some((e) => e.attachment.driveFileId === fileId),
    );
    return group?.entries ?? [];
  }, [doc, fileId]);

  const index = siblings.findIndex((e) => e.attachment.driveFileId === fileId);
  const entry = index >= 0 ? siblings[index] : undefined;
  const record = state.current?.attachments.find((a) => a.driveFileId === fileId);
  const blob = record ? attachmentBlob(record) : null;
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(() => {
    // Object URLs pin their blob in memory until explicitly released.
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  async function fetchThisOne() {
    setDownloading(true);
    try {
      await app.downloadForOffline(folderId);
    } finally {
      setDownloading(false);
    }
  }

  const subtitle = [
    entry?.itemTitle,
    entry?.startsAt
      ? `${formatDayLabel(entry.startsAt.slice(0, 10))} · ${formatTimeOfDay(entry.startsAt)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex min-h-full flex-col bg-bg">
      <header className="pad-safe-top sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
          >
            <X className="size-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {entry?.attachment.label ?? record?.name ?? 'Document'}
            </p>
            {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
          </div>
        </div>

        {/* Hoisted above the document: reading a code aloud or typing it into a
            kiosk should never require zooming into a PDF. */}
        {entry?.confirmationNumber ? (
          <div className="border-t border-border px-3 py-2">
            <p className="text-xs text-muted">Confirmation</p>
            <p className="font-mono text-xl tracking-wide select-all">
              {entry.confirmationNumber}
            </p>
          </div>
        ) : null}
      </header>

      <main className="flex-1 p-3">
        {!state.current ? (
          // Distinct from the message below: the trip has not loaded yet, which
          // is not the same as the document having been removed from it.
          <p className="px-4 py-10 text-center text-sm text-muted">Loading…</p>
        ) : !record ? (
          <p className="px-4 py-10 text-center text-sm text-muted">
            This document is not part of the trip any more.
          </p>
        ) : !blob ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <CircleAlert className="size-8 text-muted" aria-hidden />
            <p className="font-medium">{record.name} is not saved on this device</p>
            <p className="max-w-xs text-sm text-muted">
              {state.online
                ? 'Download the trip to keep it available without a connection.'
                : 'You are offline, so it cannot be fetched right now.'}
            </p>
            {state.online ? (
              <Button onClick={() => void fetchThisOne()} disabled={downloading}>
                <Download className="size-4" aria-hidden />
                {downloading ? 'Downloading…' : 'Download trip documents'}
              </Button>
            ) : null}
          </div>
        ) : record.mimeType.startsWith('image/') && url ? (
          <img
            src={url}
            alt={record.name}
            className="mx-auto h-auto w-full rounded-lg bg-white"
          />
        ) : record.mimeType === 'application/pdf' ? (
          <Suspense
            fallback={<p className="px-4 py-8 text-center text-sm text-muted">Loading…</p>}
          >
            <PdfCanvas blob={blob} />
          </Suspense>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted">
            {record.name} cannot be previewed here.
          </p>
        )}
      </main>

      {siblings.length > 1 ? (
        <nav className="pad-safe-bottom sticky bottom-0 flex items-center justify-between border-t border-border bg-surface/95 px-3 py-2 backdrop-blur">
          <Link
            to={`/trip/${folderId}/doc/${siblings[Math.max(0, index - 1)]!.attachment.driveFileId}`}
            aria-disabled={index === 0}
            className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm text-muted aria-disabled:opacity-30"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Previous
          </Link>

          <span className="text-xs text-muted">
            {index + 1} of {siblings.length}
          </span>

          <Link
            to={`/trip/${folderId}/doc/${siblings[Math.min(siblings.length - 1, index + 1)]!.attachment.driveFileId}`}
            aria-disabled={index === siblings.length - 1}
            className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm text-muted aria-disabled:opacity-30"
          >
            Next
            <ChevronLeft className="size-4 rotate-180" aria-hidden />
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
