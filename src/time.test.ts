import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayBounds,
  formatDuration,
  localDate,
  parseDuration,
  parseTimestamp,
  timeOnDay,
} from './time'
import type { Entry } from './model'

const entry = (start: string, end: string): Entry => ({
  id: crypto.randomUUID(),
  taskId: crypto.randomUUID(),
  taskNameSnapshot: 'Study X',
  note: '',
  createdAt: 0,
  updatedAt: 0,
  kind: 'timed',
  startedAt: Date.parse(start),
  endedAt: Date.parse(end),
})
describe('calendar and duration arithmetic', () => {
  it('accumulates before rounding and does not wrap hours', () => {
    expect(formatDuration(25 * 60_000 + 35 * 60_000)).toBe('01:00:00')
    expect(formatDuration(600 + 600)).toBe('00:00:01')
    expect(formatDuration(27 * 3600_000)).toBe('27:00:00')
    expect(formatDuration(-100)).toBe('00:00:00')
  })
  it('splits a continuous session at local midnight without resetting it', () => {
    const e = entry('2026-09-25T23:50:00-04:00', '2026-09-26T00:10:00-04:00')
    expect(
      timeOnDay(e, '2026-09-25', dayBounds('2026-09-25', 'America/Toronto'), 0),
    ).toBe(600_000)
    expect(
      timeOnDay(e, '2026-09-26', dayBounds('2026-09-26', 'America/Toronto'), 0),
    ).toBe(600_000)
  })
  it('handles 23-hour and 25-hour days', () => {
    const spring = dayBounds('2026-03-08', 'America/Toronto')
    const autumn = dayBounds('2026-11-01', 'America/Toronto')
    expect(spring[1] - spring[0]).toBe(23 * 3600_000)
    expect(autumn[1] - autumn[0]).toBe(25 * 3600_000)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('uses the saved zone rather than the computer zone', () => {
    expect(
      localDate(Date.parse('2026-09-26T02:00:00Z'), 'America/Toronto'),
    ).toBe('2026-09-25')
  })
  it('disambiguates repeated times and rejects nonexistent local times', () => {
    const first = parseTimestamp('2026-11-01T01:30:00-04:00', 'America/Toronto')
    const second = parseTimestamp(
      '2026-11-01T01:30:00-05:00',
      'America/Toronto',
    )
    expect(second - first).toBe(3600_000)
    expect(() =>
      parseTimestamp('2026-03-08T02:30:00-05:00', 'America/Toronto'),
    ).toThrow()
    expect(() =>
      parseTimestamp('2026-11-01T01:30:00', 'America/Toronto'),
    ).toThrow()
  })
  it('validates manual durations', () => {
    expect(parseDuration('00:30:00')).toBe(1800_000)
    expect(() => parseDuration('00:60:00')).toThrow()
    expect(() => parseDuration('00:00:00')).toThrow()
    expect(() => parseDuration('-1:00:00')).toThrow()
  })
})
