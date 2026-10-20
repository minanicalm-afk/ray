import Link from "next/link"
import { Suspense } from "react"
import { ExportLink, FilterPanel, Pager, SearchBox, SortLink } from "@/components/list-controls"
import { Empty, PageHeader, Stat } from "@/components/ui"
import { businessToday, formatDate, periodLabel, periodRange } from "@/lib/dates"
import { queryValue, readFilters, type Query } from "@/lib/filters"
import { kes, matchText, qty } from "@/lib/format"
import { screenOptions } from "@/lib/options"
import { pageOf, sortBy } from "@/lib/paging"
import { buildReport } from "@/lib/reports"
import { requireUser } from "@/lib/session"

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireUser()
  const query = await searchParams
  const filters = readFilters(query, user, queryValue(query, "from") ? "month" : "month")
  const report = buildReport(user, filters)
  const options = screenOptions(user)
  const money = user.role !== "SALES_AGENT"
  const units = sortBy(report.units, (row) => filters.sort === "units" ? row.units : filters.sort === "expected" ? row.expected : row.supplier, filters.sort ? filters.dir : "desc")
  const paged = pageOf(units, filters.page)
  const today = businessToday()
  return (
    <>
      <PageHeader title={user.role === "SALES_AGENT" ? "My sales" : "Reports"} text={`${formatDate(filters.from)} to ${formatDate(filters.to)}.`} />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <PeriodLink label="Daily" group="day" today={today} />
        <PeriodLink label="Weekly" group="week" today={today} />
        <PeriodLink label="Monthly" group="month" today={today} />
      </div>
      <Suspense>
        <FilterPanel show={{ date: true, region: user.role === "ADMIN", supplier: true, brand: true, model: true, lead: user.role === "ADMIN", agent: user.role !== "SALES_AGENT", cash: money }} options={options} />
        <div className="mb-3 flex gap-2"><SearchBox placeholder="Search" /><ExportLink kind="report" /></div>
      </Suspense>
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Stat label="Units sold" value={qty(report.totals.units)} />
        {money ? <Stat label="Expected deposits" value={kes(report.totals.expected)} hint={report.totals.incomplete ? "Some lines have no price yet." : undefined} /> : null}
        {money ? <Stat label="Cash expenditure" value={kes(report.totals.expenditure)} hint="Sum of daily transactions" /> : null}
      </div>
      <Chart rows={report.chart} />
      <p className="mb-2 mt-4 text-sm">{paged.total} records</p>
      {paged.total === 0 ? <Empty>No records match these filters</Empty> : (
        <div className="overflow-x-auto rounded-3xl border border-line bg-panel">
          <table className="w-full text-left text-sm">
            <thead className="text-ink/60"><tr>
              <th className="p-3">Period</th>
              <th className="p-3"><Suspense><SortLink label="Supplier" column="supplier" /></Suspense></th>
              <th className="p-3">Phone</th>
              <th className="p-3"><Suspense><SortLink label="Units" column="units" /></Suspense></th>
              {money ? <th className="p-3"><Suspense><SortLink label="Expected deposits" column="expected" /></Suspense></th> : null}
            </tr></thead>
            <tbody>
              {paged.items.map((row) => (
                <tr key={`${row.period}-${row.supplier}-${row.model}`} className="border-t border-line">
                  <td className="p-3">{periodLabel(filters.group, row.period)}</td>
                  <td className="p-3">{row.supplier}</td>
                  <td className="p-3">{row.brand} {row.model}</td>
                  <td className="num p-3">{qty(row.units)}</td>
                  {money ? <td className="num p-3">{kes(row.expected)}{row.incomplete ? " *" : ""}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Suspense><Pager page={paged.page} pages={paged.pages} /></Suspense>
      {money ? <Performance title="People" rows={report.performance.map((row) => ({ label: `${row.name} · ${row.region}`, units: row.units, expected: row.expected, extra: "" }))} /> : null}
      {money ? <Performance title="Regions" rows={report.regional.map((row) => ({ label: row.region, units: row.units, expected: row.expected, extra: `Expenditure ${kes(row.expenditure)}` }))} /> : null}
      {money ? <CashTable rows={report.cash} /> : null}
    </>
  )
}

function PeriodLink({ label, group, today }: { label: string; group: "day" | "week" | "month"; today: string }) {
  const range = periodRange(group, today)
  return <Link className="rounded-full border border-line bg-panel px-3 py-1" href={`/reports?group=${group}&from=${range.start}&to=${range.end}`}>{label}</Link>
}

function Chart({ rows }: { rows: { label: string; value: number }[] }) {
  if (!rows.length) return null
  const max = Math.max(...rows.map((row) => row.value))
  return (
    <section className="rounded-3xl border border-line bg-panel p-4">
      <h2 className="font-serif text-2xl">Units by phone</h2>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex justify-between text-sm"><span>{row.label}</span><span className="num">{qty(row.value)}</span></div>
            <div className="mt-1 h-2 rounded-full bg-mist"><div className="h-2 rounded-full bg-pine" style={{ width: `${(row.value / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Performance({ title, rows }: { title: string; rows: { label: string; units: number; expected: number; extra: string }[] }) {
  if (!rows.length) return null
  return (
    <section className="mt-6">
      <h2 className="font-serif text-2xl">{title}</h2>
      <ul className="mt-2 space-y-1 text-sm">{rows.map((row) => <li key={row.label}>{row.label}: {qty(row.units)} phones, {kes(row.expected)}{row.extra ? ` · ${row.extra}` : ""}</li>)}</ul>
    </section>
  )
}

function CashTable({ rows }: { rows: { date: string; region: string; regionId: string; lead: string; sent: number | null; received: number; status: string; starting: number; closing: number | null; transaction: number | null; expected: number }[] }) {
  return (
    <section className="mt-6">
      <h2 className="font-serif text-2xl">Cash sent and received</h2>
      {rows.length === 0 ? <p className="mt-2 text-sm">No records match these filters</p> : (
        <div className="mt-2 overflow-x-auto rounded-3xl border border-line bg-panel">
          <table className="w-full text-left text-sm">
            <thead className="text-ink/60"><tr><th className="p-3">Date</th><th className="p-3">Region</th><th className="p-3">Sent</th><th className="p-3">Received</th><th className="p-3">Check</th><th className="p-3">Transaction</th><th className="p-3"></th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.date}-${row.region}`} className="border-t border-line">
                  <td className="p-3">{formatDate(row.date)}</td>
                  <td className="p-3">{row.region}{row.lead ? ` · ${row.lead}` : ""}</td>
                  <td className="num p-3">{row.sent === null ? "Not logged" : kes(row.sent)}</td>
                  <td className="num p-3">{kes(row.received)}</td>
                  <td className="p-3">{matchText(row.sent, row.received)}</td>
                  <td className="num p-3">{row.transaction === null ? "—" : kes(row.transaction)}</td>
                  <td className="p-3"><Link className="text-gold" href={`/flow/closeout?region=${row.regionId}&date=${row.date}`}>Edit</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
