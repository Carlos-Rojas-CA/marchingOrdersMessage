import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ReactNode } from 'react';
import {
  Bed,
  Bus,
  Car,
  FileText,
  MapPin,
  Plane,
  Route,
  Ship,
  StickyNote,
  Ticket,
  TrainFront,
  type LucideIcon,
} from 'lucide-react';
import type { ItemType } from '../lib/model/itinerary';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-surface p-4 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  className,
  disabled,
  type = 'button',
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type'>) {
  const styles = {
    primary: 'bg-accent text-accent-contrast hover:opacity-90',
    ghost: 'bg-surface-2 text-text hover:bg-border',
    danger: 'bg-transparent text-danger hover:bg-surface-2',
  } as const;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // 44px minimum: these get tapped one-handed, often in a hurry.
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4',
        'text-sm font-medium transition disabled:opacity-50',
        styles[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <Icon className="size-8 text-muted" aria-hidden />
      <p className="font-medium">{title}</p>
      {children ? <p className="max-w-xs text-sm text-muted">{children}</p> : null}
    </div>
  );
}

/** Visual shorthand for what kind of thing an itinerary item is. */
const ITEM_ICONS: Record<ItemType, LucideIcon> = {
  flight: Plane,
  train: TrainFront,
  ferry: Ship,
  bus: Bus,
  car: Car,
  transit: Route,
  lodging: Bed,
  activity: Ticket,
  poi: MapPin,
  note: StickyNote,
  document: FileText,
};

export function ItemIcon({ type, className }: { type: ItemType; className?: string }) {
  const Icon = ITEM_ICONS[type];
  return <Icon className={cn('size-5 shrink-0', className)} aria-hidden />;
}
