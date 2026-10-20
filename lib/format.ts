export function kes(amount: number) {
  return `KES ${new Intl.NumberFormat("en-KE").format(amount)}`
}

export function qty(amount: number) {
  return new Intl.NumberFormat("en-KE").format(amount)
}

export function parseWhole(value: string) {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const number = Number(trimmed)
  if (!Number.isSafeInteger(number) || number > 1_000_000_000) return null
  return number
}

export function cleanText(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

export function sameText(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

export function matchText(sent: number | null, received: number | null) {
  if (sent === null) return "Not logged"
  if (received === null) return "Not recorded"
  const gap = received - sent
  if (gap === 0) return "Match"
  const sign = gap > 0 ? "+" : "−"
  return `Difference ${sign}${kes(Math.abs(gap))}`
}
