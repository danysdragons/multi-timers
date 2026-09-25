import { z } from 'zod'
import { Temporal } from '@js-temporal/polyfill'

const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000)
const id = z.string().uuid()
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    try {
      Temporal.PlainDate.from(value)
      return true
    } catch {
      return false
    }
  }, 'Choose a valid date.')
const zoneSchema = z
  .string()
  .max(100)
  .refine((zone) => {
    try {
      Temporal.Now.zonedDateTimeISO(zone)
      return true
    } catch {
      return false
    }
  })
const stamps = { createdAt: timestamp, updatedAt: timestamp }
export const taskSchema = z.object({
  id,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000),
  favorite: z.boolean(),
  archivedAt: timestamp.nullable(),
  ...stamps,
})
export const daySchema = z.object({
  key: z.string(),
  taskId: id,
  date: dateSchema,
  status: z.enum(['open', 'done']),
  sortOrder: z.number().int().nonnegative(),
  ...stamps,
})
const entryFields = {
  id,
  taskId: id,
  taskNameSnapshot: z.string().min(1).max(120),
  note: z.string().max(2000),
  ...stamps,
}
export const entrySchema = z.discriminatedUnion('kind', [
  z.object({
    ...entryFields,
    kind: z.literal('timed'),
    startedAt: timestamp,
    endedAt: timestamp.nullable(),
  }),
  z.object({
    ...entryFields,
    kind: z.literal('manual'),
    date: dateSchema,
    durationMs: z.number().int().positive().safe(),
  }),
])
export const appearanceSchema = z.object({
  theme: z.enum(['forest', 'ocean', 'plum', 'midnight']).default('forest'),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
})
export type Appearance = z.infer<typeof appearanceSchema>
export const settingsSchema = z.object({
  id: z.literal('app'),
  schemaVersion: z.literal(1),
  trackingTimeZone: zoneSchema,
  activeEntryId: id.nullable(),
  lastExportAt: timestamp.nullable(),
  firstUsedAt: timestamp,
  lastChangedAt: timestamp,
  welcomed: z.boolean(),
  ...appearanceSchema.shape,
})
export const dataSchema = z.object({
  tasks: z.array(taskSchema),
  days: z.array(daySchema),
  entries: z.array(entrySchema),
  settings: settingsSchema,
})
export const backupSchema = z.object({
  format: z.literal('multi-timers'),
  version: z.literal(1),
  exportedAt: timestamp,
  data: dataSchema,
})
export type Task = z.infer<typeof taskSchema>
export type Day = z.infer<typeof daySchema>
export type Entry = z.infer<typeof entrySchema>
export type TimedEntry = Extract<Entry, { kind: 'timed' }>
export type Settings = z.infer<typeof settingsSchema>
export type Data = z.infer<typeof dataSchema>
export type Backup = z.infer<typeof backupSchema>
export const dayKey = (taskId: string, date: string) => `${taskId}:${date}`

export function initialSettings(
  zone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Settings {
  return {
    id: 'app',
    schemaVersion: 1,
    trackingTimeZone: zone,
    activeEntryId: null,
    lastExportAt: null,
    firstUsedAt: Date.now(),
    lastChangedAt: Date.now(),
    welcomed: false,
    theme: 'forest',
    density: 'comfortable',
  }
}

export function assertNoOverlap(entries: Entry[], candidate: TimedEntry) {
  if (candidate.endedAt !== null && candidate.endedAt <= candidate.startedAt)
    throw new Error('End time must be after start time.')
  const end = candidate.endedAt ?? Infinity
  if (
    entries.some(
      (e) =>
        e.kind === 'timed' &&
        e.id !== candidate.id &&
        candidate.startedAt < (e.endedAt ?? Infinity) &&
        end > e.startedAt,
    )
  ) {
    throw new Error(
      'This time overlaps another timed session. Stop or correct that session first.',
    )
  }
}

/** Validate the entire graph before any restore transaction can write. */
export function parseBackup(text: string, now = Date.now()): Backup {
  let result: Backup
  try {
    result = backupSchema.parse(JSON.parse(text))
  } catch {
    throw new Error(
      'This is not a valid Multi Timers v1 backup. Your existing data has not changed.',
    )
  }
  const { tasks, days, entries, settings } = result.data
  const unique = (values: string[]) => new Set(values).size === values.length
  if (
    !unique(tasks.map((t) => t.id)) ||
    !unique(days.map((d) => d.key)) ||
    !unique(entries.map((e) => e.id))
  )
    throw new Error('The backup contains duplicate records.')
  const taskIds = new Set(tasks.map((t) => t.id))
  if (
    days.some(
      (d) => !taskIds.has(d.taskId) || d.key !== dayKey(d.taskId, d.date),
    ) ||
    entries.some((e) => !taskIds.has(e.taskId))
  )
    throw new Error(
      'The backup contains a missing task reference or invalid day entry.',
    )
  if (
    settings.activeEntryId !== null ||
    entries.some((e) => e.kind === 'timed' && e.endedAt === null)
  )
    throw new Error('Backups must contain stopped timers only.')
  const today = Temporal.Instant.fromEpochMilliseconds(now)
    .toZonedDateTimeISO(settings.trackingTimeZone)
    .toPlainDate()
    .toString()
  const timed = entries
    .filter((e): e is TimedEntry => e.kind === 'timed')
    .sort((a, b) => a.startedAt - b.startedAt)
  for (let i = 0; i < timed.length; i++) {
    const e = timed[i]
    if (
      e.endedAt! <= e.startedAt ||
      e.endedAt! > now ||
      (i > 0 && e.startedAt < timed[i - 1].endedAt!)
    )
      throw new Error(
        'The backup contains invalid, future, or overlapping timed sessions.',
      )
  }
  if (entries.some((e) => e.kind === 'manual' && e.date > today))
    throw new Error('The backup contains time on a future date.')
  return result
}
