export type DatedQty = {
  itemId: string
  date: string
  quantity: number
}

export function startingCash(broughtForward: number, received: number) {
  return broughtForward + received
}

export function transactionAmount(starting: number, closing: number) {
  return starting - closing
}

export function expectedDeposits(lines: { quantity: number; price: number }[]) {
  return lines.reduce((sum, line) => sum + line.quantity * line.price, 0)
}

export function expectedFromLines(lines: { quantity: number; price: number | null }[]) {
  let expected = 0
  let incomplete = false
  for (const line of lines) {
    if (line.price === null) {
      if (line.quantity > 0) incomplete = true
      continue
    }
    expected += line.quantity * line.price
  }
  return { expected, incomplete }
}

export function closingStock(opening: number, received: number, sold: number) {
  return opening + received - sold
}

export function centralRemaining(received: number, allocated: number) {
  return received - allocated
}

export function onHand(allocated: number, sold: number) {
  return allocated - sold
}

export function cashGap(sent: number, received: number) {
  return received - sent
}

export function depositGap(transaction: number, expected: number) {
  return transaction - expected
}

export function cashStatus(sent: number | null, received: number | null): "match" | "diff" | "missing" {
  if (sent === null || received === null) return "missing"
  return sent === received ? "match" : "diff"
}

export function availableToSell(input: {
  opening: number | null
  receivedToday: number
  soldByOthersToday: number
  onHandIfThisLineIsZero: number
}) {
  if (input.opening !== null) return input.opening + input.receivedToday - input.soldByOthersToday
  return input.onHandIfThisLineIsZero
}

export function sumBetween(rows: DatedQty[], itemId: string, start: string, end: string) {
  return rows.reduce((sum, row) => {
    if (row.itemId !== itemId) return sum
    if (row.date < start || row.date > end) return sum
    return sum + row.quantity
  }, 0)
}

export function stockCell(input: {
  itemId: string
  date: string
  openings: DatedQty[]
  allocations: DatedQty[]
  sales: DatedQty[]
}) {
  const { itemId, date } = input
  const openingToday = input.openings.find((row) => row.itemId === itemId && row.date === date)?.quantity ?? null
  const receivedToday = sumBetween(input.allocations, itemId, date, date)
  const soldToday = sumBetween(input.sales, itemId, date, date)
  const allocatedToDate = sumBetween(input.allocations, itemId, "0000-01-01", date)
  const soldToDate = sumBetween(input.sales, itemId, "0000-01-01", date)
  const prior = input.openings
    .filter((row) => row.itemId === itemId && row.date < date)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  const dayBefore = previousDate(date)
  const suggested =
    prior === undefined
      ? null
      : prior.quantity +
        sumBetween(input.allocations, itemId, prior.date, dayBefore) -
        sumBetween(input.sales, itemId, prior.date, dayBefore)

  return {
    opening: openingToday,
    received: receivedToday,
    sold: soldToday,
    closing: openingToday === null ? null : closingStock(openingToday, receivedToday, soldToday),
    onHand: onHand(allocatedToDate, soldToDate),
    suggested,
  }
}

export function phoneBadge(
  phone: { createdAt: string; updatedAt: string },
  seenAt: string | null,
  today: string,
): "New" | "Updated" | null {
  if (seenAt && seenAt >= phone.updatedAt) return null
  const start = shiftDate(today, -6)
  const createdDay = phone.createdAt.slice(0, 10)
  const updatedDay = phone.updatedAt.slice(0, 10)
  const wasUpdated = phone.updatedAt > phone.createdAt
  if (wasUpdated && updatedDay >= start && updatedDay <= today) return "Updated"
  if (createdDay >= start && createdDay <= today) return "New"
  return null
}

function shiftDate(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function previousDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}
