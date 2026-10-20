import assert from "node:assert/strict"
import test from "node:test"
import {
  availableToSell,
  cashGap,
  cashStatus,
  closingStock,
  depositGap,
  expectedDeposits,
  startingCash,
  stockCell,
  phoneBadge,
  transactionAmount,
} from "./books.ts"
import { monthRange, weekRange } from "./dates.ts"

test("deposit cash follows the worked example", () => {
  const broughtForward = 20_000
  const received = 100_000
  const starting = startingCash(broughtForward, received)
  assert.equal(starting, 120_000)
  assert.equal(cashGap(100_000, 100_000), 0)
  assert.equal(cashStatus(100_000, 100_000), "match")
  assert.equal(cashStatus(100_000, 90_000), "diff")
  assert.equal(cashStatus(null, 90_000), "missing")

  const expected = expectedDeposits([{ quantity: 25, price: 3_900 }])
  assert.equal(expected, 97_500)
  assert.equal(expectedDeposits([{ quantity: 10, price: 3_900 }]), 39_000)

  const closing = 22_500
  const transaction = transactionAmount(starting, closing)
  assert.equal(transaction, 97_500)
  assert.equal(depositGap(transaction, expected), 0)
})

test("daily stock closes from opening, receipts, and sales", () => {
  const cell = stockCell({
    itemId: "phone",
    date: "2026-10-13",
    openings: [
      { itemId: "phone", date: "2026-10-12", quantity: 30 },
      { itemId: "phone", date: "2026-10-13", quantity: 28 },
    ],
    allocations: [
      { itemId: "phone", date: "2026-10-12", quantity: 0 },
      { itemId: "phone", date: "2026-10-13", quantity: 10 },
    ],
    sales: [
      { itemId: "phone", date: "2026-10-12", quantity: 2 },
      { itemId: "phone", date: "2026-10-13", quantity: 25 },
    ],
  })

  assert.equal(cell.opening, 28)
  assert.equal(cell.received, 10)
  assert.equal(cell.sold, 25)
  assert.equal(cell.closing, closingStock(28, 10, 25))
  assert.equal(cell.suggested, 28)
  assert.equal(cell.onHand, -17)
})

test("available stock uses the daily count once opening is recorded", () => {
  assert.equal(
    availableToSell({ opening: 20, receivedToday: 5, soldByOthersToday: 7, onHandIfThisLineIsZero: 100 }),
    18,
  )
  assert.equal(
    availableToSell({ opening: null, receivedToday: 5, soldByOthersToday: 7, onHandIfThisLineIsZero: 9 }),
    9,
  )
})

test("reporting periods use Monday weeks and calendar months", () => {
  assert.deepEqual(weekRange("2026-10-16"), { start: "2026-10-12", end: "2026-10-18" })
  assert.deepEqual(monthRange("2026-10-16"), { start: "2026-10-01", end: "2026-10-31" })
})

test("catalogue badges stay within seven days and respect mark as seen", () => {
  const today = "2026-10-16"
  assert.equal(phoneBadge({ createdAt: "2026-10-15T08:00:00.000Z", updatedAt: "2026-10-15T08:00:00.000Z" }, null, today), "New")
  assert.equal(
    phoneBadge({ createdAt: "2026-10-10T08:00:00.000Z", updatedAt: "2026-10-16T08:00:00.000Z" }, null, today),
    "Updated",
  )
  assert.equal(
    phoneBadge(
      { createdAt: "2026-10-15T08:00:00.000Z", updatedAt: "2026-10-15T08:00:00.000Z" },
      "2026-10-15T09:00:00.000Z",
      today,
    ),
    null,
  )
  assert.equal(phoneBadge({ createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z" }, null, today), null)
})
