import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDB } from 'idb'
import { TimerRepository } from './db'
import {
  initialSettings,
  parseBackup,
  type IntakeEntryValues,
  type IntakeItemValues,
} from './model'
import { dayBounds, parseIntakeTime } from './time'

const now = Date.parse('2026-09-27T16:00:00Z')
const itemValues: IntakeItemValues = {
  name: 'Test supplement',
  category: 'Supplement',
  quantity: 1,
  unit: 'capsule',
  strength: '200 mg per capsule',
}
const logValues: IntakeEntryValues = {
  quantity: 2,
  unit: 'capsule',
  strength: '200 mg per capsule',
  takenAt: now - 60_000,
  note: 'With breakfast',
}
let repo: TimerRepository
let name: string
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  name = `intake-test-${crypto.randomUUID()}`
  repo = new TimerRepository(name)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('intake storage and history', () => {
  it('upgrades a v1 database without losing tasks, running timers, settings, or day records', async () => {
    const taskId = crypto.randomUUID(),
      entryId = crypto.randomUUID()
    const legacy = await openDB(name, 1, {
      upgrade(db) {
        db.createObjectStore('tasks', { keyPath: 'id' })
        db.createObjectStore('days', { keyPath: 'key' }).createIndex(
          'date',
          'date',
        )
        const entries = db.createObjectStore('entries', { keyPath: 'id' })
        entries.createIndex('taskId', 'taskId')
        entries.createIndex('kind', 'kind')
        db.createObjectStore('settings', { keyPath: 'id' })
      },
    })
    const task = {
      id: taskId,
      name: 'Study',
      description: '',
      favorite: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    const entry = {
      id: entryId,
      taskId,
      taskNameSnapshot: 'Study',
      kind: 'timed',
      startedAt: now - 5000,
      endedAt: null,
      note: '',
      createdAt: now,
      updatedAt: now,
    }
    const day = {
      key: `${taskId}:2026-09-27`,
      taskId,
      date: '2026-09-27',
      status: 'open',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    }
    await legacy.put('settings', {
      ...initialSettings('America/Toronto'),
      activeEntryId: entryId,
      theme: 'midnight',
    })
    await legacy.put('tasks', task)
    await legacy.put('entries', entry)
    await legacy.put('days', day)
    legacy.close()
    const data = await repo.read()
    expect(data.tasks).toEqual([task])
    expect(data.entries).toEqual([entry])
    expect(data.days).toEqual([day])
    expect(data.settings.activeEntryId).toBe(entryId)
    expect(data.settings.theme).toBe('midnight')
    expect(data.intakeItems).toEqual([])
    expect(data.intakeEntries).toEqual([])
    await repo.saveIntakeItem(itemValues)
    expect((await repo.read()).settings.activeEntryId).toBe(entryId)
  })
  it('keeps intake operations independent of running timers and preserves historical snapshots', async () => {
    const task = await repo.createTask('Study', '', false, '2026-09-27')
    await repo.start(task)
    const before = await repo.read()
    const item = await repo.saveIntakeItem(itemValues)
    const entry = await repo.saveIntakeEntry(item.id, logValues)
    const renamed = await repo.saveIntakeItem(
      {
        ...itemValues,
        name: 'Different product',
        category: 'Other',
        strength: '500 mg per capsule',
        quantity: 3,
      },
      item,
    )
    expect((await repo.read()).intakeEntries).toEqual([entry])
    const corrected = await repo.saveIntakeEntry(
      item.id,
      { ...logValues, quantity: 0.5, unit: 'tablet', takenAt: now - 120000 },
      entry,
    )
    expect(corrected.name).toBe('Test supplement')
    expect(corrected.category).toBe('Supplement')
    expect(corrected.strength).toBe('200 mg per capsule')
    await repo.archiveIntakeItem(renamed, true)
    await expect(repo.saveIntakeEntry(item.id, logValues)).rejects.toThrow(
      'Restore',
    )
    await repo.deleteIntakeEntry(corrected)
    const data = await repo.read()
    expect(data.intakeEntries).toEqual([])
    expect(data.entries).toEqual(before.entries)
    expect(data.settings.activeEntryId).toBe(before.settings.activeEntryId)
  })
  it('allows simultaneous intake events and validates amounts, units, and future timestamps', async () => {
    const item = await repo.saveIntakeItem(itemValues)
    await Promise.all([
      repo.saveIntakeEntry(item.id, logValues),
      new TimerRepository(name).saveIntakeEntry(item.id, {
        ...logValues,
        quantity: 0.5,
      }),
    ])
    expect((await repo.read()).intakeEntries).toHaveLength(2)
    const before = await repo.read()
    for (const values of [
      { quantity: 0 },
      { quantity: -1 },
      { quantity: Infinity },
      { quantity: NaN },
      { unit: ' ' },
      { takenAt: now + 1 },
    ]) {
      await expect(
        repo.saveIntakeEntry(item.id, { ...logValues, ...values }),
      ).rejects.toThrow()
      expect(await repo.read()).toEqual(before)
    }
    await expect(
      repo.saveIntakeItem({ ...itemValues, name: ' TEST SUPPLEMENT ' }),
    ).rejects.toThrow('already exists')
  })
  it('rejects stale edits and undo after another tab changes an entry', async () => {
    const item = await repo.saveIntakeItem(itemValues)
    const entry = await repo.saveIntakeEntry(item.id, logValues)
    const other = new TimerRepository(name)
    const changed = await other.saveIntakeEntry(
      item.id,
      { ...logValues, quantity: 3 },
      entry,
    )
    await expect(
      repo.saveIntakeEntry(item.id, logValues, entry),
    ).rejects.toThrow('changed')
    await expect(repo.deleteIntakeEntry(entry)).rejects.toThrow('changed')
    await other.deleteIntakeEntry(changed)
    await expect(
      repo.saveIntakeEntry(item.id, logValues, changed),
    ).rejects.toThrow('deleted')
    const updated = await other.saveIntakeItem(
      { ...itemValues, name: 'Renamed' },
      item,
    )
    await expect(repo.archiveIntakeItem(item, true)).rejects.toThrow('changed')
    expect((await repo.read()).intakeItems[0]).toEqual(updated)
  })
  it('rolls back failed intake writes and deletions', async () => {
    const item = await repo.saveIntakeItem(itemValues)
    const before = await repo.read()
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Storage full', 'QuotaExceededError')
    })
    await expect(repo.saveIntakeEntry(item.id, logValues)).rejects.toThrow(
      'Storage full',
    )
    expect(await repo.read()).toEqual(before)
    const entry = await repo.saveIntakeEntry(item.id, logValues)
    vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementationOnce(() => {
      throw new Error('Delete failed')
    })
    await expect(repo.deleteIntakeEntry(entry)).rejects.toThrow('Delete failed')
    expect((await repo.read()).intakeEntries).toEqual([entry])
  })
})

