import { Temporal } from '@js-temporal/polyfill'
import type { Entry } from './model'

export function localDate(time: number, zone: string) {
  return Temporal.Instant.fromEpochMilliseconds(time)
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString()
}
export function addDays(date: string, days: number) {
  return Temporal.PlainDate.from(date).add({ days }).toString()
}
export function dayBounds(date: string, zone: string): [number, number] {
  const start = Temporal.PlainDate.from(date).toZonedDateTime(zone)
  return [start.epochMilliseconds, start.add({ days: 1 }).epochMilliseconds]
}
export function duration(entry: Entry, now: number): number {
  return entry.kind === 'manual'
    ? entry.durationMs
    : Math.max(0, (entry.endedAt ?? now) - entry.startedAt)
}
export function timeOnDay(
  entry: Entry,
  date: string,
  bounds: [number, number],
  now: number,
) {
  if (entry.kind === 'manual') return entry.date === date ? entry.durationMs : 0
  return Math.max(
    0,
    Math.min(entry.endedAt ?? now, bounds[1]) -
      Math.max(entry.startedAt, bounds[0]),
  )
}
export function formatDuration(ms: number) {
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')
}
export function parseDuration(value: string) {
  const match = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(value)
  if (!match)
    throw new Error(
      'Enter a duration as hours:minutes:seconds, for example 00:30:00.',
    )
  const ms =
    (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000
  if (!Number.isSafeInteger(ms) || ms <= 0)
    throw new Error('Duration must be greater than zero.')
  return ms
}
export function editTimestamp(time: number, zone: string) {
  return Temporal.Instant.fromEpochMilliseconds(time)
    .toZonedDateTimeISO(zone)
    .toString({
      timeZoneName: 'never',
      calendarName: 'never',
      fractionalSecondDigits: 3,
    })
}
export function parseTimestamp(value: string, zone: string) {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new Error(
      'Include a UTC offset, such as -04:00, to identify the exact time.',
    )
  try {
    return Temporal.ZonedDateTime.from(`${value}[${zone}]`, {
      offset: 'reject',
      disambiguation: 'reject',
    }).epochMilliseconds
  } catch {
    throw new Error(
      'That time or UTC offset is not valid in your tracking time zone. Check daylight-saving changes.',
    )
  }
}
export function friendlyDate(
  date: string,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat('en', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...options,
  }).format(new Date(`${date}T12:00:00Z`))
}
export function friendlyTime(time: number, zone: string) {
  return new Intl.DateTimeFormat('en', {
    timeZone: zone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(time)
}
