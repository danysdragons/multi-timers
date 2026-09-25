import { useState, type FormEvent } from 'react'
import { Archive, Plus, Star, Trash2 } from 'lucide-react'
import type { Task } from '../model'
import { repository } from '../db'
import { Dialog } from './Dialog'

export type Run = (
  action: () => Promise<unknown>,
  message?: string,
) => Promise<boolean>
type Common = { busy: boolean; run: Run; onClose: () => void }

export function AddTaskDialog({
  tasks,
  date,
  busy,
  run,
  onClose,
}: Common & { tasks: Task[]; date: string }) {
  const [tab, setTab] = useState<'new' | 'existing'>('new')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [favorite, setFavorite] = useState(false)
  const [separate, setSeparate] = useState(false)
  const [chosen, setChosen] = useState<string[]>([])
  const matches = tasks.filter(
    (t) => t.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
  )
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (
      await run(
        () =>
          repository.createTask(name, description, favorite, date, separate),
        'Task added.',
      )
    )
      onClose()
  }
  return (
    <Dialog title="Add a task" onClose={onClose} busy={busy}>
      <div className="segmented">
        <button
          className={tab === 'new' ? 'selected' : ''}
          onClick={() => setTab('new')}
        >
          Create new
        </button>
        <button
          className={tab === 'existing' ? 'selected' : ''}
          onClick={() => setTab('existing')}
        >
          From library
        </button>
      </div>
      {tab === 'new' ? (
        <form onSubmit={submit} className="form-stack">
          <label>
            Task name
            <input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setSeparate(false)
              }}
              required
              maxLength={120}
              placeholder="e.g. Study X"
            />
          </label>
          <label>
            Description <span className="optional">optional</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="What are you working on?"
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
            />
            <Star size={17} />
            Save as a favorite for easy daily reuse
          </label>
          {matches.length > 0 && (
            <div className="notice">
              <p>A task with this name already exists.</p>
              {matches
                .filter((t) => !t.archivedAt)
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="text-button"
                    onClick={async () => {
                      if (
                        await run(
                          () => repository.addTasks([t.id], date),
                          'Existing task added.',
                        )
                      )
                        onClose()
                    }}
                  >
                    Use existing “{t.name}”
                  </button>
                ))}
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={separate}
                  onChange={(e) => setSeparate(e.target.checked)}
                />
                Create a separate task anyway
              </label>
            </div>
          )}
          <footer className="dialog-actions">
            <button
              type="button"
              className="button"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={
                busy || !name.trim() || (matches.length > 0 && !separate)
              }
            >
              <Plus size={17} />
              Create task
            </button>
          </footer>
        </form>
      ) : (
        <div className="form-stack">
          <p className="muted">
            Reuse a task to keep its history connected across days.
          </p>
          <div className="picker-list">
            {tasks
              .filter((t) => !t.archivedAt)
              .map((t) => (
                <label className="check-label picker-item" key={t.id}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(t.id)}
                    onChange={(e) =>
                      setChosen((prev) =>
                        e.target.checked
                          ? [...prev, t.id]
                          : prev.filter((id) => id !== t.id),
                      )
                    }
                  />
                  <span>{t.name}</span>
                  {t.favorite && <Star size={16} />}
                </label>
              ))}
          </div>
          {!tasks.some((t) => !t.archivedAt) && (
            <p className="empty-small">
              Your library is empty. Create your first task.
            </p>
          )}
          <footer className="dialog-actions">
            <button
              className="button primary"
              disabled={busy || !chosen.length}
              onClick={async () => {
                if (
                  await run(
                    () => repository.addTasks(chosen, date),
                    'Tasks added.',
                  )
                )
                  onClose()
              }}
            >
              Add {chosen.length || ''} {chosen.length === 1 ? 'task' : 'tasks'}
            </button>
          </footer>
        </div>
      )}
    </Dialog>
  )
}

export function EditTaskDialog({
  task,
  active,
  busy,
  run,
  onClose,
  onDelete,
}: Common & { task: Task; active: boolean; onDelete: () => void }) {
  const [name, setName] = useState(task.name)
  const [description, setDescription] = useState(task.description)
  const [favorite, setFavorite] = useState(task.favorite)
  async function save(e: FormEvent) {
    e.preventDefault()
    if (
      await run(
        () =>
          repository.updateTask(task.id, {
            name,
            description,
            favorite,
            archivedAt: task.archivedAt,
          }),
        'Task updated.',
      )
    )
      onClose()
  }
  return (
    <Dialog title="Edit task" busy={busy} onClose={onClose}>
      <form className="form-stack" onSubmit={save}>
        <label>
          Task name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={favorite}
            onChange={(e) => setFavorite(e.target.checked)}
          />
          Favorite
        </label>
        <p className="muted small">
          Renaming updates this task across all days. Your recorded time stays
          intact.
        </p>
        <footer className="dialog-actions split">
          <button
            type="button"
            className="text-button"
            disabled={busy || active}
            title={active ? 'Stop this timer before archiving' : undefined}
            onClick={async () => {
              if (
                await run(
                  () =>
                    repository.updateTask(task.id, {
                      name: task.name,
                      description: task.description,
                      favorite: task.favorite,
                      archivedAt: task.archivedAt ? null : Date.now(),
                    }),
                  task.archivedAt ? 'Task restored.' : 'Task archived.',
                )
              )
                onClose()
            }}
          >
            <Archive size={17} />
            {task.archivedAt ? 'Restore task' : 'Archive task'}
          </button>
          <button className="button primary" disabled={busy || !name.trim()}>
            Save changes
          </button>
        </footer>
        {active && (
          <p className="muted small">Stop this timer to archive the task.</p>
        )}
        <button
          type="button"
          className="text-button danger-text delete-task-link"
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 size={17} />
          Delete task…
        </button>
      </form>
    </Dialog>
  )
}
