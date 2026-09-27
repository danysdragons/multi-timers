import { useMemo, useState, type FormEvent } from 'react'
import {
  Archive,
  Check,
  Edit3,
  Leaf,
  Plus,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react'
import {
  intakeCategories,
  type Data,
  type IntakeItem,
  type IntakeEntry,
  type IntakeItemValues,
} from '../model'
import { repository } from '../db'
import {
  dayBounds,
  editTimestamp,
  friendlyTime,
  parseIntakeTime,
} from '../time'
import { Dialog } from './Dialog'
import type { Run } from './TaskForms'

type IntakeModal =
  | { kind: 'item'; item?: IntakeItem }
  | { kind: 'log'; item: IntakeItem; entry?: IntakeEntry }
  | { kind: 'delete'; entry: IntakeEntry }
type Shared = { busy: boolean; run: Run; onClose: () => void }

export function IntakeView({
  data,
  date,
  today,
  zone,
  busy,
  run,
  clearError,
}: {
  data: Data
  date: string
  today: string
  zone: string
  busy: boolean
  run: Run
  clearError: () => void
}) {
  const [modal, setModal] = useState<IntakeModal | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All categories')
  const [archived, setArchived] = useState(false)
  const [undo, setUndo] = useState<IntakeEntry | null>(null)
  const itemMap = useMemo(
    () => new Map(data.intakeItems.map((item) => [item.id, item])),
    [data.intakeItems],
  )
  const latest = useMemo(() => {
    const result = new Map<string, IntakeEntry>()
    for (const entry of data.intakeEntries) {
      if (entry.takenAt > (result.get(entry.itemId)?.takenAt ?? -1))
        result.set(entry.itemId, entry)
    }
    return result
  }, [data.intakeEntries])
  const entries = useMemo(() => {
    const [start, end] = dayBounds(date, zone)
    return data.intakeEntries
      .filter((e) => e.takenAt >= start && e.takenAt < end)
      .sort((a, b) => b.takenAt - a.takenAt || b.createdAt - a.createdAt)
  }, [data.intakeEntries, date, zone])
  const items = data.intakeItems
    .filter(
      (i) =>
        !!i.archivedAt === archived &&
        (category === 'All categories' || i.category === category) &&
        i.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
  function open(value: IntakeModal) {
    clearError()
    setModal(value)
  }
  function close() {
    clearError()
    setModal(null)
  }
  const undoCurrent =
    undo &&
    data.intakeEntries.find(
      (e) => e.id === undo.id && e.updatedAt === undo.updatedAt,
    )
  return (
    <section aria-label="Intake workspace">
      <div className="intake-intro">
        <div className="intake-intro-icon">
          <Leaf size={25} />
        </div>
        <div>
          <h2>A little context for your day.</h2>
          <p>
            Record what you take, how much, and when. Add a note for anything
            worth remembering.
          </p>
        </div>
      </div>
      {undoCurrent && (
        <div className="notice intake-undo" role="status">
          <span>
            <Check size={17} /> Logged {undoCurrent.name} ·{' '}
            {undoCurrent.quantity} {undoCurrent.unit}
          </span>
          <button
            className="text-button"
            disabled={busy}
            onClick={async () => {
              if (
                await run(
                  () => repository.deleteIntakeEntry(undoCurrent),
                  'Intake entry undone.',
                )
              )
                setUndo(null)
            }}
          >
            <Undo2 size={17} /> Undo last log
          </button>
        </div>
      )}
      <div className="intake-layout">
        <section className="intake-library" aria-label="Intake item library">
          <div className="section-heading">
            <div>
              <h2>Your items</h2>
              <span className="muted">{items.length}</span>
            </div>
            <button
              className="button primary"
              onClick={() => open({ kind: 'item' })}
            >
              <Plus size={17} /> New item
            </button>
          </div>
          <div className="intake-filters">
            <label className="search-field">
              <Search size={17} />
              <input
                aria-label="Search intake items"
                placeholder="Find an item…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="intake-filter-row">
              <select
                aria-label="Intake category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option>All categories</option>
                {intakeCategories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <button
                className={`icon-button bordered ${archived ? 'toggled' : ''}`}
                title="Show archived intake items"
                aria-label="Show archived intake items"
                aria-pressed={archived}
                onClick={() => setArchived(!archived)}
              >
                <Archive size={18} />
              </button>
            </div>
          </div>
          <div className="intake-items">
            {items.map((item) => {
              const last = latest.get(item.id)
              return (
                <article className="intake-item" key={item.id}>
                  <div className="intake-item-heading">
                    <div>
                      <span className="intake-category">{item.category}</span>
                      <h3>{item.name}</h3>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Edit intake item ${item.name}`}
                      onClick={() => open({ kind: 'item', item })}
                    >
                      <Edit3 size={17} />
                    </button>
                  </div>
                  <p className="intake-default">
                    Usual:{' '}
                    <strong>
                      {item.quantity} {item.unit}
                    </strong>
                    {item.strength && <span> · {item.strength}</span>}
                  </p>
                  <p className="intake-last">
                    {last
                      ? `Last recorded: ${friendlyTime(last.takenAt, zone)} · ${last.quantity} ${last.unit}`
                      : 'Nothing recorded yet'}
                  </p>
                  {!archived && (
                    <button
                      className="button intake-log-button"
                      aria-label={`Log ${item.name}`}
                      disabled={busy || date > today}
                      onClick={() => open({ kind: 'log', item })}
                    >
                      <Plus size={16} /> Log intake
                    </button>
                  )}
                  {archived && (
                    <span className="muted small">Archived · history kept</span>
                  )}
                </article>
              )
            })}
          </div>
          {!items.length && (
            <div className="intake-empty">
              <Leaf size={24} />
              <h3>
                {data.intakeItems.length
                  ? 'No matching items'
                  : 'Start with something familiar'}
              </h3>
              <p>
                {data.intakeItems.length
                  ? 'Try another filter or create an item.'
                  : 'Add a supplement, medication, coffee, or anything else you want to record.'}
              </p>
            </div>
          )}
        </section>
        <section className="intake-history" aria-label="Intake history">
          <div className="section-heading">
            <div>
              <h2>
                {date === today ? 'Today’s intake' : 'Intake for this day'}
              </h2>
              <span className="muted">
                {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>
          </div>
          <p className="muted small intake-zone">Latest first · {zone}</p>
          {date > today && (
            <p className="notice">
              Choose today or an earlier day to log intake.
            </p>
          )}
          {!entries.length ? (
            <div className="intake-empty">
              <h3>
                No intake recorded{date === today ? ' today' : ' on this day'}
              </h3>
              <p>
                Choose an item to log a quantity and time. Your usual amount is
                just a starting point.
              </p>
            </div>
          ) : (
            <ol className="intake-timeline">
              {entries.map((entry) => {
                const item = itemMap.get(entry.itemId)
                return (
                  <li key={entry.id} className="intake-event">
                    <time dateTime={new Date(entry.takenAt).toISOString()}>
                      {new Intl.DateTimeFormat('en', {
                        timeZone: zone,
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZoneName: 'short',
                      }).format(entry.takenAt)}
                    </time>
                    <div className="intake-event-body">
                      <span className="intake-category">{entry.category}</span>
                      <h3>{entry.name}</h3>
                      <p className="intake-amount">
                        {entry.quantity} {entry.unit}
                      </p>
                      {entry.strength && (
                        <p className="muted small">{entry.strength}</p>
                      )}
                      {entry.note && (
                        <p className="intake-note">{entry.note}</p>
                      )}
                    </div>
                    <div className="inline-actions">
                      <button
                        className="icon-button"
                        aria-label={`Edit intake entry ${entry.name}`}
                        disabled={!item || busy}
                        onClick={() =>
                          item && open({ kind: 'log', item, entry })
                        }
                      >
                        <Edit3 size={17} />
                      </button>
                      <button
                        className="icon-button danger-text"
                        aria-label={`Delete intake entry ${entry.name}`}
                        disabled={busy}
                        onClick={() => open({ kind: 'delete', entry })}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>
      {modal?.kind === 'item' && (
        <IntakeItemForm
          key={modal.item?.id ?? 'new'}
          item={modal.item}
          busy={busy}
          run={run}
          onClose={close}
        />
      )}
      {modal?.kind === 'log' && (
        <IntakeLogForm
          key={modal.entry?.id ?? modal.item.id}
          item={modal.item}
          entry={modal.entry}
          date={date}
          today={today}
          zone={zone}
          busy={busy}
          run={run}
          onClose={close}
          onLogged={setUndo}
        />
      )}
      {modal?.kind === 'delete' && (
        <Dialog title="Delete intake entry?" busy={busy} onClose={close}>
          <div className="form-stack">
            <p>
              Delete{' '}
              <strong>
                {modal.entry.quantity} {modal.entry.unit} of {modal.entry.name}
              </strong>
              , recorded {friendlyTime(modal.entry.takenAt, zone)}?
            </p>
            <p className="muted small">
              This removes this entry only. The item and its other history stay
              in your library.
            </p>
            <footer className="dialog-actions">
              <button className="button" disabled={busy} onClick={close}>
                Cancel
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    await run(
                      () => repository.deleteIntakeEntry(modal.entry),
                      'Intake entry deleted.',
                    )
                  )
                    close()
                }}
              >
                Delete entry
              </button>
            </footer>
          </div>
        </Dialog>
      )}
    </section>
  )
}

function IntakeItemForm({
  item,
  busy,
  run,
  onClose,
}: Shared & { item?: IntakeItem }) {
  const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState<IntakeItem['category']>(
    item?.category ?? 'Supplement',
  )
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1))
  const [unit, setUnit] = useState(item?.unit ?? '')
  const [strength, setStrength] = useState(item?.strength ?? '')
  async function submit(e: FormEvent) {
    e.preventDefault()
    const values: IntakeItemValues = {
      name,
      category,
      quantity: Number(quantity),
      unit,
      strength,
    }
    if (
      await run(
        () => repository.saveIntakeItem(values, item),
        'Intake item saved.',
      )
    )
      onClose()
  }
  return (
    <Dialog
      title={item ? 'Edit intake item' : 'New intake item'}
      busy={busy}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <label>
          Name
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Morning coffee"
          />
        </label>
        <label>
          Category
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as IntakeItem['category'])
            }
          >
            {intakeCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="intake-form-row">
          <label>
            Usual quantity
            <input
              type="number"
              inputMode="decimal"
              min="0.000001"
              step="any"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label>
            Unit
            <input
              required
              maxLength={40}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="capsule, mg, cup, mL…"
              list="intake-units"
            />
          </label>
        </div>
        <Units />
        <label>
          Strength or concentration <span className="optional">(optional)</span>
          <input
            maxLength={160}
            value={strength}
            onChange={(e) => setStrength(e.target.value)}
            placeholder="e.g. 200 mg per capsule"
          />
        </label>
        <p className="muted small">
          Your usual quantity prefills each log and can always be changed.
          Strength describes the product; it does not convert the quantity.
          Changes here leave earlier entries as recorded.
        </p>
        <footer className="dialog-actions split">
          {item && (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={async () => {
                if (
                  await run(
                    () => repository.archiveIntakeItem(item, !item.archivedAt),
                    item.archivedAt
                      ? 'Item restored.'
                      : 'Item archived. History kept.',
                  )
                )
                  onClose()
              }}
            >
              <Archive size={17} />
              {item.archivedAt ? 'Restore item' : 'Archive item'}
            </button>
          )}
          <button className="button primary" disabled={busy}>
            Save item
          </button>
        </footer>
      </form>
    </Dialog>
  )
}
function Units() {
  return (
    <datalist id="intake-units">
      {[
        'tablet',
        'capsule',
        'mg',
        'g',
        'mL',
        'cup',
        'serving',
        'drop',
        'piece',
        'IU',
        'mcg',
      ].map((unit) => (
        <option key={unit} value={unit} />
      ))}
    </datalist>
  )
}
function IntakeLogForm({
  item,
  entry,
  date,
  today,
  zone,
  busy,
  run,
  onClose,
  onLogged,
}: Shared & {
  item: IntakeItem
  entry?: IntakeEntry
  date: string
  today: string
  zone: string
  onLogged: (entry: IntakeEntry) => void
}) {
  const [quantity, setQuantity] = useState(
    String(entry?.quantity ?? item.quantity),
  )
  const [unit, setUnit] = useState(entry?.unit ?? item.unit)
  const [strength, setStrength] = useState(entry?.strength ?? item.strength)
  const [note, setNote] = useState(entry?.note ?? '')
  const [useNow, setUseNow] = useState(!entry && date === today)
  const [initialTime] = useState(() =>
    entry
      ? editTimestamp(entry.takenAt, zone).slice(0, 19)
      : date === today
        ? editTimestamp(Date.now(), zone).slice(0, 19)
        : `${date}T12:00:00`,
  )
  const [time, setTime] = useState(initialTime)
  const [occurrence, setOccurrence] = useState<'reject' | 'earlier' | 'later'>(
    'reject',
  )
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (
      await run(
        async () => {
          const takenAt = useNow
            ? Date.now()
            : entry && time === initialTime && occurrence === 'reject'
              ? entry.takenAt
              : parseIntakeTime(time, zone, occurrence)
          const saved = await repository.saveIntakeEntry(
            item.id,
            { quantity: Number(quantity), unit, strength, note, takenAt },
            entry,
          )
          if (!entry) onLogged(saved)
        },
        entry ? 'Intake entry updated.' : 'Intake recorded.',
      )
    )
      onClose()
  }
  return (
    <Dialog
      title={entry ? 'Edit intake entry' : 'Log intake'}
      busy={busy}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <p className="form-task-name">{entry?.name ?? item.name}</p>
        <div className="intake-form-row">
          <label>
            Quantity
            <input
              type="number"
              inputMode="decimal"
              min="0.000001"
              step="any"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label>
            Unit
            <input
              required
              maxLength={40}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              list="intake-units"
            />
          </label>
        </div>
        <Units />
        <label>
          Strength or concentration <span className="optional">(optional)</span>
          <input
            maxLength={160}
            value={strength}
            onChange={(e) => setStrength(e.target.value)}
            placeholder="As written on the product"
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={useNow}
            onChange={(e) => setUseNow(e.target.checked)}
          />
          Use current time when saving
        </label>
        {!useNow && (
          <>
            <label>
              Taken at
              <input
                type="datetime-local"
                step="1"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
            <details className="intake-dst">
              <summary>Repeated hour during daylight saving?</summary>
              <label>
                Time occurrence
                <select
                  value={occurrence}
                  onChange={(e) =>
                    setOccurrence(e.target.value as typeof occurrence)
                  }
                >
                  <option value="reject">Ask if ambiguous</option>
                  <option value="earlier">First occurrence</option>
                  <option value="later">Second occurrence</option>
                </select>
              </label>
            </details>
          </>
        )}
        <p className="muted small">
          Times use {zone}.
          {!entry &&
            date !== today &&
            !useNow &&
            ' Review the time for this earlier date before saving.'}
          {entry &&
            ` Originally recorded ${friendlyTime(entry.takenAt, zone)}.`}
        </p>
        <label>
          Note <span className="optional">(optional)</span>
          <textarea
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="With breakfast, after exercise, or other context…"
          />
        </label>
        <footer className="dialog-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {entry ? 'Save changes' : 'Log intake'}
          </button>
        </footer>
      </form>
    </Dialog>
  )
}
