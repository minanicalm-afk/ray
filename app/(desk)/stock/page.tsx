import { Suspense } from "react"
import { SearchBox } from "@/components/list-controls"
import { StockDesk } from "@/components/stock-desk"
import { Empty, PageHeader } from "@/components/ui"
import { closingStock, onHand } from "@/lib/books"
import { businessToday, formatDate } from "@/lib/dates"
import { queryValue, type Query } from "@/lib/filters"
import { qty } from "@/lib/format"
import { centralUnallocated, listPhones, listRegions, movements } from "@/lib/queries"
import { requireUser } from "@/lib/session"

export default async function StockPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireUser()
  if (user.role === "SALES_AGENT") return <p>Your sold phones are on My sales.</p>
  const query = await searchParams
  const today = businessToday()
  const q = queryValue(query, "q").toLowerCase()
  const regions = listRegions().filter((region) => user.role === "ADMIN" || region.id === user.regionId)
  const phones = listPhones()
  const groups = supplierFigures(phones, regions, today, q)
  const activePhones = phones.filter((phone) => phone.active && phone.supplierActive)
  const allocated: Record<string, number> = {}
  const centre: Record<string, number> = {}
  for (const phone of activePhones) {
    centre[phone.id] = centralUnallocated(phone.id)
    const move = movements(phone.id)
    for (const region of regions) {
      allocated[`${phone.id}:${region.id}`] = move.allocations
        .filter((row) => row.regionId === region.id && row.date === today)
        .reduce((sum, row) => sum + row.quantity, 0)
    }
  }

  return (
    <>
      <PageHeader title="Stock" text={`Position on ${formatDate(today)}. Received stock sits at the centre until it is allocated to a region.`} />
      {user.role === "ADMIN" ? (
        <StockDesk
          date={today}
          phones={activePhones.map((phone) => ({ id: phone.id, supplierId: phone.supplierId, supplierName: phone.supplierName, brand: phone.brand, model: phone.model }))}
          regions={regions}
          allocated={allocated}
          centre={centre}
        />
      ) : null}
      <div className={user.role === "ADMIN" ? "mt-8" : ""}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-serif text-2xl">By supplier</h2>
          <Suspense><SearchBox placeholder="Search supplier or phone" /></Suspense>
        </div>
        {groups.length === 0 ? <Empty>No records match these filters</Empty> : (
          <div className="grid gap-4">
            {groups.map((group) => (
              <article key={group.name} className="rounded-3xl border border-line bg-panel p-5">
                <h3 className="font-serif text-3xl text-pine">{group.name}</h3>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {group.phones.map((phone) => (
                    <div key={phone.id} className="rounded-2xl bg-mist/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-ink/50">{phone.brand}</p>
                      <p className="font-serif text-2xl">{phone.model}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Figure label="Received" value={qty(phone.received)} />
                        {user.role === "ADMIN" ? <Figure label="At centre" value={qty(phone.centre)} /> : null}
                        {phone.regions.map((region) => (
                          <Figure key={region.name} label={region.name} value={qty(region.onHand)} hint={`${qty(region.allocated)} allocated · ${qty(region.sold)} sold`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-panel px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-ink/50">{label}</p>
      <p className="num mt-1 text-2xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink/60">{hint}</p> : null}
    </div>
  )
}

function supplierFigures(phones: ReturnType<typeof listPhones>, regions: { id: string; name: string }[], today: string, q: string) {
  const groups = new Map<string, { name: string; phones: PhoneFigure[] }>()
  for (const phone of phones) {
    const haystack = `${phone.supplierName} ${phone.brand} ${phone.model}`.toLowerCase()
    if (q && !haystack.includes(q)) continue
    const move = movements(phone.id)
    const received = move.receipts.reduce((sum, row) => sum + row.quantity, 0)
    const centre = centralUnallocated(phone.id)
    const regionFigures = regions.map((region) => {
      const allocated = move.allocations.filter((row) => row.regionId === region.id && row.date <= today).reduce((sum, row) => sum + row.quantity, 0)
      const sold = move.sales.filter((row) => row.regionId === region.id && row.date <= today).reduce((sum, row) => sum + row.quantity, 0)
      const opening = move.openings.find((row) => row.regionId === region.id && row.date === today)
      const receivedToday = move.allocations.filter((row) => row.regionId === region.id && row.date === today).reduce((sum, row) => sum + row.quantity, 0)
      const soldToday = move.sales.filter((row) => row.regionId === region.id && row.date === today).reduce((sum, row) => sum + row.quantity, 0)
      return {
        name: region.name,
        allocated,
        sold,
        onHand: opening ? closingStock(opening.quantity, receivedToday, soldToday) : onHand(allocated, sold),
      }
    })
    const quiet = received === 0 && centre === 0 && regionFigures.every((region) => region.allocated === 0 && region.sold === 0)
    if (quiet && !phone.active) continue
    const group = groups.get(phone.supplierId) ?? { name: phone.supplierName, phones: [] }
    group.phones.push({ id: phone.id, brand: phone.brand, model: phone.model, received, centre, regions: regionFigures })
    groups.set(phone.supplierId, group)
  }
  return [...groups.values()]
}

type PhoneFigure = {
  id: string
  brand: string
  model: string
  received: number
  centre: number
  regions: { name: string; allocated: number; sold: number; onHand: number }[]
}
