import { cashStatus, closingStock, expectedFromLines, startingCash, transactionAmount } from "./books"
import { periodKey } from "./dates"
import type { ScreenFilters } from "./filters"
import { allSends, cashRows, centralUnallocated, listPhones, listRegions, listUsers, movements, saleRows } from "./queries"
import type { CurrentUser } from "./types"

function includes(query: string, ...parts: string[]) {
  if (!query) return true
  const haystack = parts.join(" ").toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function cashKey(regionId: string, date: string) {
  return `${regionId}:${date}`
}

export function buildReport(user: CurrentUser, filters: ScreenFilters) {
  const sends = allSends()
  const days = cashRows()
  const statusByDay = new Map<string, "match" | "diff" | "missing">()
  for (const send of sends) {
    const day = days.find((item) => item.regionId === send.regionId && item.cashDate === send.sendDate)
    statusByDay.set(cashKey(send.regionId, send.sendDate), cashStatus(send.amount, day?.received ?? null))
  }
  for (const day of days) {
    const key = cashKey(day.regionId, day.cashDate)
    if (!statusByDay.has(key)) statusByDay.set(key, cashStatus(null, day.received))
  }

  let sales = saleRows().filter((sale) => sale.saleDate >= filters.from && sale.saleDate <= filters.to)
  if (user.role === "SALES_AGENT") sales = sales.filter((sale) => sale.agentId === user.id)
  if (user.role === "SALES_LEAD") sales = sales.filter((sale) => sale.regionId === user.regionId)
  if (user.role === "ADMIN" && filters.regionId) sales = sales.filter((sale) => sale.regionId === filters.regionId)
  if (filters.supplierId) sales = sales.filter((sale) => sale.supplierId === filters.supplierId)
  if (filters.brand) sales = sales.filter((sale) => sale.brand === filters.brand)
  if (filters.model) sales = sales.filter((sale) => sale.model === filters.model)
  if (filters.leadId) sales = sales.filter((sale) => sale.leadId === filters.leadId || sale.agentId === filters.leadId)
  if (filters.agentId && user.role !== "SALES_AGENT") sales = sales.filter((sale) => sale.agentId === filters.agentId)
  sales = sales.filter((sale) => includes(filters.q, sale.supplierName, sale.brand, sale.model, sale.agentName, sale.regionName, sale.saleDate))
  if (filters.cash) {
    sales = sales.filter((sale) => statusByDay.get(cashKey(sale.regionId, sale.saleDate)) === filters.cash)
  }

  const grouped = new Map<string, { period: string; supplier: string; brand: string; model: string; units: number; lines: { quantity: number; price: number | null }[] }>()
  for (const sale of sales) {
    const period = periodKey(filters.group, sale.saleDate)
    const key = `${period}|${sale.phoneId}`
    const row = grouped.get(key) ?? { period, supplier: sale.supplierName, brand: sale.brand, model: sale.model, units: 0, lines: [] }
    row.units += sale.quantity
    row.lines.push({ quantity: sale.quantity, price: sale.price })
    grouped.set(key, row)
  }
  const units = [...grouped.values()].map((row) => {
    const expected = expectedFromLines(row.lines)
    return { ...row, expected: expected.expected, incomplete: expected.incomplete }
  })

  const people = new Map<string, { name: string; region: string; units: number; lines: { quantity: number; price: number | null }[] }>()
  for (const sale of sales) {
    const row = people.get(sale.agentId) ?? { name: sale.agentName, region: sale.regionName, units: 0, lines: [] }
    row.units += sale.quantity
    row.lines.push({ quantity: sale.quantity, price: sale.price })
    people.set(sale.agentId, row)
  }
  const performance = [...people.values()].map((row) => {
    const expected = expectedFromLines(row.lines)
    return { name: row.name, region: row.region, units: row.units, expected: expected.expected, incomplete: expected.incomplete }
  })

  const regions = new Map<string, { region: string; units: number; lines: { quantity: number; price: number | null }[]; expenditure: number }>()
  for (const sale of sales) {
    const row = regions.get(sale.regionId) ?? { region: sale.regionName, units: 0, lines: [], expenditure: 0 }
    row.units += sale.quantity
    row.lines.push({ quantity: sale.quantity, price: sale.price })
    regions.set(sale.regionId, row)
  }

  let cash = days.filter((day) => day.cashDate >= filters.from && day.cashDate <= filters.to)
  const sendsInRange = sends.filter((send) => send.sendDate >= filters.from && send.sendDate <= filters.to)
  if (user.role === "SALES_LEAD") cash = cash.filter((day) => day.regionId === user.regionId)
  if (user.role === "ADMIN" && filters.regionId) cash = cash.filter((day) => day.regionId === filters.regionId)
  if (filters.leadId) {
    const lead = listUsers().find((person) => person.id === filters.leadId)
    if (lead?.regionId) cash = cash.filter((day) => day.regionId === lead.regionId)
  }
  if (filters.agentId && user.role !== "SALES_AGENT") {
    const agent = listUsers().find((person) => person.id === filters.agentId)
    if (agent?.regionId) cash = cash.filter((day) => day.regionId === agent.regionId)
  }
  if (filters.cash) cash = cash.filter((day) => statusByDay.get(cashKey(day.regionId, day.cashDate)) === filters.cash)

  const cashTable = cash.map((day) => {
    const send = sendsInRange.find((item) => item.regionId === day.regionId && item.sendDate === day.cashDate)
    const starting = startingCash(day.broughtForward, day.received)
    const transaction = day.closing === null ? null : transactionAmount(starting, day.closing)
    const expected = expectedFromLines(sales.filter((sale) => sale.regionId === day.regionId && sale.saleDate === day.cashDate).map((sale) => ({ quantity: sale.quantity, price: sale.price })))
    return {
      date: day.cashDate,
      region: day.regionName,
      regionId: day.regionId,
      lead: send?.leadName ?? "",
      sent: send?.amount ?? null,
      received: day.received,
      status: statusByDay.get(cashKey(day.regionId, day.cashDate)) ?? "missing",
      starting,
      closing: day.closing,
      transaction,
      expected: expected.expected,
    }
  }).filter((row) => includes(filters.q, row.region, row.lead, row.date, row.status))

  for (const row of cashTable) {
    const region = [...regions.values()].find((item) => item.region === row.region)
    if (region && row.transaction !== null) region.expenditure += row.transaction
  }
  const regional = [...regions.values()].map((row) => {
    const expected = expectedFromLines(row.lines)
    return { region: row.region, units: row.units, expected: expected.expected, incomplete: expected.incomplete, expenditure: row.expenditure }
  })

  const expected = expectedFromLines(sales.map((sale) => ({ quantity: sale.quantity, price: sale.price })))
  const chartMap = new Map<string, number>()
  for (const sale of sales) chartMap.set(`${sale.brand} ${sale.model}`, (chartMap.get(`${sale.brand} ${sale.model}`) ?? 0) + sale.quantity)
  const chart = [...chartMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  return {
    units,
    performance,
    regional,
    cash: user.role === "SALES_AGENT" ? [] : cashTable,
    chart,
    totals: {
      units: sales.reduce((sum, sale) => sum + sale.quantity, 0),
      expected: expected.expected,
      incomplete: expected.incomplete,
      expenditure: user.role === "SALES_AGENT" ? 0 : cashTable.reduce((sum, row) => sum + (row.transaction ?? 0), 0),
    },
  }
}

export function buildStock(user: CurrentUser, filters: ScreenFilters) {
  const regions = listRegions().filter((region) => (user.role === "ADMIN" ? !filters.regionId || region.id === filters.regionId : region.id === user.regionId))
  const phones = listPhones().filter((phone) => {
    if (filters.supplierId && phone.supplierId !== filters.supplierId) return false
    if (filters.brand && phone.brand !== filters.brand) return false
    if (filters.model && phone.model !== filters.model) return false
    return true
  })
  const regional = []
  for (const phone of phones) {
    const move = movements(phone.id)
    for (const region of regions) {
      const allocations = move.allocations.filter((row) => row.regionId === region.id && row.date >= filters.from && row.date <= filters.to)
      const sales = move.sales.filter((row) => row.regionId === region.id && row.date >= filters.from && row.date <= filters.to)
      const opening = move.openings.find((row) => row.regionId === region.id && row.date === filters.from)
      const received = allocations.reduce((sum, row) => sum + row.quantity, 0)
      const sold = sales.reduce((sum, row) => sum + row.quantity, 0)
      if (!includes(filters.q, phone.supplierName, phone.brand, phone.model, region.name)) continue
      if (received === 0 && sold === 0 && !opening && centralUnallocated(phone.id) === 0 && !phone.active) continue
      regional.push({
        supplier: phone.supplierName,
        brand: phone.brand,
        model: phone.model,
        region: region.name,
        received,
        opening: opening?.quantity ?? null,
        sold,
        closing: opening ? closingStock(opening.quantity, received, sold) : null,
        central: centralUnallocated(phone.id),
      })
    }
  }
  return regional
}
