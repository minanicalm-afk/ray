import { catalogueView } from "@/lib/catalogue-view"
import { toCsv } from "@/lib/csv"
import { businessToday, periodLabel } from "@/lib/dates"
import { readFilters } from "@/lib/filters"
import { auditRows, listUsers } from "@/lib/queries"
import { buildReport, buildStock } from "@/lib/reports"
import { getCurrentUser } from "@/lib/session"

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return new Response("Sign in required", { status: 401 })
  const url = new URL(request.url)
  const query = Object.fromEntries(url.searchParams.entries())
  const kind = query.kind || "report"
  const filters = readFilters(query, user, kind === "stock" ? "today" : "month")
  const today = businessToday()
  let csv = ""
  if (kind === "stock") {
    if (user.role === "SALES_AGENT") return new Response("Not available", { status: 403 })
    const rows = buildStock(user, filters)
    const admin = user.role === "ADMIN"
    const header = ["Supplier", "Brand", "Model", "Region", "Received", "Opening", "Sold", "Closing", ...(admin ? ["Central left"] : [])]
    csv = toCsv([header, ...rows.map((row) => {
      const cells = [row.supplier, row.brand, row.model, row.region, String(row.received), row.opening === null ? "" : String(row.opening), String(row.sold), row.closing === null ? "" : String(row.closing)]
      if (admin) cells.push(String(row.central))
      return cells
    })])
  } else if (kind === "catalogue") {
    const rows = catalogueView(user.id, user.role === "ADMIN", today).flatMap((group) => group.phones.map((phone) => [group.supplier, phone.brand, phone.model, phone.when, phone.by, phone.badge ?? ""]))
    csv = toCsv([["Supplier", "Brand", "Model", "When", "By", "Badge"], ...rows])
  } else if (kind === "team") {
    if (user.role !== "ADMIN") return new Response("Not available", { status: 403 })
    csv = toCsv([["Name", "Email", "Role", "Region", "Active"], ...listUsers().map((person) => [person.name, person.email, person.role, person.regionName ?? "", person.active ? "yes" : "no"])])
  } else if (kind === "audit") {
    if (user.role !== "ADMIN") return new Response("Not available", { status: 403 })
    const from = query.from || ""
    const to = query.to || ""
    const log = auditRows().filter((row) => {
      const day = row.createdAt.slice(0, 10)
      if (filters.userId && row.actorId !== filters.userId) return false
      if (filters.recordType && row.entityType !== filters.recordType) return false
      if (from && day < from) return false
      if (to && day > to) return false
      if (filters.q && !`${row.actorName} ${row.action} ${row.entityType} ${row.beforeJson ?? ""} ${row.afterJson ?? ""}`.toLowerCase().includes(filters.q.toLowerCase())) return false
      return true
    })
    csv = toCsv([["When", "User", "Role", "Action", "Type", "Before", "After"], ...log.map((row) => [row.createdAt, row.actorName, row.actorRole, row.action, row.entityType, row.beforeJson ?? "", row.afterJson ?? ""])])
  } else {
    const report = buildReport(user, filters)
    const header = user.role === "SALES_AGENT" ? ["Period", "Supplier", "Brand", "Model", "Units"] : ["Period", "Supplier", "Brand", "Model", "Units", "Expected deposits"]
    csv = toCsv([header, ...report.units.map((row) => user.role === "SALES_AGENT" ? [periodLabel(filters.group, row.period), row.supplier, row.brand, row.model, String(row.units)] : [periodLabel(filters.group, row.period), row.supplier, row.brand, row.model, String(row.units), String(row.expected)])])
  }
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ray-${kind}.csv"`,
    },
  })
}
