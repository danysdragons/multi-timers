import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
} from 'idb'
import {
  assertNoOverlap,
  dateSchema,
  dayKey,
  entrySchema,
  initialSettings,
  parseBackup,
  taskSchema,
  type Backup,
  type Data,
  type Day,
  type Entry,
  type Settings,
  type Task,
  type TimedEntry,
} from './model'
import { dayBounds, localDate, timeOnDay } from './time'

interface Schema extends DBSchema {
  tasks: { key: string; value: Task }
  days: { key: string; value: Day; indexes: { date: string } }
  entries: {
    key: string
    value: Entry
    indexes: { taskId: string; kind: string }
  }
  settings: { key: string; value: Settings }
}
const stores = ['tasks', 'days', 'entries', 'settings'] as const
type Tx = IDBPTransaction<Schema, typeof stores, 'readwrite'>
export class TimerRepository {
  private promise?: Promise<IDBPDatabase<Schema>>
  constructor(
    private name = 'multi-timers-v1',
    private onChange = () => {},
  ) {}
  private open() {
    return (this.promise ??= openDB<Schema>(this.name, 1, {
      upgrade(db) {
        db.createObjectStore('tasks', { keyPath: 'id' })
        db.createObjectStore('days', { keyPath: 'key' }).createIndex(
          'date',
          'date',
        )
        const entries = db.createObjectStore('entries', { keyPath: 'id' })
        entries.createIndex('taskId', 'taskId')
        entries.createIndex('kind', 'kind')
        db.createObjectStore('settings', { keyPath: 'id' }).put(
          initialSettings(),
        )
      },
      blocking: () => {
        void this.promise?.then((db) => db.close())
        this.promise = undefined
        this.onChange()
      },
      terminated: () => {
        this.promise = undefined
        this.onChange()
      },
    }).catch((error) => {
      this.promise = undefined
      throw error
    }))
  }
  async read(): Promise<Data> {
    const db = await this.open()
    const tx = db.transaction(stores)
    const [tasks, days, entries, settings] = await Promise.all([
      tx.objectStore('tasks').getAll(),
      tx.objectStore('days').getAll(),
      tx.objectStore('entries').getAll(),
      tx.objectStore('settings').get('app'),
    ])
    await tx.done
    if (!settings)
      throw new Error(
        'The local database is missing its settings. Restore a backup to recover your data.',
      )
    return { tasks, days, entries, settings }
  }
  private async write<T>(
    action: (tx: Tx, settings: Settings) => Promise<T>,
    changed = true,
  ) {
    const db = await this.open()
    // The shared readwrite scope serializes all writers, including other tabs.
    const tx = db.transaction(stores, 'readwrite', { durability: 'strict' })
    try {
      const settings = (await tx.objectStore('settings').get('app'))!
      const result = await action(tx, settings)
      if (changed) settings.lastChangedAt = Date.now()
      await tx.objectStore('settings').put(settings)
      await tx.done
      this.onChange()
      return result
    } catch (error) {
      try {
        tx.abort()
      } catch {
        /* Already aborted by the browser. */
      }
      await tx.done.catch(() => {})
      throw error
    }
  }
  private async task(tx: Tx, id: string) {
    const task = await tx.objectStore('tasks').get(id)
    if (!task)
      throw new Error('This task no longer exists. Refresh and try again.')
    return task
  }
  private async addDay(tx: Tx, taskId: string, date: string) {
    dateSchema.parse(date)
    const key = dayKey(taskId, date)
    const existing = await tx.objectStore('days').get(key)
    if (existing) return existing
    const days = await tx.objectStore('days').index('date').getAll(date)
    const day: Day = {
      key,
      taskId,
      date,
      status: 'open',
      sortOrder: Math.max(-1, ...days.map((d) => d.sortOrder)) + 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await tx.objectStore('days').put(day)
    return day
  }
  async createTask(
    name: string,
    description: string,
    favorite: boolean,
    date: string,
    allowDuplicate = false,
  ) {
    return this.write(async (tx) => {
      const task = taskSchema.parse({
        id: crypto.randomUUID(),
        name,
        description,
        favorite,
        archivedAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      const tasks = await tx.objectStore('tasks').getAll()
      if (
        !allowDuplicate &&
        tasks.some(
          (t) => t.name.toLocaleLowerCase() === task.name.toLocaleLowerCase(),
        )
      )
        throw new Error(
          'A task with this name already exists. Choose it from the library, or confirm creating a separate task.',
        )
      await tx.objectStore('tasks').put(task)
      await this.addDay(tx, task.id, date)
      return task.id
    })
  }
  async updateTask(
    id: string,
    values: Pick<Task, 'name' | 'description' | 'favorite' | 'archivedAt'>,
  ) {
    return this.write(async (tx, settings) => {
      const task = await this.task(tx, id)
      const active = settings.activeEntryId
        ? await tx.objectStore('entries').get(settings.activeEntryId)
        : null
      if (values.archivedAt && active?.taskId === id)
        throw new Error('Stop this task before archiving it.')
      await tx
        .objectStore('tasks')
        .put(taskSchema.parse({ ...task, ...values, updatedAt: Date.now() }))
    })
  }
  async addTasks(ids: string[], date: string) {
    return this.write(async (tx) => {
      for (const id of ids) {
        const task = await this.task(tx, id)
        if (!task.archivedAt) await this.addDay(tx, id, date)
      }
    })
  }
  private async closeActive(tx: Tx, settings: Settings, end: number) {
    if (!settings.activeEntryId) return
    const entry = await tx.objectStore('entries').get(settings.activeEntryId)
    if (entry?.kind !== 'timed' || entry.endedAt !== null)
      throw new Error('The active timer changed. Refresh before trying again.')
    if (end < entry.startedAt)
      throw new Error(
        'Your clock moved backward. Correct the session end time before continuing.',
      )
    if (end === entry.startedAt)
      await tx.objectStore('entries').delete(entry.id)
    else
      await tx
        .objectStore('entries')
        .put({ ...entry, endedAt: end, updatedAt: Date.now() })
    settings.activeEntryId = null
  }
  async start(taskId: string) {
    return this.write(async (tx, settings) => {
      const task = await this.task(tx, taskId)
      if (task.archivedAt)
        throw new Error(
          'Restore this task from the archive before starting it.',
        )
      const active = settings.activeEntryId
        ? await tx.objectStore('entries').get(settings.activeEntryId)
        : null
      if (active?.taskId === taskId) return
      // Capture inside the serialized transaction, never before waiting for another tab.
      const now = Date.now()
      await this.closeActive(tx, settings, now)
      const timed = await tx
        .objectStore('entries')
        .index('kind')
        .getAll('timed')
      if (
        timed.some((e) => e.kind === 'timed' && (e.endedAt ?? Infinity) > now)
      )
        throw new Error(
          'Your clock is earlier than recorded time. Correct the clock before starting a new timer.',
        )
      const entry: TimedEntry = {
        id: crypto.randomUUID(),
        taskId,
        taskNameSnapshot: task.name,
        kind: 'timed',
        startedAt: now,
        endedAt: null,
        note: '',
        createdAt: now,
        updatedAt: now,
      }
      await tx.objectStore('entries').put(entry)
      settings.activeEntryId = entry.id
      const day = await this.addDay(
        tx,
        taskId,
        localDate(now, settings.trackingTimeZone),
      )
      await tx
        .objectStore('days')
        .put({ ...day, status: 'open', updatedAt: now })
    })
  }
  async stop(expectedId: string, at = Date.now()) {
    return this.write(async (tx, settings) => {
      // A stale Stop from another tab must never stop a newly switched timer.
      if (settings.activeEntryId !== expectedId) return
      await this.closeActive(tx, settings, at)
    })
  }
  async setStatus(taskId: string, date: string, status: Day['status']) {
    return this.write(async (tx, settings) => {
      await this.task(tx, taskId)
      const active = settings.activeEntryId
        ? await tx.objectStore('entries').get(settings.activeEntryId)
        : null
      if (
        status === 'done' &&
        active?.taskId === taskId &&
        date === localDate(Date.now(), settings.trackingTimeZone)
      )
        await this.closeActive(tx, settings, Date.now())
      const day = await this.addDay(tx, taskId, date)
      await tx
        .objectStore('days')
        .put({ ...day, status, updatedAt: Date.now() })
    })
  }
  async removeDay(taskId: string, date: string) {
    return this.write(async (tx, settings) => {
      const entries = await tx
        .objectStore('entries')
        .index('taskId')
        .getAll(taskId)
      const bounds = dayBounds(date, settings.trackingTimeZone)
      if (
        entries.some(
          (e) =>
            timeOnDay(e, date, bounds, Date.now()) > 0 ||
            e.id === settings.activeEntryId,
        )
      )
        throw new Error(
          'This task has recorded time. Mark it done, or delete its time entries first.',
        )
      await tx.objectStore('days').delete(dayKey(taskId, date))
    })
  }
  async saveEntry(entry: Entry, correctingActive = false, mustExist = false) {
    return this.write(async (tx, settings) => {
      const parsed = entrySchema.parse(entry)
      await this.task(tx, entry.taskId)
      const current = await tx.objectStore('entries').get(entry.id)
      if (mustExist && !current)
        throw new Error(
          'This entry was deleted in another tab. Reopen task details.',
        )
      if (current && current.updatedAt !== entry.updatedAt)
        throw new Error(
          'This entry changed in another tab. Reopen it before editing.',
        )
      const now = Date.now()
      if (parsed.kind === 'manual') {
        if (parsed.date > localDate(now, settings.trackingTimeZone))
          throw new Error('Time cannot be recorded on a future date.')
      } else {
        if (parsed.endedAt === null || parsed.endedAt > now)
          throw new Error('Choose an end time no later than now.')
        if (settings.activeEntryId === entry.id && !correctingActive)
          throw new Error('Stop the timer before editing it.')
        assertNoOverlap(
          await tx.objectStore('entries').index('kind').getAll('timed'),
          parsed,
        )
      }
      await tx.objectStore('entries').put({
        ...parsed,
        updatedAt: Math.max(now, (current?.updatedAt ?? -1) + 1),
      })
      if (settings.activeEntryId === entry.id) settings.activeEntryId = null
    })
  }
  async deleteEntry(entryId: string) {
    return this.write(async (tx, settings) => {
      if (settings.activeEntryId === entryId)
        throw new Error('Stop this timer before deleting its entry.')
      await tx.objectStore('entries').delete(entryId)
    })
  }
  async welcome() {
    return this.write(async (_tx, s) => {
      s.welcomed = true
    }, false)
  }
  async markExported(at: number) {
    return this.write(async (_tx, s) => {
      s.lastExportAt = at
    }, false)
  }
  async snapshot(): Promise<Backup> {
    const data = await this.read()
    const exportedAt = Date.now()
    data.entries = data.entries.flatMap((e) =>
      e.kind === 'timed' && e.endedAt === null
        ? exportedAt <= e.startedAt
          ? []
          : [{ ...e, endedAt: exportedAt, updatedAt: exportedAt }]
        : [e],
    )
    data.settings.activeEntryId = null
    data.settings.lastExportAt = exportedAt
    return parseBackup(
      JSON.stringify({ format: 'multi-timers', version: 1, exportedAt, data }),
      exportedAt,
    )
  }
  async restore(text: string) {
    const backup = parseBackup(text)
    return this.write(async (tx, settings) => {
      if (settings.activeEntryId)
        throw new Error('Stop your running timer before restoring a backup.')
      for (const name of ['tasks', 'days', 'entries'] as const)
        await tx.objectStore(name).clear()
      await Promise.all([
        ...backup.data.tasks.map((task) => tx.objectStore('tasks').put(task)),
        ...backup.data.days.map((day) => tx.objectStore('days').put(day)),
        ...backup.data.entries.map((entry) =>
          tx.objectStore('entries').put(entry),
        ),
      ])
      Object.assign(settings, backup.data.settings, { welcomed: true })
    })
  }
}

const channel =
  typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('multi-timers-changes')
    : null
export const repository = new TimerRepository('multi-timers-v1', () => {
  channel?.postMessage('changed')
  if (typeof window !== 'undefined')
    window.dispatchEvent(new Event('timers-changed'))
})
if (typeof window !== 'undefined' && channel)
  channel.onmessage = () => window.dispatchEvent(new Event('timers-changed'))
