import Link from "next/link"
import { SalesChart } from "@/components/sales-chart"
import { closingStock, expectedDeposits, onHand, startingCash, transactionAmount } from "@/lib/books"
import { catalogueView } from "@/lib/catalogue-view"
import { addDays, businessToday, formatDate, monthRange, weekRange } from "@/lib/dates"
import { kes, matchText, qty } from "@/lib/format"
import { agentSalesOn, agentsInRegion, cashDay, listPhones, listRegions, listSuppliers, movements, openingsOn, previousClosing, pricesOn, saleRows, salesOn, sendFor, submission } from "@/lib/queries"
import { requireUser } from "@/lib/session"
import { PageHeader, Stat, btn } from "@/components/ui"

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ chart?: string }> }) {
  const user = await requireUser()
  const today = businessToday()
  const query = await searchParams
  const span = query.chart === "month" ? "month" : "week"
  if (user.role === "ADMIN") return <AdminHome today={today} span={span} />
  if (user.role === "SALES_LEAD") return <LeadHome today={today} regionId={user.regionId!} regionName={user.regionName!} userId={user.id} />
  return <AgentHome today={today} agentId={user.id} />
}

function AdminHome({ today, span }: { today: string; span: "week" | "month" }) {
  const phones = listPhones()
  const suppliers = listSuppliers().filter((supplier) => supplier.active)
  const regions = listRegions().map((region) => regionToday(region.id, region.name, phones, today))
  const days = spanDays(today, span)
  const sales = saleRows().filter((sale) => sale.saleDate >= days[0].key && sale.saleDate <= days[days.length - 1].key)
  const series = regions.map((region) => ({
    name: region.name,
    values: days.map((day) => sales.filter((sale) => sale.saleDate === day.key && sale.regionId === region.id).reduce((sum, sale) => sum + sale.quantity, 0)),
  }))
  return (
    <>
      <PageHeader title="Dashboard" text={`Business date ${formatDate(today)}, Nairobi.`} />
      {regions.length === 0 ? <p className="text-sm">No regions yet.</p> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {regions.map((region) => (
            <article key={region.id} className="rounded-3xl border border-line bg-panel p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-serif text-3xl text-pine">{region.name}</h2>
                  {region.lines.length ? <p className="mt-1 text-sm text-ink/60">{region.lines.map((line) => `${line.label} × ${qty(line.quantity)}`).join(", ")}</p> : <p className="mt-1 text-sm text-ink/60">No sales today</p>}
                </div>
                <p className="text-right">
                  <span className="num block text-4xl">{qty(region.sold)}</span>
                  <span className="text-xs uppercase tracking-wide text-ink/50">sold today</span>
                </p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Metric label="Stock balance" value={qty(region.stock)} hint="Phones on hand" />
                <Metric label="Cash balance" value={region.balance === null ? "Not recorded" : kes(region.balance)} hint={region.balanceNote ?? "No cash recorded"} />
                <Metric label="Cash sent" value={region.sent === null ? "Not sent" : kes(region.sent)} hint={region.sent === null ? "Nothing logged today" : matchText(region.sent, region.received)} />
                <Metric label="Cash utilized" value={region.utilized === null ? "Not closed" : kes(region.utilized)} hint="Used for deposits today" />
              </div>
            </article>
          ))}
        </div>
      )}
      <section className="mt-6">
        <h2 className="font-serif text-2xl">Active suppliers</h2>
        {suppliers.length === 0 ? <p className="mt-3 text-sm">No active suppliers yet.</p> : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {suppliers.map((supplier) => (
              <article key={supplier.id} className="rounded-3xl border border-line bg-panel p-4">
                <p className="text-xs uppercase tracking-wide text-ink/50">Supplier</p>
                <p className="mt-2 font-serif text-2xl text-pine">{supplier.name}</p>
              </article>
            ))}
          </div>
        )}
      </section>
      <div className="mt-6">
        <SalesChart span={span} days={days} series={series} />
      </div>
    </>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-mist/70 px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-ink/50">{label}</p>
      <p className="num mt-1 text-lg">{value}</p>
      <p className="mt-1 text-xs text-ink/60">{hint}</p>
    </div>
  )
}

function spanDays(today: string, span: "week" | "month") {
  const range = span === "month" ? monthRange(today) : weekRange(today)
  const days: { key: string; label: string }[] = []
  for (let key = range.start; key <= range.end; key = addDays(key, 1)) {
    const [year, month, day] = key.split("-").map(Number)
    const label = span === "month"
      ? String(day)
      : new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })
    days.push({ key, label })
  }
  return days
}