describe('intake backup compatibility', () => {
  it('round trips v2 intake and task records, and imports old v1 backups with no intake', async () => {
    await repo.createTask('Study', '', false, '2026-09-27')
    const item = await repo.saveIntakeItem(itemValues)
    await repo.saveIntakeEntry(item.id, logValues)
    const snapshot = await repo.snapshot()
    expect(snapshot.version).toBe(2)
    const other = new TimerRepository(`restore-${crypto.randomUUID()}`)
    await other.restore(JSON.stringify(snapshot))
    expect((await other.read()).intakeEntries).toEqual(
      snapshot.data.intakeEntries,
    )
    expect((await other.read()).intakeItems).toEqual(snapshot.data.intakeItems)
    const legacy = JSON.parse(JSON.stringify(snapshot))
    legacy.version = 1
    delete legacy.data.intakeItems
    delete legacy.data.intakeEntries
    await other.restore(JSON.stringify(legacy))
    const data = await other.read()
    expect(data.intakeItems).toEqual([])
    expect(data.intakeEntries).toEqual([])
    expect(data.tasks).toEqual(snapshot.data.tasks)
  })
  it('rejects malformed, duplicate, orphaned, future, and incomplete v2 intake backups without changing any records', async () => {
    const item = await repo.saveIntakeItem(itemValues)
    await repo.saveIntakeEntry(item.id, logValues)
    const before = await repo.read(),
      snapshot = await repo.snapshot()
    for (const mutate of [
      (b: any) => {
        b.data.intakeEntries[0].itemId = crypto.randomUUID()
      },
      (b: any) => {
        b.data.intakeEntries.push(b.data.intakeEntries[0])
      },
      (b: any) => {
        b.data.intakeItems.push(b.data.intakeItems[0])
      },
      (b: any) => {
        b.data.intakeEntries[0].quantity = 0
      },
      (b: any) => {
        b.data.intakeEntries[0].takenAt = now + 1
      },
      (b: any) => {
        delete b.data.intakeEntries
      },
      (b: any) => {
        b.version = 99
      },
    ]) {
      const backup = structuredClone(snapshot)
      mutate(backup)
      expect(() => parseBackup(JSON.stringify(backup))).toThrow()
      await expect(repo.restore(JSON.stringify(backup))).rejects.toThrow()
      expect(await repo.read()).toEqual(before)
    }
  })
  it('rolls back a restore that fails after clearing stores', async () => {
    const item = await repo.saveIntakeItem(itemValues)
    await repo.saveIntakeEntry(item.id, logValues)
    const before = await repo.read()
    const backup = await repo.snapshot()
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new Error('Write failed')
    })
    await expect(repo.restore(JSON.stringify(backup))).rejects.toThrow(
      'Write failed',
    )
    expect(await repo.read()).toEqual(before)
  })
})

describe('intake dates', () => {
  it('uses the saved zone and assigns midnight to the next local day', () => {
    const at = parseIntakeTime('2026-09-27T00:00:00', 'America/Toronto')
    expect(at).toBe(Date.parse('2026-09-27T04:00:00Z'))
    expect(dayBounds('2026-09-26', 'America/Toronto')[1]).toBe(at)
    expect(dayBounds('2026-09-27', 'America/Toronto')[0]).toBe(at)
  })
  it('rejects missing hours and requires explicit repeated-hour selection', () => {
    for (const choice of ['reject', 'earlier', 'later'] as const)
      expect(() =>
        parseIntakeTime('2026-03-08T02:30', 'America/Toronto', choice),
      ).toThrow()
    expect(() =>
      parseIntakeTime('2026-11-01T01:30', 'America/Toronto'),
    ).toThrow()
    const first = parseIntakeTime(
      '2026-11-01T01:30',
      'America/Toronto',
      'earlier',
    )
    const second = parseIntakeTime(
      '2026-11-01T01:30',
      'America/Toronto',
      'later',
    )
    expect(second - first).toBe(3600000)
  })
})
