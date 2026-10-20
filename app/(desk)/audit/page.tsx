import { Suspense } from "react"
import { ExportLink, FilterPanel, Pager, SearchBox, SortLink } from "@/components/list-controls"
import { Empty, PageHeader } from "@/components/ui"
import { formatStamp } from "@/lib/dates"
import { queryValue, readFilters, type Query } from "@/lib/filters"
import { screenOptions } from "@/lib/options"
import { pageOf, sortBy } from "@/lib/paging"
import { auditRows } from "@/lib/queries"
import { requireUser } from "@/lib/session"

export default async function AuditPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireUser()
  if (user.role !== "ADMIN") return <p>Only an admin can view the audit log.</p>
  const query = await searchParams
  const filters = readFilters(query, user)
  const from = queryValue(query, "from")
  const to = queryValue(query, "to")
  const options = screenOptions(user)
  const rows = auditRows().filter((row) => {
    const day = row.createdAt.slice(0, 10)
    if (filters.userId && row.actorId !== filters.userId) return false
    if (filters.recordType && row.entityType !== filters.recordType) return false
    if (from && day < from) return false
    if (to && day > to) return false
    if (filters.q && !`${row.actorName} ${row.action} ${row.entityType} ${row.beforeJson ?? ""} ${row.afterJson ?? ""}`.toLowerCase().includes(filters.q.toLowerCase())) return false
    return true
  })
  const sorted = sortBy(rows, (row) => filters.sort === "user" ? row.actorName : filters.sort === "type" ? row.entityType : row.createdAt, filters.sort ? filters.dir : "desc")
  const paged = pageOf(sorted, filters.page)
  return (
    <>
      <PageHeader title="Audit log" text="Every change is kept. This log cannot be edited or deleted." />
      <Suspense>
        <FilterPanel show={{ date: true, user: true, recordType: true }} options={options} />
        <div className="mb-3 flex gap-2"><SearchBox placeholder="Search the log" /><ExportLink kind="audit" /></div>
      </Suspense>
      <p className="mb-2 text-sm">{paged.total} records</p>
      {paged.total === 0 ? <Empty>No records match these filters</Empty> : (
        <div className="space-y-2">
          <div className="flex gap-4 px-2 text-xs text-ink/50">
            <Suspense><SortLink label="When" column="when" /></Suspense>
            <Suspense><SortLink label="User" column="user" /></Suspense>
            <Suspense><SortLink label="Record" column="type" /></Suspense>
          </div>
          {paged.items.map((row) => (
            <article key={row.id} className="rounded-3xl border border-line bg-panel p-4 text-sm">
              <p>{formatStamp(row.createdAt)} · {row.actorName} · {row.actorRole} · {row.action} · {row.entityType}</p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <pre className="overflow-auto rounded-2xl bg-mist p-3 text-xs">{row.beforeJson ?? "—"}</pre>
                <pre className="overflow-auto rounded-2xl bg-mist p-3 text-xs">{row.afterJson ?? "—"}</pre>
              </div>
            </article>
          ))}
        </div>
      )}
      <Suspense><Pager page={paged.page} pages={paged.pages} /></Suspense>
    </>
  )
}
