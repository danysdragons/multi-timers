import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TimerRepository } from './db'
import { dayKey, parseBackup, type Entry } from './model'
import { duration } from './time'
import { openDB } from 'idb'

let repo: TimerRepository
let name: string
const now = Date.parse('2026-09-25T12:00:00Z')
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  name = `test-${crypto.randomUUID()}`
  repo = new TimerRepository(name)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
async function tasks() {
  const x = await repo.createTask('Study X', '', true, '2026-09-25')
  const y = await repo.createTask('Study Y', '', false, '2026-09-25')
  return { x, y }
}
async function activeId() {
  return (await repo.read()).settings.activeEntryId!
}
function manual(taskId: string): Entry {
  return {
    id: crypto.randomUUID(),
    taskId,
    taskNameSnapshot: 'Study X',
    kind: 'manual',
    date: '2026-09-25',
    durationMs: 1800_000,
    note: '',
    createdAt: now,
    updatedAt: now,
  }
}

describe('persistent timer operations', () => {
  it('rolls back failed writes and retries Stop at the original requested instant', async () => {
    const { x } = await tasks()
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Storage full', 'QuotaExceededError')
    })
    await expect(repo.start(x)).rejects.toThrow('Storage full')
    expect((await repo.read()).settings.activeEntryId).toBeNull()
    expect((await repo.read()).entries).toHaveLength(0)
    await repo.start(x)
    const id = await activeId()
    vi.setSystemTime(now + 10_000)
    const stopAt = Date.now()
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Storage full', 'QuotaExceededError')
    })
    await expect(repo.stop(id, stopAt)).rejects.toThrow('Storage full')
    expect((await repo.read()).settings.activeEntryId).toBe(id)
    vi.setSystemTime(now + 60_000)
    await repo.stop(id, stopAt)
    const saved = (await repo.read()).entries[0]
    expect(saved.kind === 'timed' && saved.endedAt).toBe(stopAt)
  })
  it('does not resurrect an entry deleted while an edit form was open', async () => {
    const { x } = await tasks()
    await repo.saveEntry(manual(x))
    const stale = (await repo.read()).entries[0]
    await repo.deleteEntry(stale.id)
    await expect(repo.saveEntry(stale, false, true)).rejects.toThrow(
      'deleted in another tab',
    )
    expect((await repo.read()).entries).toHaveLength(0)
  })
  it('accumulates separate sessions and restores through a new connection', async () => {
    const { x } = await tasks()
    await repo.start(x)
    vi.setSystemTime(now + 25 * 60_000)
    await repo.stop(await activeId())
    vi.setSystemTime(now + 60 * 60_000)
    await repo.start(x)
    vi.setSystemTime(now + 95 * 60_000)
    await repo.stop(await activeId())
    const data = await new TimerRepository(name).read()
    expect(data.entries).toHaveLength(2)
    expect(
      data.entries.reduce((sum, e) => sum + duration(e, Date.now()), 0),
    ).toBe(3600_000)
  })
  it('switches tasks atomically and ignores stale stop requests', async () => {
    const { x, y } = await tasks()
    await repo.start(x)
    const old = await activeId()
    vi.setSystemTime(now + 5000)
    await repo.start(y)
    await repo.stop(old)
    const data = await repo.read()
    const first = data.entries.find((e) => e.id === old)!
    const second = data.entries.find(
      (e) => e.id === data.settings.activeEntryId,
    )!
    expect(first.kind === 'timed' && first.endedAt).toBe(now + 5000)
    expect(second.kind === 'timed' && second.startedAt).toBe(now + 5000)
    expect(second.taskId).toBe(y)
  })
  it('serializes racing tab starts and repeated clicks', async () => {
    const { x, y } = await tasks()
    const otherTab = new TimerRepository(name)
    await Promise.all([repo.start(x), otherTab.start(y), repo.start(x)])
    await Promise.all([repo.start(x), otherTab.start(x)])
    const data = await repo.read()
    expect(
      data.entries.filter((e) => e.kind === 'timed' && e.endedAt === null),
    ).toHaveLength(1)
    expect(
      data.entries.find((e) => e.id === data.settings.activeEntryId)?.taskId,
    ).toBe(x)
  })
  it('copies tasks idempotently without copying time or completion', async () => {
    const { x, y } = await tasks()
    await repo.saveEntry(manual(x))
    await repo.setStatus(x, '2026-09-25', 'done')
    await repo.addTasks([x, y], '2026-09-26')
    await repo.setStatus(y, '2026-09-26', 'done')
    await repo.addTasks([x, y], '2026-09-26')
    const data = await repo.read()
    expect(data.days.filter((d) => d.date === '2026-09-26')).toHaveLength(2)
    expect(
      data.days.find((d) => d.key === dayKey(x, '2026-09-26'))?.status,
    ).toBe('open')
    expect(
      data.days.find((d) => d.key === dayKey(y, '2026-09-26'))?.status,
    ).toBe('done')
    expect(data.entries).toHaveLength(1)
    expect(data.tasks).toHaveLength(2)
  })
  it('preserves history when renaming and archiving, and protects timed days', async () => {
    const { x } = await tasks()
    await repo.saveEntry(manual(x))
    await repo.updateTask(x, {
      name: 'New name',
      description: '',
      favorite: false,
      archivedAt: now,
    })
    const data = await repo.read()
    expect(data.entries[0].taskNameSnapshot).toBe('Study X')
    expect(data.tasks.find((t) => t.id === x)?.name).toBe('New name')
    await expect(repo.removeDay(x, '2026-09-25')).rejects.toThrow(
      'recorded time',
    )
    await expect(repo.start(x)).rejects.toThrow('archive')
  })
  it('includes closed-browser time without heartbeat writes', async () => {
    const { x } = await tasks()
    await repo.start(x)
    vi.setSystemTime(now + 8 * 3600_000)
    const data = await new TimerRepository(name).read()
    expect(duration(data.entries[0], Date.now())).toBe(8 * 3600_000)
    expect(data.settings.activeEntryId).toBe(data.entries[0].id)
  })
  it('rolls back an invalid switch after a backward clock adjustment', async () => {
    const { x, y } = await tasks()
    await repo.start(x)
    vi.setSystemTime(now - 5000)
    await expect(repo.start(y)).rejects.toThrow('clock')
    const data = await repo.read()
    expect(data.entries).toHaveLength(1)
    expect(data.entries[0].taskId).toBe(x)
    expect(data.settings.activeEntryId).toBe(data.entries[0].id)
  })
  it('rejects overlapping edits, future time, and stale edits without changing data', async () => {
    const { x, y } = await tasks()
    await repo.start(x)
    vi.setSystemTime(now + 5000)
    await repo.start(y)
    vi.setSystemTime(now + 10_000)
    await repo.stop(await activeId())
    const data = await repo.read()
    const xEntry = data.entries.find((e) => e.taskId === x)!
    expect(xEntry.kind).toBe('timed')
    if (xEntry.kind !== 'timed') throw new Error('Expected timed entry')
    await expect(
      repo.saveEntry({ ...xEntry, endedAt: now + 7000 }),
    ).rejects.toThrow('overlaps')
    await expect(
      repo.saveEntry({ ...xEntry, endedAt: now + 50_000 }),
    ).rejects.toThrow('no later than now')
    const future = manual(x)
    if (future.kind === 'manual') future.date = '2027-01-01'
    await expect(repo.saveEntry(future)).rejects.toThrow('future')
    await repo.saveEntry({ ...xEntry, note: 'edited' })
    await expect(
      repo.saveEntry({ ...xEntry, note: 'stale edit' }),
    ).rejects.toThrow('another tab')
  })
  it('completes and reopens a task without resetting time', async () => {
    const { x } = await tasks()
    await repo.start(x)
    vi.setSystemTime(now + 5000)
    await repo.setStatus(x, '2026-09-25', 'done')
    expect((await repo.read()).settings.activeEntryId).toBeNull()
    vi.setSystemTime(now + 10_000)
    await repo.start(x)
    const data = await repo.read()
    expect(data.days.find((d) => d.taskId === x)?.status).toBe('open')
    expect(
      data.entries.reduce((sum, e) => sum + duration(e, Date.now()), 0),
    ).toBe(5000)
  })
})

