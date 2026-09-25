import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Database,
  Edit3,
  EllipsisVertical,
  List,
  Pause,
  Play,
  Plus,
  Search,
  Settings as SettingsIcon,
  Square,
  Star,
  Timer,
  Trash2,
  X,
} from 'lucide-react'
import { z } from 'zod'
import { repository } from './db'
import { type Data, type Entry } from './model'
import {
  addDays,
  dayBounds,
  duration,
  formatDuration,
  friendlyDate,
  friendlyTime,
  localDate,
  timeOnDay,
} from './time'
import { Dialog, OperationError } from './components/Dialog'
import { AddTaskDialog, EditTaskDialog, type Run } from './components/TaskForms'
import { TimeEntryForm } from './components/TimeEntryForm'
import { exportBackup, SettingsDialog } from './components/Settings'
import { DeleteTaskDialog } from './components/DeleteTaskDialog'

type Modal =
  | { type: 'add' | 'settings' | 'copy' }
  | { type: 'task' | 'edit-task' | 'delete-task'; taskId: string }
  | { type: 'entry'; taskId: string; entry?: Entry }
  | { type: 'delete'; entry: Entry }
type Total = { ms: number; count: number }
const emptyTotal: Total = { ms: 0, count: 0 }

function useClock() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const interval = setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [])
  return now
}

function summarize(data: Data, date: string, zone: string) {
  const bounds = dayBounds(date, zone)
  const result = new Map<string, Total>()
  for (const entry of data.entries) {
    if (entry.kind === 'timed' && entry.endedAt === null) continue
    const ms = timeOnDay(entry, date, bounds, 0)
    if (ms > 0) {
      const total = result.get(entry.taskId) ?? { ...emptyTotal }
      total.ms += ms
      total.count++
      result.set(entry.taskId, total)
    }
  }
  return result
}

