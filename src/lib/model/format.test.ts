import { describe, expect, test } from 'vitest';
import { formatDayLabel, formatSize, formatTimeOfDay } from './format';

describe('formatTimeOfDay', () => {
  test('shows the time as written at the place it happens', () => {
    // The traveller is standing in Tokyo. Converting this into the device's
    // timezone would tell them their 18:00 check-in is at some other hour.
    expect(formatTimeOfDay('2026-09-13T18:00:00+09:00')).toBe('6:00 PM');
  });

  test('is unaffected by the offset it carries', () => {
    expect(formatTimeOfDay('2026-09-12T08:00:00-07:00')).toBe('8:00 AM');
    expect(formatTimeOfDay('2026-09-12T08:00:00Z')).toBe('8:00 AM');
  });

  test('renders midnight and noon the way a person reads them', () => {
    expect(formatTimeOfDay('2026-09-12T00:00:00Z')).toBe('12:00 AM');
    expect(formatTimeOfDay('2026-09-12T12:00:00Z')).toBe('12:00 PM');
  });

  test('has nothing to show for a missing or unparseable time', () => {
    expect(formatTimeOfDay(undefined)).toBe('');
    expect(formatTimeOfDay('tuesday-ish')).toBe('');
  });
});

describe('formatDayLabel', () => {
  test('labels a date without shifting it through a timezone', () => {
    expect(formatDayLabel('2026-09-13')).toBe('Sun, Sep 13');
  });

  test('handles the first of a month', () => {
    expect(formatDayLabel('2026-09-01')).toBe('Tue, Sep 1');
  });

  test('returns the input unchanged when it is not a date', () => {
    expect(formatDayLabel('Unscheduled')).toBe('Unscheduled');
  });
});

describe('formatSize', () => {
  test('reports bytes in the units a person can act on', () => {
    expect(formatSize(0)).toBe('0 MB');
    expect(formatSize(14_200_000)).toBe('14.2 MB');
  });

  test('drops to KB for something too small to register in MB', () => {
    expect(formatSize(4_096)).toBe('4 KB');
  });
});
