import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bed, ChevronLeft, TriangleAlert } from 'lucide-react';
import { useAppState } from '../hooks/useServices';
import { useLoadedTrip } from '../hooks/useLoadedTrip';
import { bedGaps, legsFromStays, transitionGaps } from '../lib/model/route';
import { formatDayLabel } from '../lib/model/format';
import { Button, Card, EmptyState } from '../components/ui';

/**
 * The trip as a sequence of places, with what has not been arranged.
 *
 * Both warnings fall out of data already recorded — stays say where you are,
 * and comparing consecutive stays says where you must travel and when. Neither
 * blocks anything; a red-eye, an overnight train and a friend's sofa are all
 * real answers.
 */
export function LegsScreen() {
  const { folderId = '' } = useParams();
  const navigate = useNavigate();
  const state = useAppState();

  useLoadedTrip(folderId);

  const doc = state.current?.doc;
  const legs = useMemo(() => (doc ? legsFromStays(doc) : []), [doc]);
  const beds = useMemo(() => (doc ? bedGaps(doc) : []), [doc]);
  const moves = useMemo(() => (doc ? transitionGaps(doc) : []), [doc]);

  if (!doc) return null;

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col">
      <header className="pad-safe-top sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-bg/90 px-3 py-2 backdrop-blur">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <h1 className="flex-1 truncate font-semibold">Legs</h1>
      </header>

      <main className="flex flex-1 flex-col gap-3 p-3">
        {legs.length === 0 ? (
          <EmptyState icon={Bed} title="No stays yet">
            Add where you are sleeping and this becomes the shape of the trip —
            including anywhere you have not arranged to be.
          </EmptyState>
        ) : null}

        {legs.map((leg) => {
          const move = moves.find((m) => m.from === leg.place);
          return (
            <div key={leg.itemId} className="flex flex-col gap-3">
              <Link to={`/trip/${folderId}/item/${leg.itemId}?type=lodging`}>
                <Card>
                  <p className="font-medium">
                    {leg.place}
                    <span className="font-normal text-muted">
                      {' · '}
                      {formatDayLabel(leg.arrive)} – {formatDayLabel(leg.depart)}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate text-sm text-muted">
                    🛏 {doc.items.find((i) => i.id === leg.itemId)?.title}
                  </p>
                </Card>
              </Link>

              {move ? (
                <div className="rounded-2xl border border-warning/40 bg-surface-2 p-3">
                  <p className="flex items-start gap-2 text-sm text-warning">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      <strong>
                        {move.from} → {move.to}
                      </strong>{' '}
                      on {formatDayLabel(move.date)} — nothing booked to get you there.
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link
                      to={`/trip/${folderId}/item/new?type=flight&date=${move.date}`}
                      className="inline-flex min-h-9 items-center rounded-lg bg-surface px-3 text-sm"
                    >
                      Add a flight
                    </Link>
                    <Link
                      to={`/trip/${folderId}/item/new?type=train&date=${move.date}`}
                      className="inline-flex min-h-9 items-center rounded-lg bg-surface px-3 text-sm"
                    >
                      Add a train
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {beds.map((gap) => (
          <div
            key={gap.from}
            className="rounded-2xl border border-warning/40 bg-surface-2 p-3"
          >
            <p className="flex items-start gap-2 text-sm text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                No stay for{' '}
                <strong>
                  {formatDayLabel(gap.from)} – {formatDayLabel(gap.to)}
                </strong>{' '}
                — {gap.nights} {gap.nights === 1 ? 'night' : 'nights'}.
              </span>
            </p>
            <Link
              to={`/trip/${folderId}/item/new?type=lodging&date=${gap.from}`}
              className="mt-2 inline-flex min-h-9 items-center rounded-lg bg-surface px-3 text-sm"
            >
              Add a stay
            </Link>
          </div>
        ))}

        {legs.length > 0 && beds.length === 0 && moves.length === 0 ? (
          <p className="text-sm text-ok">
            ✓ Every night has a bed, and every move between places is booked.
          </p>
        ) : null}

        <div className="mt-auto flex flex-col gap-2 pt-3">
          <Link
            to={`/trip/${folderId}/item/new?type=lodging`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-dashed border-border px-4 text-sm text-muted"
          >
            + Add a stay
          </Link>
          <Button variant="ghost" onClick={() => navigate(`/trip/${folderId}`)}>
            Done — go to the trip
          </Button>
        </div>
      </main>
    </div>
  );
}
