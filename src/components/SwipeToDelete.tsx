import { useRef, useState, type ReactNode } from 'react';
import { Trash } from 'lucide-react';

/** How far the row slides to reveal the button. */
const REVEAL = 88;

/**
 * Slide a row aside to uncover Delete.
 *
 * Two deliberate actions, which is what makes it safe without an undo: a
 * sideways drag is not something a thumb does by accident while scrolling, and
 * the button still has to be tapped. That is also why the drag gives up the
 * moment the finger is travelling more vertically than horizontally — a list
 * that grabs at scrolls is worse than one with no shortcut at all.
 */
export function SwipeToDelete({
  onDelete,
  label,
  children,
}: {
  onDelete: () => void;
  /** Named for a screen reader, since the gesture itself is invisible to one. */
  label: string;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const locked = useRef<'none' | 'horizontal' | 'vertical'>('none');

  function onTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0]!;
    start.current = { x: touch.clientX, y: touch.clientY };
    locked.current = 'none';
  }

  function onTouchMove(event: React.TouchEvent) {
    const from = start.current;
    if (!from) return;
    const touch = event.touches[0]!;
    const dx = touch.clientX - from.x;
    const dy = touch.clientY - from.y;

    // Decided once per gesture and then held: re-deciding mid-drag makes the
    // row twitch between scrolling and sliding.
    if (locked.current === 'none') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      locked.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (locked.current === 'vertical') return;

    const base = open ? -REVEAL : 0;
    // Rubber-bands past the button rather than sliding the row off the screen.
    setOffset(Math.min(0, Math.max(base + dx, -REVEAL - 24)));
  }

  function onTouchEnd() {
    if (locked.current === 'horizontal') {
      const shouldOpen = offset < -REVEAL / 2;
      setOpen(shouldOpen);
      setOffset(shouldOpen ? -REVEAL : 0);
    }
    start.current = null;
  }

  function close() {
    setOpen(false);
    setOffset(0);
  }

  async function remove() {
    setBusy(true);
    try {
      onDelete();
    } finally {
      setBusy(false);
      close();
    }
  }

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy}
          aria-label={`Delete ${label}`}
          /*
           * Kept in the accessibility tree and the tab order, and it slides
           * the row open when focused.
           *
           * Hiding it while closed would have made deleting from a list a
           * touchscreen-only capability, since the gesture that reveals it is
           * invisible to anyone not making it. Opening on focus means a
           * keyboard user can see what they are about to press.
           */
          onFocus={() => {
            setOpen(true);
            setOffset(-REVEAL);
          }}
          onBlur={close}
          className="flex w-[88px] items-center justify-center gap-1 bg-danger/15 text-sm font-medium text-danger"
        >
          <Trash className="size-4" aria-hidden />
          Delete
        </button>
      </div>

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClickCapture={(event) => {
          // A tap while open closes rather than following the row's link.
          if (!open) return;
          event.preventDefault();
          event.stopPropagation();
          close();
        }}
        style={{ transform: `translateX(${offset}px)` }}
        className={
          offset === 0 || offset === -REVEAL
            ? 'relative bg-bg transition-transform duration-200'
            : 'relative bg-bg'
        }
      >
        {children}
      </div>
    </div>
  );
}
