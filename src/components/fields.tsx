import { useId, useMemo, useState, type ReactNode } from 'react';
import { Check, MapPin } from 'lucide-react';
import { searchPlaces, zoneLabel, type Place } from '../lib/model/timezones';
import { cn } from './ui';

/** Shared shell so every field lines up and labels are always associated. */
export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs text-muted">
        {label}
      </label>
      {children}
      {hint ? <div className="text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

const inputClass =
  'min-h-11 w-full rounded-xl border border-border bg-bg px-3 outline-none focus:border-accent';

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  type?: 'text' | 'tel' | 'date' | 'time';
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        type={type}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <textarea
        id={id}
        value={value}
        rows={3}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-border bg-bg p-3 outline-none focus:border-accent"
      />
    </Field>
  );
}

/**
 * Picks a place by city, local spelling, or the airport code on the ticket.
 *
 * What it really selects is a time zone; the traveller never sees that word.
 */
export function PlaceField({
  label,
  value,
  onChange,
  placeholder = 'City or airport code',
  fallbackZone,
  fallbackLabel,
}: {
  label: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  placeholder?: string;
  /** Zone given to a name typed that matches nothing. See below. */
  fallbackZone?: string;
  /** Human name of that zone's place, shown so the inheritance is visible. */
  fallbackLabel?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => (open ? searchPlaces(query) : []), [query, open]);

  /**
   * A place does two separate jobs: it labels somewhere, and it says what time
   * it is there. Only the second needs to be in a list.
   *
   * Positano has no time zone of its own and appears in no reasonable list of
   * cities, but it is plainly on Italian time — and the trip already knows
   * that from where you are. So any name can be typed, and the zone comes from
   * context rather than from the name being recognised.
   */
  const typed = query.trim();
  const canUseTyped =
    typed.length > 1 && !matches.some((m) => m.name.toLowerCase() === typed.toLowerCase());

  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted">
        {label}
      </label>

      {value && !open ? (
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setOpen(true);
          }}
          className={cn(inputClass, 'flex items-center gap-2 text-left')}
        >
          <MapPin className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{value.name}</span>
          <span className="shrink-0 text-sm text-muted">{value.country}</span>
        </button>
      ) : (
        <input
          id={id}
          value={query}
          autoFocus={open}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onBlur={() => {
            // Delayed so a tap on a suggestion registers before the list closes.
            window.setTimeout(() => setOpen(false), 150);
          }}
          className={inputClass}
        />
      )}

      {open && (matches.length > 0 || canUseTyped) ? (
        <ul className="absolute top-full right-0 left-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-surface shadow-lg">
          {matches.map((place) => (
            <li key={`${place.timeZone}:${place.name}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(place);
                  // Cleared so the next place typed starts fresh rather than
                  // appending to the one just chosen.
                  setQuery('');
                  setOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate">{place.name}</span>
                <span className="shrink-0 text-sm text-muted">{place.country}</span>
                {value?.timeZone === place.timeZone && value.name === place.name ? (
                  <Check className="size-4 shrink-0 text-ok" aria-hidden />
                ) : null}
              </button>
            </li>
          ))}

          {canUseTyped ? (
            <li>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange({
                    name: typed,
                    country: fallbackLabel ?? '',
                    timeZone: fallbackZone ?? 'UTC',
                  });
                  setQuery('');
                  setOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-2 border-t border-border px-3 text-left hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate">Use “{typed}”</span>
                {fallbackZone ? (
                  <span className="shrink-0 text-sm text-muted">
                    {fallbackLabel ?? fallbackZone.split('/').pop()?.replace(/_/g, ' ')} time
                  </span>
                ) : null}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * A date, a wall-clock time, and confirmation of the offset they resolved to.
 *
 * The offset is shown and never asked for. Showing it is not decoration: a
 * flight carries two different zones, and this line is where a wrong one gets
 * noticed at entry rather than at a gate.
 */
export function DateTimeField({
  label,
  date,
  time,
  timeZone,
  onDateChange,
  onTimeChange,
}: {
  label: string;
  date: string;
  time: string;
  timeZone: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
}) {
  const dateId = useId();
  const timeId = useId();

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <input
          id={dateId}
          type="date"
          aria-label={`${label} date`}
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
          className={inputClass}
        />
        <input
          id={timeId}
          type="time"
          aria-label={`${label} time`}
          value={time}
          onChange={(event) => onTimeChange(event.target.value)}
          className={inputClass}
        />
      </div>
      {date ? (
        <p className="text-xs text-ok">✓ {zoneLabel(timeZone, date)}</p>
      ) : null}
    </div>
  );
}
