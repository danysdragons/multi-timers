import type { IntakeEntry } from './model'
import { dayBounds } from './time'

type Decimal = { value: bigint; scale: number }

// Add the decimal quantities as entered, without floating-point display drift.
function decimal(quantity: number): Decimal {
  const [mantissa, exponent = '0'] = String(quantity).split('e')
  const [whole, fraction = ''] = mantissa.split('.')
  const scale = fraction.length - Number(exponent)
  const value = BigInt(whole + fraction)
  return scale < 0
    ? { value: value * 10n ** BigInt(-scale), scale: 0 }
    : { value, scale }
}
function add(a: Decimal, b: Decimal): Decimal {
  const scale = Math.max(a.scale, b.scale)
  return {
    value:
      a.value * 10n ** BigInt(scale - a.scale) +
      b.value * 10n ** BigInt(scale - b.scale),
    scale,
  }
}
function format({ value, scale }: Decimal) {
  const digits = String(value).padStart(scale + 1, '0')
  if (!scale) return digits
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(
    /\.?0+$/,
    '',
  )
}

/** Chronological daily totals. Display order never determines accumulation. */
export function intakeDayTotals(
  entries: IntakeEntry[],
  date: string,
  zone: string,
) {
  const [start, end] = dayBounds(date, zone)
  const chronological = entries
    .filter((entry) => entry.takenAt >= start && entry.takenAt < end)
    .sort(
      (a, b) =>
        a.takenAt - b.takenAt ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id),
    )
  const byItem = new Map<string, Map<string, Decimal>>()
  const totals = new Map<string, string>()
  for (const entry of chronological) {
    const units = byItem.get(entry.itemId) ?? new Map<string, Decimal>()
    units.set(
      entry.unit,
      add(
        units.get(entry.unit) ?? { value: 0n, scale: 0 },
        decimal(entry.quantity),
      ),
    )
    byItem.set(entry.itemId, units)
    // Different units remain explicit: never infer conversions from strength text.
    totals.set(
      entry.id,
      Array.from(units, ([unit, amount]) => `${format(amount)} ${unit}`).join(
        ' + ',
      ),
    )
  }
  return { chronological, totals }
}
