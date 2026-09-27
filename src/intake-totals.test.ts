import { describe, expect, it } from 'vitest'
import type { IntakeEntry } from './model'
import { intakeDayTotals } from './intake-totals'
const zone = 'America/Toronto'
const date = '2026-09-27'
function entry(
  id: string,
  time: string,
  quantity: number,
  overrides: Partial<IntakeEntry> = {},
): IntakeEntry {
  return {
    id,
    itemId: 'coffee',
    name: 'Coffee',
    category: 'Caffeine',
    quantity,
    unit: 'cup',
    strength: '',
    note: '',
    takenAt: Date.parse(time),
    createdAt: Date.parse(time),
    updatedAt: Date.parse(time),
    ...overrides,
  }
}
const a = entry('a', '2026-09-27T12:00:00Z', 0.5)
const b = entry('b', '2026-09-27T14:00:00Z', 1)
const c = entry('c', '2026-09-27T18:00:00Z', 0.25)
describe('intake running totals', () => {
  it('accumulates chronologically and never includes later doses in an earlier total', () => {
    const initial = intakeDayTotals([b, a], date, zone)
    const later = intakeDayTotals([c, b, a], date, zone)
    expect(later.chronological.map((e) => e.id)).toEqual(['a', 'b', 'c'])
    expect([...later.totals.values()]).toEqual([
      '0.5 cup',
      '1.5 cup',
      '1.75 cup',
    ])
    expect(later.totals.get('a')).toBe(initial.totals.get('a'))
    expect(later.totals.get('b')).toBe(initial.totals.get('b'))
    expect(
      [...later.chronological].reverse().map((e) => later.totals.get(e.id)),
    ).toEqual(['1.75 cup', '1.5 cup', '0.5 cup'])
  })
  it('separates item identities and resets at local midnight, not UTC midnight', () => {
    const other = {
      ...b,
      id: 'other',
      itemId: 'tea',
      name: 'Coffee',
      quantity: 9,
    }
    const previous = entry('previous', '2026-09-27T03:59:59Z', 10)
    const midnight = entry('midnight', '2026-09-27T04:00:00Z', 0.25)
    const late = entry('late', '2026-09-28T03:59:59Z', 0.5)
    const tomorrow = entry('tomorrow', '2026-09-28T04:00:00Z', 10)
    const result = intakeDayTotals(
      [a, b, other, previous, midnight, late, tomorrow],
      date,
      zone,
    )
    expect(result.totals.has('previous')).toBe(false)
    expect(result.totals.has('tomorrow')).toBe(false)
    expect(result.totals.get('a')).toBe('0.75 cup')
    expect(result.totals.get('b')).toBe('1.75 cup')
    expect(result.totals.get('other')).toBe('9 cup')
    expect(result.totals.get('late')).toBe('2.25 cup')
  })
  it('uses insertion time and stable IDs to order identical timestamps', () => {
    const first = { ...a, id: 'a', createdAt: 1 }
    const second = { ...a, id: 'b', createdAt: 2 }
    const third = { ...a, id: 'c', createdAt: 2 }
    const result = intakeDayTotals([third, second, first], date, zone)
    expect([...result.totals]).toEqual([
      ['a', '0.5 cup'],
      ['b', '1 cup'],
      ['c', '1.5 cup'],
    ])
  })
  it('recalculates historical corrections and backdated entries without mutating inputs', () => {
    const original = [a, b, c]
    expect(intakeDayTotals(original, date, zone).totals.get('b')).toBe(
      '1.5 cup',
    )
    expect(
      intakeDayTotals([{ ...a, quantity: 2 }, b, c], date, zone).totals.get(
        'b',
      ),
    ).toBe('3 cup')
    expect(intakeDayTotals([b, c], date, zone).totals.get('b')).toBe('1 cup')
    const backdated = entry('backdated', '2026-09-27T13:00:00Z', 0.1, {
      createdAt: c.createdAt + 1,
    })
    const result = intakeDayTotals([...original, backdated], date, zone)
    expect(result.totals.get('a')).toBe('0.5 cup')
    expect(result.totals.get('b')).toBe('1.6 cup')
    expect(original).toEqual([a, b, c])
  })
  it('keeps different units explicit and historical names/strengths do not change identity', () => {
    const mg = { ...b, unit: 'mg', quantity: 100 }
    const changed = {
      ...c,
      name: 'Renamed coffee',
      strength: 'different product',
      quantity: 1,
    }
    const result = intakeDayTotals([a, mg, changed], date, zone)
    expect(result.totals.get('a')).toBe('0.5 cup')
    expect(result.totals.get('b')).toBe('0.5 cup + 100 mg')
    expect(result.totals.get('c')).toBe('1.5 cup + 100 mg')
  })
  it('adds decimals exactly, including small exponent-form quantities', () => {
    expect(
      intakeDayTotals(
        [
          { ...a, quantity: 0.1 },
          { ...b, quantity: 0.2 },
        ],
        date,
        zone,
      ).totals.get('b'),
    ).toBe('0.3 cup')
    expect(
      intakeDayTotals(
        [
          { ...a, quantity: 1e-7 },
          { ...b, quantity: 2e-7 },
        ],
        date,
        zone,
      ).totals.get('b'),
    ).toBe('0.0000003 cup')
    expect(
      intakeDayTotals(
        [
          { ...a, quantity: 0.001 },
          { ...b, quantity: 0.009 },
        ],
        date,
        zone,
      ).totals.get('b'),
    ).toBe('0.01 cup')
    expect(
      intakeDayTotals(
        [
          { ...a, quantity: 100 },
          { ...b, quantity: 20 },
        ],
        date,
        zone,
      ).totals.get('b'),
    ).toBe('120 cup')
  })
})
