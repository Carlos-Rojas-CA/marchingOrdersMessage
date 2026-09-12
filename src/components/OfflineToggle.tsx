import { useState } from 'react';
import { Check, Download } from 'lucide-react';
import { useAppState, useServices } from '../hooks/useServices';
import { formatSize } from '../lib/model/format';
import { Button, Card } from './ui';

/**
 * Explicit control over what gets downloaded.
 *
 * Deliberately a decision rather than a background behaviour: the usage context
 * is international roaming, so bytes move when the traveller says so — ideally
 * on hotel wifi the night before — and never as a surprise.
 */
export function OfflineToggle({ folderId }: { folderId: string }) {
  const { app } = useServices();
  const state = useAppState();
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(
    null,
  );
  const [failed, setFailed] = useState<string[]>([]);

  const attachments = state.current?.attachments ?? [];
  const cachedBytes = attachments.reduce((n, a) => n + (a.bytes?.byteLength ?? 0), 0);
  const knownBytes = attachments.reduce((n, a) => n + a.size, 0);
  const cachedCount = attachments.filter((a) => a.bytes !== null).length;
  const allCached = attachments.length > 0 && cachedCount === attachments.length;

  async function download() {
    setFailed([]);
    setProgress({ completed: 0, total: attachments.length });
    try {
      const result = await app.downloadForOffline(folderId, setProgress);
      setFailed(result.failed);
    } finally {
      setProgress(null);
    }
  }

  if (attachments.length === 0) return null;

  return (
    <Card className="mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">Available offline</p>
          <p className="mt-0.5 text-sm text-muted">
            {allCached
              ? `${attachments.length} documents · ${formatSize(cachedBytes)} on this device`
              : `${attachments.length} documents · about ${formatSize(knownBytes)} to download`}
          </p>
        </div>

        {allCached ? (
          <Button variant="ghost" onClick={() => void app.evictOffline(folderId)}>
            <Check className="size-4 text-ok" aria-hidden />
            Downloaded
          </Button>
        ) : (
          <Button onClick={() => void download()} disabled={progress !== null || !state.online}>
            <Download className="size-4" aria-hidden />
            {progress ? `${progress.completed}/${progress.total}` : 'Download'}
          </Button>
        )}
      </div>

      {progress ? (
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={progress.completed}
          aria-valuemin={0}
          aria-valuemax={progress.total}
        >
          <div
            className="h-full bg-accent transition-[width]"
            style={{
              width: `${progress.total === 0 ? 0 : (progress.completed / progress.total) * 100}%`,
            }}
          />
        </div>
      ) : null}

      {failed.length > 0 ? (
        // A partial download is still useful; naming what is missing is more
        // honest than reporting a flat failure.
        <p className="mt-2 text-sm text-warning">
          Could not download {failed.length} of {attachments.length}:{' '}
          {failed.join(', ')}. The rest are saved.
        </p>
      ) : null}

      {!state.online && !allCached ? (
        <p className="mt-2 text-sm text-muted">
          Connect to the internet to download these for offline use.
        </p>
      ) : null}
    </Card>
  );
}
