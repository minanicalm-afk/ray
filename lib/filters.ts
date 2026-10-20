import { businessToday, isISODate, monthRange } from "./dates"
import type { CurrentUser } from "./types"

export type Query = Record<string, string | string[] | undefined>

export function queryValue(query: Query, key: string) {
  const value = query[key]
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

export type ScreenFilters = {
  q: string
  from: string
  to: string
  regionId: string
  supplierId: string
  brand: string
  model: string
  leadId: string
  agentId: string
  cash: "" | "match" | "diff"
  group: "day" | "week" | "month"
  page: number
  sort: string
  dir: "asc" | "desc"
  addedFrom: string
  addedTo: string
  userId: string
  recordType: string
}

export function readFilters(query: Query, user: CurrentUser, range: "today" | "month" = "month"): ScreenFilters {
  const today = businessToday()
  const defaults = range === "today" ? { start: today, end: today } : monthRange(today)
  let from = isISODate(queryValue(query, "from")) ? queryValue(query, "from") : defaults.start
  let to = isISODate(queryValue(query, "to")) ? queryValue(query, "to") : defaults.end
  if (from > to) [from, to] = [to, from]
  const groupValue = queryValue(query, "group")
  const cashValue = queryValue(query, "cash")
  return {
    q: queryValue(query, "q").trim(),
    from,
    to,
    regionId: user.role === "ADMIN" ? queryValue(query, "region") : user.regionId ?? "",
    supplierId: queryValue(query, "supplier"),
    brand: queryValue(query, "brand"),
    model: queryValue(query, "model"),
    leadId: user.role === "ADMIN" ? queryValue(query, "lead") : "",
    agentId: user.role === "SALES_AGENT" ? user.id : queryValue(query, "agent"),
    cash: user.role === "SALES_AGENT" ? "" : cashValue === "match" || cashValue === "diff" ? cashValue : "",
    group: groupValue === "day" || groupValue === "week" || groupValue === "month" ? groupValue : "day",
    page: Math.max(1, Number(queryValue(query, "page")) || 1),
    sort: queryValue(query, "sort"),
    dir: queryValue(query, "dir") === "asc" ? "asc" : "desc",
    addedFrom: isISODate(queryValue(query, "addedFrom")) ? queryValue(query, "addedFrom") : "",
    addedTo: isISODate(queryValue(query, "addedTo")) ? queryValue(query, "addedTo") : "",
    userId: queryValue(query, "user"),
    recordType: queryValue(query, "type"),
  }
}

export function flatQuery(query: Query) {
  const flat: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    const text = Array.isArray(value) ? value[0] : value
    if (text) flat[key] = text
  }
  return flat
}