export default function App() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [view, setView] = useState<'day' | 'library'>('day')
  const [chosenDate, setChosenDate] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [modal, setModal] = useState<Modal | null>(null)
  const [copyDate, setCopyDate] = useState('')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [recoveryId, setRecoveryId] = useState<string | null>(null)
  const [pendingStop, setPendingStop] = useState<{
    id: string
    at: number
  } | null>(null)
  const loaded = useRef(false)
  const readNumber = useRef(0)
  const now = useClock()
  useEffect(() => {
    document.documentElement.dataset.theme = data?.settings.theme ?? 'forest'
    document.documentElement.dataset.density =
      data?.settings.density ?? 'comfortable'
  }, [data?.settings.theme, data?.settings.density])
  const refresh = useCallback(async () => {
    const number = ++readNumber.current
    const result = await repository.read()
    if (number !== readNumber.current) return
    setData(result)
    const taskIds = new Set(result.tasks.map((task) => task.id))
    setSelected((ids) =>
      ids.some((id) => !taskIds.has(id))
        ? ids.filter((id) => taskIds.has(id))
        : ids,
    )
    setModal((current) => {
      const taskId =
        current &&
        ('taskId' in current
          ? current.taskId
          : 'entry' in current
            ? current.entry.taskId
            : null)
      return taskId && !taskIds.has(taskId) ? null : current
    })
    if (!loaded.current) {
      loaded.current = true
      setRecoveryId(result.settings.activeEntryId)
    }
  }, [])
  useEffect(() => {
    const load = () => {
      void refresh().catch((e) =>
        setError(
          `Unable to access saved data: ${e instanceof Error ? e.message : 'Browser storage is unavailable.'}`,
        ),
      )
    }
    load()
    window.addEventListener('timers-changed', load)
    window.addEventListener('focus', load)
    const poll = setInterval(load, 30_000)
    return () => {
      window.removeEventListener('timers-changed', load)
      window.removeEventListener('focus', load)
      clearInterval(poll)
    }
  }, [refresh])
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(''), 4500)
      return () => clearTimeout(timer)
    }
  }, [notice])

  const run: Run = async (action, message) => {
    setBusy(true)
    setError('')
    try {
      await action()
      await refresh()
      if (message) setNotice(message)
      return true
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? 'Check the fields and try again. Names, dates, and durations must be valid.'
          : e instanceof Error
            ? e.message
            : 'The change could not be saved. Please try again.',
      )
      return false
    } finally {
      setBusy(false)
    }
  }
  const zone =
    data?.settings.trackingTimeZone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = localDate(now, zone)
  const date = chosenDate ?? today
  const bounds = useMemo(() => dayBounds(date, zone), [date, zone])
  const todayBounds = useMemo(() => dayBounds(today, zone), [today, zone])
  const dayTotals = useMemo(
    () => (data ? summarize(data, date, zone) : new Map<string, Total>()),
    [data, date, zone],
  )
  const todayTotals = useMemo(
    () => (data ? summarize(data, today, zone) : new Map<string, Total>()),
    [data, today, zone],
  )
  const active = useMemo(
    () => data?.entries.find((e) => e.id === data.settings.activeEntryId),
    [data],
  )
  const activeTask = useMemo(
    () => data?.tasks.find((t) => t.id === active?.taskId),
    [data, active],
  )
  const days = useMemo(
    () =>
      new Map(
        data?.days.filter((d) => d.date === date).map((d) => [d.taskId, d]),
      ),
    [data, date],
  )
  const taskMap = useMemo(
    () => new Map(data?.tasks.map((t) => [t.id, t])),
    [data],
  )
  const lifetime = useMemo(() => {
    const result = new Map<string, number>()
    for (const entry of data?.entries ?? [])
      if (!(entry.kind === 'timed' && entry.endedAt === null))
        result.set(
          entry.taskId,
          (result.get(entry.taskId) ?? 0) + duration(entry, 0),
        )
    return result
    // Closed entries do not change with the clock.
  }, [data])
  const dayTasks = useMemo(
    () =>
      data?.tasks
        .filter(
          (t) =>
            days.has(t.id) ||
            dayTotals.has(t.id) ||
            (active?.taskId === t.id &&
              timeOnDay(active, date, bounds, now) >= 0 &&
              active.kind === 'timed' &&
              active.startedAt < bounds[1] &&
              now >= bounds[0]),
        )
        .sort(
          (a, b) =>
            (days.get(a.id)?.sortOrder ?? Infinity) -
              (days.get(b.id)?.sortOrder ?? Infinity) ||
            a.createdAt - b.createdAt,
        ) ?? [],
    [data, days, dayTotals, active, date, bounds, now],
  )
  function totalFor(taskId: string, forToday = false) {
    const base = (forToday ? todayTotals : dayTotals).get(taskId) ?? emptyTotal
    const extra =
      active?.taskId === taskId
        ? timeOnDay(
            active,
            forToday ? today : date,
            forToday ? todayBounds : bounds,
            now,
          )
        : 0
    return {
      ms: base.ms + extra,
      count:
        base.count +
        (active?.taskId === taskId && (extra > 0 || forToday || date === today)
          ? 1
          : 0),
    }
  }
  function navigate(next: string | null) {
    setChosenDate(next)
    setSelected([])
    setView('day')
  }
  function open(value: Modal) {
    setError('')
    setModal(value)
  }
  function close() {
    setError('')
    setModal(null)
  }
  function copySelected() {
    setCopyDate(addDays(date, 1))
    open({ type: 'copy' })
  }
  async function stopTimer() {
    if (!active) return
    const request =
      pendingStop?.id === active.id
        ? pendingStop
        : { id: active.id, at: Date.now() }
    setPendingStop(request)
    if (
      await run(
        () => repository.stop(request.id, request.at),
        'Timer stopped. Time saved.',
      )
    ) {
      setPendingStop(null)
      setRecoveryId(null)
    }
  }
  if (!data)
    return (
      <div className="loading-screen">
        <Timer size={38} />
        <h1>Multi Timers</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <p>
              Enable site storage in your browser, then try again. No unsaved
              timer will be started.
            </p>
            <button
              className="button primary"
              onClick={() => void run(refresh)}
            >
              Try again
            </button>
          </>
        ) : (
          <p>Opening your workspace…</p>
        )}
      </div>
    )
  const visibleLibrary = data.tasks
    .filter(
      (t) =>
        !!t.archivedAt === showArchived &&
        t.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name),
    )
  const favorites = data.tasks.filter((t) => t.favorite && !t.archivedAt)
  const modalTask =
    modal && 'taskId' in modal ? taskMap.get(modal.taskId) : undefined
  const isToday = date === today
  const backupDue =
    now - (data.settings.lastExportAt ?? data.settings.firstUsedAt) >
      7 * 86400000 &&
    data.settings.lastChangedAt > (data.settings.lastExportAt ?? 0) &&
    data.entries.length > 0
  const clockError = active?.kind === 'timed' && Date.now() < active.startedAt
  const taskEntries = modalTask
    ? data.entries
        .filter(
          (e) =>
            e.taskId === modalTask.id &&
            (timeOnDay(e, date, bounds, now) > 0 || e.id === active?.id),
        )
        .sort((a, b) => b.createdAt - a.createdAt)
    : []

  return (
    <OperationError.Provider value={error}>
      <a className="skip-link" href="#main">
        Skip to tasks
      </a>
      <header className="site-header">
        <div className="nav-inner">
          <a
            href="#"
            className="brand"
            onClick={(e) => {
              e.preventDefault()
              navigate(null)
            }}
          >
            <span className="brand-icon">
              <Timer size={30} strokeWidth={2.2} />
            </span>
            <span>Multi Timers</span>
          </a>
          <nav aria-label="Main navigation">
            <button
              className={view === 'day' ? 'nav-item current' : 'nav-item'}
              aria-current={view === 'day' ? 'page' : undefined}
              onClick={() => navigate(null)}
            >
              Today
            </button>
            <button
              className={view === 'library' ? 'nav-item current' : 'nav-item'}
              aria-current={view === 'library' ? 'page' : undefined}
              onClick={() => {
                setView('library')
                setSelected([])
              }}
            >
              Task library
            </button>
          </nav>
          <div className="display-controls">
            <button
              className="button density-toggle"
              aria-label="Compact view"
              aria-pressed={data.settings.density === 'compact'}
              disabled={busy}
              title="Toggle compact view"
              onClick={() =>
                void run(() =>
                  repository.updateAppearance({
                    density:
                      data.settings.density === 'compact'
                        ? 'comfortable'
                        : 'compact',
                  }),
                )
              }
            >
              <List size={18} />
              <span>Compact</span>
            </button>
            <button
              className="icon-button settings-button"
              aria-label="Settings and backups"
              onClick={() => open({ type: 'settings' })}
            >
              <SettingsIcon size={23} />
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="workspace">
        {!data.settings.welcomed && (
          <section className="welcome-banner">
            <div>
              <strong>Your time, in one place.</strong>
              <p>
                Saved in this browser. Export backups to keep your history safe.
                Timers keep running until you stop them—even if you close the
                tab.
              </p>
            </div>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await repository.welcome()
                  await navigator.storage?.persist?.().catch(() => false)
                })
              }
            >
              Got it
            </button>
          </section>
        )}
        <div className="page-heading">
          <div>
            <h1>
              {view === 'library'
                ? 'Task library'
                : isToday
                  ? 'Today'
                  : friendlyDate(date, {
                      weekday: undefined,
                      month: 'long',
                      day: 'numeric',
                      year: undefined,
                    })}
            </h1>
            <p>
              {view === 'library'
                ? 'Familiar tasks. A fresh start each day.'
                : friendlyDate(date)}
            </p>
          </div>
          {view === 'day' ? (
            <div className="date-navigation">
              <button
                className="icon-button bordered"
                aria-label="Previous day"
                onClick={() => navigate(addDays(date, -1))}
              >
                <ChevronLeft size={20} />
              </button>
              <label className="date-control">
                <CalendarDays size={18} />
                <input
                  aria-label="Selected date"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    if (e.target.value) navigate(e.target.value)
                  }}
                />
              </label>
              <button
                className="icon-button bordered"
                aria-label="Next day"
                onClick={() => navigate(addDays(date, 1))}
              >
                <ChevronRight size={20} />
              </button>
              {!isToday && (
                <button
                  className="button today-link"
                  onClick={() => navigate(null)}
                >
                  Today
                </button>
              )}
            </div>
          ) : (
            <button
              className="button primary"
              onClick={() => open({ type: 'add' })}
            >
              <Plus size={18} />
              New task
            </button>
          )}
        </div>

        <section
          className={`active-panel ${activeTask ? 'is-running' : 'is-idle'}`}
          aria-label="Active timer"
        >
          <div className="active-description">
            <div className="eyebrow">
              {activeTask ? (
                <>
                  <span className="running-dot" />
                  RUNNING
                </>
              ) : (
                <>
                  <Pause size={13} />
                  READY WHEN YOU ARE
                </>
              )}
            </div>
            <h2>{activeTask?.name ?? 'A little time, well spent.'}</h2>
            <p>
              {active ? (
                <>
                  Current session{' '}
                  <span className="mono">
                    {formatDuration(duration(active, now))}
                  </span>
                </>
              ) : (
                'Choose a task below and make a start.'
              )}
            </p>
          </div>
          <div className="active-total">
            <span className="big-time">
              {activeTask
                ? formatDuration(totalFor(activeTask.id, true).ms)
                : '00:00:00'}
            </span>
            <span className="eyebrow">
              {activeTask ? 'TOTAL TODAY' : 'ONE TASK AT A TIME'}
            </span>
          </div>
          {active ? (
            <button
              className="button stop-button"
              disabled={busy}
              onClick={() => void stopTimer()}
            >
              <Square size={17} fill="currentColor" />
              {pendingStop?.id === active.id ? 'Retry stop' : 'Stop timer'}
            </button>
          ) : (
            <button
              className="button stop-button"
              onClick={() => {
                if (view === 'library' || !isToday) navigate(null)
                if (!dayTasks.length || !isToday) open({ type: 'add' })
                else
                  document
                    .getElementById('task-list')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
            >
              <Play size={18} />
              {dayTasks.length && isToday ? 'Choose a task' : 'Add a task'}
            </button>
          )}
        </section>

        {recoveryId && active?.id === recoveryId && active.kind === 'timed' && (
          <section className="notice recovery">
            <div>
              <strong>Your timer is still running.</strong>
              <p>
                Started {friendlyTime(active.startedAt, zone)}. Time while away
                is included.
              </p>
            </div>
            <div className="inline-actions">
              <button className="button" onClick={() => setRecoveryId(null)}>
                Continue
              </button>
              <button
                className="text-button"
                onClick={() =>
                  open({ type: 'entry', taskId: active.taskId, entry: active })
                }
              >
                Correct end time
              </button>
            </div>
          </section>
        )}
        {clockError && (
          <div className="error-banner" role="alert">
            Your clock is earlier than this session's start. Check your device
            clock, then correct the session end time in task details.
          </div>
        )}
        {pendingStop && pendingStop.id === active?.id && (
          <div className="error-banner" role="alert">
            Stop has not been saved. The requested stop time is kept while this
            page stays open. Use Retry stop.
          </div>
        )}
        {error && !modal && (
          <div className="error-banner" role="alert">
            {error}
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError('')}
            >
              <X size={18} />
            </button>
          </div>
        )}
        {backupDue && (
          <div className="notice backup-reminder">
            <span>
              It’s been a while. Keep a fresh copy of your time history.
            </span>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void run(exportBackup, 'Backup download started.')}
            >
              <Database size={17} />
              Back up data
            </button>
          </div>
        )}

        {view === 'day' ? (
          <>
            <div className="section-heading">
              <div>
                <h2>{isToday ? "Today's tasks" : 'Tasks for this day'}</h2>
                <span className="muted">
                  {dayTasks.length} {dayTasks.length === 1 ? 'task' : 'tasks'}
                </span>
              </div>
              <button
                className="button primary"
                onClick={() => open({ type: 'add' })}
              >
                <Plus size={19} />
                <span>Add task</span>
              </button>
            </div>
            {dayTasks.length ? (
              <div
                className="task-table"
                id="task-list"
                role="table"
                aria-label="Daily tasks"
              >
                <div className="table-heading" role="row">
                  <span role="columnheader">Task</span>
                  <span role="columnheader">
                    {isToday ? 'Time today' : 'Time this day'}
                  </span>
                  <span role="columnheader">Status</span>
                  <span role="columnheader">Action</span>
                </div>
                {dayTasks.map((task) => {
                  const total = totalFor(task.id)
                  const running = active?.taskId === task.id && isToday
                  const done = days.get(task.id)?.status === 'done' && !running
                  return (
                    <div
                      key={task.id}
                      className={`task-row ${running ? 'running-row' : ''}`}
                      role="row"
                    >
                      <div className="task-cell" role="cell">
                        <label className="selection-hit">
                          <input
                            type="checkbox"
                            aria-label={`Select ${task.name} for copying`}
                            checked={selected.includes(task.id)}
                            onChange={(e) =>
                              setSelected((prev) =>
                                e.target.checked
                                  ? [...prev, task.id]
                                  : prev.filter((id) => id !== task.id),
                              )
                            }
                          />
                        </label>
                        <span className={`row-dot ${running ? 'lit' : ''}`} />
                        <button
                          className="task-name"
                          onClick={() =>
                            open({ type: 'task', taskId: task.id })
                          }
                        >
                          <strong>{task.name}</strong>
                          <span>
                            {task.archivedAt ? 'Archived · ' : ''}
                            {total.count
                              ? `${total.count} ${total.count === 1 ? 'entry' : 'entries'}`
                              : 'Ready to begin'}
                          </span>
                        </button>
                      </div>
                      <span className="task-time mono" role="cell">
                        {formatDuration(total.ms)}
                      </span>
                      <span className="task-status" role="cell">
                        <span
                          className={`status ${running ? 'running' : done ? 'done' : total.ms ? 'paused' : 'ready'}`}
                        >
                          {done && <Check size={16} />}
                          {running
                            ? 'Running'
                            : done
                              ? 'Done'
                              : total.ms
                                ? 'Paused'
                                : 'Ready'}
                        </span>
                      </span>
                      <div className="task-actions" role="cell">
                        {isToday && !task.archivedAt ? (
                          <button
                            className="button row-button"
                            disabled={busy}
                            aria-label={`${running ? 'Stop' : total.ms ? 'Resume' : 'Start'} ${task.name}`}
                            onClick={() =>
                              running
                                ? void stopTimer()
                                : void run(
                                    () => repository.start(task.id),
                                    `${task.name} is running.`,
                                  )
                            }
                          >
                            {running ? (
                              <Square size={14} fill="currentColor" />
                            ) : (
                              <Play size={16} />
                            )}
                            {running ? 'Stop' : total.ms ? 'Resume' : 'Start'}
                          </button>
                        ) : (
                          <button
                            className="button row-button"
                            onClick={() =>
                              open({ type: 'task', taskId: task.id })
                            }
                          >
                            Details
                          </button>
                        )}
                        <button
                          className="icon-button"
                          aria-label={`Options for ${task.name}`}
                          onClick={() =>
                            open({ type: 'task', taskId: task.id })
                          }
                        >
                          <EllipsisVertical size={20} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <section className="empty-state" id="task-list">
                <span className="empty-icon">
                  <Timer size={29} />
                </span>
                <h3>
                  {date > today
                    ? 'Make room for tomorrow.'
                    : 'What will you spend time on?'}
                </h3>
                <p>
                  Add a task, bring back your favorites, or pick up where
                  yesterday left off.
                </p>
                <button
                  className="button primary"
                  onClick={() => open({ type: 'add' })}
                >
                  <Plus size={17} />
                  Add your first task
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const yesterday = addDays(date, -1)
                      const priorTotals = summarize(data, yesterday, zone)
                      const ids = data.tasks
                        .filter(
                          (t) =>
                            !t.archivedAt &&
                            (data.days.some(
                              (d) => d.date === yesterday && d.taskId === t.id,
                            ) ||
                              priorTotals.has(t.id)),
                        )
                        .map((t) => t.id)
                      if (!ids.length)
                        throw new Error(
                          'No tasks on the previous day yet. Add a new task or choose one from your library.',
                        )
                      await repository.addTasks(ids, date)
                    }, 'Previous day’s tasks added.')
                  }
                >
                  <Copy size={16} />
                  Copy from {isToday ? 'yesterday' : 'previous day'}
                </button>
              </section>
            )}
            <div className="daily-actions">
              <button
                className="text-button"
                disabled={busy || !favorites.length}
                title={
                  !favorites.length
                    ? 'Favorite a task in the library to add it here'
                    : undefined
                }
                onClick={() =>
                  void run(
                    () =>
                      repository.addTasks(
                        favorites.map((t) => t.id),
                        date,
                      ),
                    'Favorites added. Existing tasks kept unchanged.',
                  )
                }
              >
                <Star size={20} />
                Add favorites
              </button>
              <button
                className="text-button"
                disabled={!selected.length || busy}
                onClick={copySelected}
              >
                <Copy size={19} />
                Copy{' '}
                {selected.length
                  ? `${selected.length} selected`
                  : 'selected'}{' '}
                to tomorrow
              </button>
            </div>
            <p className="daily-hint">Keep your tasks. Start fresh each day.</p>
          </>
        ) : (
          <>
            <div className="library-toolbar">
              <label className="search-field">
                <Search size={18} />
                <input
                  aria-label="Search tasks"
                  placeholder="Find a task…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button
                className={`button ${showArchived ? 'toggled' : ''}`}
                aria-pressed={showArchived}
                onClick={() => setShowArchived(!showArchived)}
              >
                <Archive size={17} />
                {showArchived ? 'Archived' : 'Show archived'}
              </button>
            </div>
            <div className="library-list">
              {visibleLibrary.map((task) => (
                <article className="library-row" key={task.id}>
                  <button
                    className={`icon-button favorite-button ${task.favorite ? 'favorited' : ''}`}
                    aria-label={`${task.favorite ? 'Unfavorite' : 'Favorite'} ${task.name}`}
                    aria-pressed={task.favorite}
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        repository.updateTask(task.id, {
                          ...task,
                          favorite: !task.favorite,
                        }),
                      )
                    }
                  >
                    <Star
                      size={20}
                      fill={task.favorite ? 'currentColor' : 'none'}
                    />
                  </button>
                  <button
                    className="task-name"
                    onClick={() => open({ type: 'task', taskId: task.id })}
                  >
                    <strong>{task.name}</strong>
                    <span>
                      {task.description ||
                        `${formatDuration((lifetime.get(task.id) ?? 0) + (active?.taskId === task.id ? duration(active, now) : 0))} all time`}
                    </span>
                  </button>
                  <div className="inline-actions">
                    {!task.archivedAt && (
                      <button
                        className="button"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await run(
                              () => repository.addTasks([task.id], today),
                              'Task added to today.',
                            )
                          )
                            navigate(null)
                        }}
                      >
                        <Plus size={16} />
                        <span>Add to today</span>
                      </button>
                    )}
                    <button
                      className="icon-button"
                      aria-label={`Edit ${task.name}`}
                      onClick={() =>
                        open({ type: 'edit-task', taskId: task.id })
                      }
                    >
                      <Edit3 size={18} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {!visibleLibrary.length && (
              <section className="empty-state">
                <Star size={29} />
                <h3>
                  {showArchived
                    ? 'No archived tasks.'
                    : search
                      ? 'No matching tasks.'
                      : 'Build your everyday library.'}
                </h3>
                <p>
                  {showArchived
                    ? 'Archived tasks keep their history safe.'
                    : 'Create a task and favorite it to bring it back in a click.'}
                </p>
              </section>
            )}
          </>
        )}
        <footer className="workspace-footer">
          <span>
            <span className="saved-dot" />
            Saved on this device
          </span>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void run(exportBackup, 'Backup download started.')}
          >
            <Database size={17} />
            Back up data
          </button>
        </footer>
      </main>
      <div className="toast-region" role="status" aria-live="polite">
        {notice && (
          <div className="toast">
            <CheckCheck size={18} />
            {notice}
          </div>
        )}
      </div>

      {modal?.type === 'add' && (
        <AddTaskDialog
          tasks={data.tasks}
          date={view === 'library' ? today : date}
          busy={busy}
          run={run}
          onClose={close}
        />
      )}
      {modal?.type === 'settings' && (
        <SettingsDialog
          data={data}
          busy={busy}
          run={run}
          onClose={close}
          onRestore={() => {
            navigate(null)
            setRecoveryId(null)
            setPendingStop(null)
          }}
        />
      )}
      {modal?.type === 'copy' && (
        <Dialog title="A fresh start" onClose={close} busy={busy}>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault()
              const ids = dayTasks
                .filter((t) => selected.includes(t.id))
                .map((t) => t.id)
              if (
                await run(
                  () => repository.addTasks(ids, copyDate),
                  'Tasks copied. Time and completion status stay on the original day.',
                )
              ) {
                setSelected([])
                close()
              }
            }}
          >
            <p>
              Copy {selected.length} selected{' '}
              {selected.length === 1 ? 'task' : 'tasks'} to another day. Start
              with zero time; keep the same task history.
            </p>
            <ul className="copy-list">
              {dayTasks
                .filter((t) => selected.includes(t.id))
                .map((t) => (
                  <li key={t.id}>
                    <Check size={16} />
                    {t.name}
                    {t.archivedAt && (
                      <span className="muted"> (archived; skipped)</span>
                    )}
                  </li>
                ))}
            </ul>
            <label>
              Destination date
              <input
                autoFocus
                type="date"
                required
                value={copyDate}
                onChange={(e) => setCopyDate(e.target.value)}
              />
            </label>
            <p className="muted small">
              Tasks already on that date are kept unchanged.
            </p>
            <footer className="dialog-actions">
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={close}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy || !copyDate}>
                <Copy size={17} />
                Copy tasks
              </button>
            </footer>
          </form>
        </Dialog>
      )}
      {modal?.type === 'edit-task' && modalTask && (
        <EditTaskDialog
          key={modalTask.id}
          task={modalTask}
          active={active?.taskId === modalTask.id}
          busy={busy}
          run={run}
          onClose={close}
          onDelete={() => open({ type: 'delete-task', taskId: modalTask.id })}
        />
      )}
      {modal?.type === 'delete-task' && modalTask && (
        <DeleteTaskDialog
          task={modalTask}
          entries={data.entries.filter(
            (entry) => entry.taskId === modalTask.id,
          )}
          dayCount={
            data.days.filter((day) => day.taskId === modalTask.id).length
          }
          active={active?.taskId === modalTask.id}
          busy={busy}
          run={run}
          onClose={() => open({ type: 'task', taskId: modalTask.id })}
          onDeleted={() => {
            setSelected((ids) => ids.filter((id) => id !== modalTask.id))
            close()
          }}
        />
      )}
      {modal?.type === 'entry' && modalTask && (
        <TimeEntryForm
          key={modal.entry?.id ?? 'new'}
          task={modalTask}
          entry={modal.entry}
          date={date > today ? today : date}
          today={today}
          zone={zone}
          busy={busy}
          run={run}
          onClose={() => open({ type: 'task', taskId: modalTask.id })}
        />
      )}
      {modal?.type === 'task' && modalTask && (
        <Dialog title={modalTask.name} wide busy={busy} onClose={close}>
          {modalTask.description && (
            <p className="task-description">{modalTask.description}</p>
          )}
          <div className="detail-totals">
            <div>
              <span>
                {isToday
                  ? 'Total today'
                  : friendlyDate(date, { weekday: undefined, year: undefined })}
              </span>
              <strong className="mono">
                {formatDuration(totalFor(modalTask.id).ms)}
              </strong>
            </div>
            <div>
              <span>All time</span>
              <strong className="mono">
                {formatDuration(
                  (lifetime.get(modalTask.id) ?? 0) +
                    (active?.taskId === modalTask.id
                      ? duration(active, now)
                      : 0),
                )}
              </strong>
            </div>
          </div>
          <div className="detail-actions">
            <button
              className="button"
              disabled={busy || date > today}
              onClick={() => open({ type: 'entry', taskId: modalTask.id })}
            >
              <Plus size={16} />
              Add time
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    repository.setStatus(
                      modalTask.id,
                      date,
                      days.get(modalTask.id)?.status === 'done'
                        ? 'open'
                        : 'done',
                    ),
                  days.get(modalTask.id)?.status === 'done'
                    ? 'Task reopened.'
                    : 'Task marked done.',
                )
              }
            >
              <Check size={16} />
              {days.get(modalTask.id)?.status === 'done'
                ? 'Reopen for this day'
                : 'Mark done'}
            </button>
            <button
              className="button"
              onClick={() => open({ type: 'edit-task', taskId: modalTask.id })}
            >
              <Edit3 size={16} />
              Edit task
            </button>
            <button
              className="button danger-text"
              disabled={busy}
              onClick={() =>
                open({ type: 'delete-task', taskId: modalTask.id })
              }
            >
              <Trash2 size={16} />
              Delete task…
            </button>
          </div>
          <h3 className="entries-heading">
            Time entries{' '}
            <span className="muted">
              · {friendlyDate(date, { weekday: undefined, year: undefined })}
            </span>
          </h3>
          {!taskEntries.length && (
            <p className="empty-small">No time recorded for this day yet.</p>
          )}
          <div className="entry-list">
            {taskEntries.map((entry) => (
              <article className="entry-row" key={entry.id}>
                <Clock3 size={18} />
                <div className="entry-info">
                  <strong className="mono">
                    {formatDuration(duration(entry, now))}
                  </strong>
                  <p>
                    {entry.kind === 'manual'
                      ? `Manually added · ${entry.date}`
                      : `${friendlyTime(entry.startedAt, zone)} → ${entry.endedAt === null ? 'Running' : friendlyTime(entry.endedAt, zone)}`}
                  </p>
                  {entry.kind === 'timed' &&
                    duration(entry, now) !==
                      timeOnDay(entry, date, bounds, now) && (
                      <p>
                        {formatDuration(timeOnDay(entry, date, bounds, now))}{' '}
                        falls on this day
                      </p>
                    )}
                  {entry.note && <p className="entry-note">{entry.note}</p>}
                </div>
                <div className="inline-actions">
                  <button
                    className="icon-button"
                    aria-label={
                      entry.kind === 'timed' && entry.endedAt === null
                        ? 'Correct session end time'
                        : 'Edit time entry'
                    }
                    onClick={() =>
                      open({ type: 'entry', taskId: modalTask.id, entry })
                    }
                  >
                    <Edit3 size={17} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={entry.id === active?.id || busy}
                    aria-label="Delete time entry"
                    onClick={() => open({ type: 'delete', entry })}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <footer className="dialog-actions split">
            <button
              className="text-button danger-text"
              disabled={busy || taskEntries.length > 0}
              onClick={async () => {
                if (
                  await run(
                    () => repository.removeDay(modalTask.id, date),
                    'Task removed from this day. Library task kept.',
                  )
                )
                  close()
              }}
            >
              Remove from this day
            </button>
            <button className="button" onClick={close}>
              Done
            </button>
          </footer>
        </Dialog>
      )}
      {modal?.type === 'delete' && (
        <Dialog
          title="Delete this time entry?"
          busy={busy}
          onClose={() => open({ type: 'task', taskId: modal.entry.taskId })}
        >
          <div className="form-stack">
            <p>
              This removes{' '}
              <strong className="mono">
                {formatDuration(duration(modal.entry, now))}
              </strong>{' '}
              from <strong>{taskMap.get(modal.entry.taskId)?.name}</strong>.
            </p>
            <p className="muted">
              {modal.entry.kind === 'manual'
                ? modal.entry.date
                : friendlyTime(modal.entry.startedAt, zone)}
              . Totals will be recalculated. This cannot be undone.
            </p>
            <footer className="dialog-actions">
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  open({ type: 'task', taskId: modal.entry.taskId })
                }
              >
                Keep entry
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    await run(
                      () => repository.deleteEntry(modal.entry.id),
                      'Time entry deleted.',
                    )
                  )
                    open({ type: 'task', taskId: modal.entry.taskId })
                }}
              >
                <Trash2 size={16} />
                Delete entry
              </button>
            </footer>
          </div>
        </Dialog>
      )}
    </OperationError.Provider>
  )
}