describe('backups', () => {
  it('exports a stopped snapshot without changing the running timer', async () => {
    const { x } = await tasks()
    await repo.start(x)
    vi.setSystemTime(now + 5000)
    const snapshot = await repo.snapshot()
    expect(snapshot.data.settings.activeEntryId).toBeNull()
    expect(
      snapshot.data.entries[0].kind === 'timed' &&
        snapshot.data.entries[0].endedAt,
    ).toBe(now + 5000)
    expect((await repo.read()).settings.activeEntryId).not.toBeNull()
    await expect(repo.restore(JSON.stringify(snapshot))).rejects.toThrow('Stop')
    await repo.stop(await activeId())
    await repo.restore(JSON.stringify(snapshot))
    expect((await repo.read()).entries).toEqual(snapshot.data.entries)
    expect((await repo.read()).settings.activeEntryId).toBeNull()
  })
  it('rejects malformed, orphaned, duplicate, future, and overlapping backups atomically', async () => {
    const { x } = await tasks()
    await repo.saveEntry(manual(x))
    const before = await repo.read()
    const snapshot = await repo.snapshot()
    const duplicate = structuredClone(snapshot)
    duplicate.data.entries.push(duplicate.data.entries[0])
    const orphan = structuredClone(snapshot)
    orphan.data.entries[0].taskId = crypto.randomUUID()
    const invalidDate = structuredClone(snapshot)
    invalidDate.data.days[0].date = '2026-02-30'
    for (const text of [
      'nope',
      '{}',
      JSON.stringify(duplicate),
      JSON.stringify(orphan),
      JSON.stringify(invalidDate),
    ]) {
      await expect(repo.restore(text)).rejects.toThrow()
      expect(await repo.read()).toEqual(before)
    }
  })
  it('validates overlapping sessions in O(n log n) on large imports', async () => {
    const { x } = await tasks()
    const snapshot = await repo.snapshot()
    snapshot.data.entries = Array.from({ length: 50_000 }, (_, i) => ({
      id: crypto.randomUUID(),
      taskId: x,
      taskNameSnapshot: 'Study X',
      kind: 'timed' as const,
      startedAt: now - (50_000 - i) * 1000,
      endedAt: now - (50_000 - i) * 1000 + 500,
      createdAt: now,
      updatedAt: now,
      note: '',
    }))
    expect(parseBackup(JSON.stringify(snapshot)).data.entries).toHaveLength(
      50_000,
    )
    const last = snapshot.data.entries.at(-1)!
    if (last.kind === 'timed') last.startedAt -= 1000
    expect(() => parseBackup(JSON.stringify(snapshot))).toThrow('overlapping')
  })
})

