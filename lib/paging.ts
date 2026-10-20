export function pageOf<T>(items: T[], page: number, size = 8) {
  const pages = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(Math.max(page, 1), pages)
  const start = (current - 1) * size
  return { items: items.slice(start, start + size), page: current, pages, total: items.length }
}

export function sortBy<T>(items: T[], value: (item: T) => string | number, dir: "asc" | "desc") {
  return [...items].sort((left, right) => {
    const a = value(left)
    const b = value(right)
    const compared = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b))
    return dir === "asc" ? compared : -compared
  })
}