function regionToday(regionId: string, name: string, phones: ReturnType<typeof listPhones>, today: string) {
  let sold = 0
  let stock = 0
  const lines: { label: string; quantity: number }[] = []
  for (const phone of phones) {
    const move = movements(phone.id)
    const receivedToday = total(move.allocations.filter((row) => row.regionId === regionId && row.date === today))
    const soldToday = total(move.sales.filter((row) => row.regionId === regionId && row.date === today))
    sold += soldToday
    if (soldToday > 0) lines.push({ label: `${phone.supplierName} · ${phone.brand} ${phone.model}`, quantity: soldToday })
    const opening = move.openings.find((row) => row.regionId === regionId && row.date === today)
    if (opening) stock += closingStock(opening.quantity, receivedToday, soldToday)
    else stock += onHand(total(move.allocations.filter((row) => row.regionId === regionId && row.date <= today)), total(move.sales.filter((row) => row.regionId === regionId && row.date <= today)))
  }
  const day = cashDay(regionId, today)
  const sent = sendFor(regionId, today)?.amount ?? null
  const starting = day ? startingCash(day.broughtForward, day.received) : null
  const utilized = day && day.closing !== null && starting !== null ? transactionAmount(starting, day.closing) : null
  const carried = day || starting !== null ? null : previousClosing(regionId, today)
  const balance = day?.closing ?? starting ?? carried?.closing ?? null
  const balanceNote = day?.closing !== null && day ? "Closing balance" : starting !== null ? "Starting cash, day not closed" : carried ? `Carried from ${formatDate(carried.cashDate)}` : null
  return { id: regionId, name, sold, lines, stock, sent, received: day?.received ?? null, utilized, balance, balanceNote }
}

function total(rows: { quantity: number }[]) {
  return rows.reduce((sum, row) => sum + row.quantity, 0)
}

function LeadHome({ today, regionId, regionName, userId }: { today: string; regionId: string; regionName: string; userId: string }) {
  const phones = listPhones().filter((phone) => phone.active && phone.supplierActive)
  const openings = openingsOn(regionId, today)
  const prices = pricesOn(regionId, today)
  const sales = salesOn(regionId, today)
  const cash = cashDay(regionId, today)
  const sent = sendFor(regionId, today)?.amount ?? null
  const unseen = catalogueView(userId, false, today).flatMap((group) => group.phones).filter((phone) => phone.unseen).length
  const pending = agentsInRegion(regionId).filter((agent) => agent.active && !submission("agent_sales", today, agent.id)).length
  const priceByPhone = new Map(prices.map((row) => [row.phoneId, row.price]))
  const expected = expectedDeposits(sales.map((sale) => {
    const phone = phones.find((item) => item.id === sale.phoneId)
    return { quantity: sale.quantity, price: priceByPhone.get(sale.phoneId) ?? phone?.deposit ?? 0 }
  }))
  return (
    <>
      <PageHeader title={regionName} text={`Business date ${formatDate(today)}.`} action={<Link className={btn.primary} href="/flow/closeout">Daily Region Close-Out</Link>} />
      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Unseen catalogue changes" value={qty(unseen)} />
        <Stat label="Opening stock entered" value={`${openings.length} / ${phones.length}`} />
        <Stat label="Prices set" value={`${prices.length} / ${phones.length}`} />
        <Stat label="Cash check" value={matchText(sent, cash?.received ?? null)} />
        <Stat label="Agents still pending" value={qty(pending)} />
        <Stat label="Expected deposits" value={kes(expected)} />
      </div>
    </>
  )
}

function AgentHome({ today, agentId }: { today: string; agentId: string }) {
  const phones = listPhones()
  const sales = agentSalesOn(agentId, today).map((sale) => {
    const phone = phones.find((item) => item.id === sale.phoneId)
    return { ...sale, label: phone ? `${phone.supplierName} · ${phone.brand} ${phone.model}` : "Phone" }
  })
  const units = sales.reduce((sum, sale) => sum + sale.quantity, 0)
  return (
    <>
      <PageHeader title="Today" text={formatDate(today)} action={<Link className={btn.primary} href="/flow/sales">Record Today’s Sales</Link>} />
      <Stat label="Phones sold today" value={qty(units)} />
      <ul className="mt-4 space-y-2 text-sm">
        {sales.length === 0 ? <li>No sales recorded yet.</li> : sales.map((sale) => <li key={sale.phoneId}>{sale.label} × {qty(sale.quantity)}</li>)}
      </ul>
    </>
  )
}