describe('task deletion and appearance', () => {
  it('deletes all of one task’s days and entries, preserving other tasks and their active timer', async () => {
    const { x, y } = await tasks()
    await repo.saveEntry(manual(x))
    await repo.addTasks([x, y], '2026-09-26')
    await repo.start(x)
    vi.setSystemTime(now + 5000)
    await repo.start(y)
    const otherActiveId = await activeId()
    await repo.deleteTask(x)
    const data = await new TimerRepository(name).read()
    expect(data.tasks.map((task) => task.id)).toEqual([y])
    expect(data.days.every((day) => day.taskId === y)).toBe(true)
    expect(data.entries.every((entry) => entry.taskId === y)).toBe(true)
    expect(data.settings.activeEntryId).toBe(otherActiveId)
    expect(() =>
      parseBackup(
        JSON.stringify({
          format: 'multi-timers',
          version: 1,
          exportedAt: now + 5000,
          data,
        }),
      ),
    ).toThrow('stopped timers')
    vi.setSystemTime(now + 6000)
    await repo.stop(otherActiveId)
    expect((await repo.snapshot()).data.tasks).toHaveLength(1)
  })
  it('rejects deletion of a running task, including a stale request from another tab', async () => {
    const { x } = await tasks()
    const otherTab = new TimerRepository(name)
    await otherTab.start(x)
    const before = await repo.read()
    await expect(repo.deleteTask(x)).rejects.toThrow('Stop')
    expect(await repo.read()).toEqual(before)
  })
  it('rolls the whole deletion back when storage fails', async () => {
    const { x } = await tasks()
    await repo.saveEntry(manual(x))
    const before = await repo.read()
    vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementationOnce(() => {
      throw new DOMException('Write failed', 'UnknownError')
    })
    await expect(repo.deleteTask(x)).rejects.toThrow('Write failed')
    expect(await repo.read()).toEqual(before)
  })
  it('persists independent theme and density updates without changing timer data', async () => {
    const { x } = await tasks()
    await repo.start(x)
    const before = await repo.read()
    const otherTab = new TimerRepository(name)
    await Promise.all([
      repo.updateAppearance({ theme: 'midnight' }),
      otherTab.updateAppearance({ density: 'compact' }),
    ])
    const data = await new TimerRepository(name).read()
    expect(data.settings.theme).toBe('midnight')
    expect(data.settings.density).toBe('compact')
    expect(data.settings.activeEntryId).toBe(before.settings.activeEntryId)
    expect(data.entries).toEqual(before.entries)
    expect(data.tasks).toEqual(before.tasks)
  })
  it('reads and updates existing databases that predate appearance preferences', async () => {
    await tasks()
    const db = await openDB(name)
    const settings = await db.get('settings', 'app')
    delete settings.theme
    delete settings.density
    await db.put('settings', settings)
    db.close()
    const before = await repo.read()
    expect(before.settings.theme).toBe('forest')
    expect(before.settings.density).toBe('comfortable')
    await repo.updateAppearance({ theme: 'ocean' })
    expect((await repo.read()).settings.theme).toBe('ocean')
    expect((await repo.read()).tasks).toEqual(before.tasks)
  })
  it('restores older backups with defaults and newer backups with saved preferences', async () => {
    const { x } = await tasks()
    await repo.saveEntry(manual(x))
    await repo.updateAppearance({ theme: 'plum', density: 'compact' })
    const snapshot = await repo.snapshot()
    const legacy = JSON.parse(JSON.stringify(snapshot))
    delete legacy.data.settings.theme
    delete legacy.data.settings.density
    await repo.restore(JSON.stringify(legacy))
    expect((await repo.read()).settings.theme).toBe('forest')
    expect((await repo.read()).settings.density).toBe('comfortable')
    await repo.restore(JSON.stringify(snapshot))
    expect((await repo.read()).settings.theme).toBe('plum')
    expect((await repo.read()).settings.density).toBe('compact')
    expect((await repo.read()).entries).toEqual(snapshot.data.entries)
  })
})
