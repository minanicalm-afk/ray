import { stockCell } from "./books"
import { readDraft, receiptsOn, allocationsOn, sendsOn, submission, listPhones, listRegions, listSuppliers, listUsers, activeLeads, openingsOn, pricesOn, salesOn, paymentsOn, sendFor, previousClosing, movements, cashDay, agentSalesOn, getUser } from "./queries"
import { availableForAgent, closeoutPeople } from "./submit"
import { centralUnallocated } from "./queries"
import type { CurrentUser } from "./types"

export function parseDraft(row: { step: number; payload: string } | null | undefined) {
  if (!row) return null
  try {
    return { step: row.step, payload: JSON.parse(row.payload) as unknown }
  } catch {
    return null
  }
}

export function loadAdmin(userId: string, date: string) {
  const all = listPhones()
  const todayReceipts = receiptsOn(date)
  const todayAllocations = allocationsOn(date)
  const phones = all.filter((phone) => {
    if (phone.active && phone.supplierActive) return true
    if (centralUnallocated(phone.id, date) > 0) return true
    return todayReceipts.some((row) => row.phoneId === phone.id) || todayAllocations.some((row) => row.phoneId === phone.id)
  })
  return {
    phones,
    suppliers: listSuppliers(),
    regions: listRegions(),
    agents: listUsers()
      .filter((user) => user.active && user.regionId && (user.role === "SALES_AGENT" || user.role === "SALES_LEAD"))
      .map((user) => ({ id: user.id, name: user.name, role: user.role, regionId: user.regionId ?? "", regionName: user.regionName ?? "" })),
    existing: {
      allocations: todayAllocations.map((row) => ({ phoneId: row.phoneId, regionId: row.regionId, quantity: String(row.quantity) })),
      sends: sendsOn(date).map((row) => ({ agentId: row.agentId, amount: String(row.amount) })),
    },
    draft: parseDraft(readDraft(userId, "admin_setup", date, "admin")),
    submitted: Boolean(submission("admin_setup", date, "admin")),
  }
}

export function loadLead(actor: CurrentUser, regionId: string, date: string) {
  const region = listRegions().find((item) => item.id === regionId)
  const all = listPhones()
  const active = all.filter((phone) => phone.active && phone.supplierActive)
  const received: Record<string, number> = {}
  for (const row of allocationsOn(date).filter((item) => item.regionId === regionId)) {
    received[row.phoneId] = (received[row.phoneId] ?? 0) + row.quantity
  }
  const ids = new Set(active.map((phone) => phone.id))
  for (const phoneId of Object.keys(received)) ids.add(phoneId)
  for (const sale of salesOn(regionId, date)) ids.add(sale.phoneId)
  const stockPhones = all.filter((phone) => ids.has(phone.id))
  const seller = activeLeads().find((lead) => lead.regionId === regionId)
  const suggested: Record<string, number | null> = {}
  const soldByOthers: Record<string, number> = {}
  for (const phone of stockPhones) {
    const move = movements(phone.id)
    const inRegion = <T extends { regionId: string }>(rows: T[]) => rows.filter((row) => row.regionId === regionId)
    const cell = stockCell({
      itemId: phone.id,
      date,
      openings: inRegion(move.openings).map((row) => ({ itemId: phone.id, date: row.date, quantity: row.quantity })),
      allocations: inRegion(move.allocations).map((row) => ({ itemId: phone.id, date: row.date, quantity: row.quantity })),
      sales: inRegion(move.sales).map((row) => ({ itemId: phone.id, date: row.date, quantity: row.quantity })),
    })
    const beforeAllocated = inRegion(move.allocations).filter((row) => row.date < date).reduce((sum, row) => sum + row.quantity, 0)
    const beforeSold = inRegion(move.sales).filter((row) => row.date < date).reduce((sum, row) => sum + row.quantity, 0)
    suggested[phone.id] = cell.suggested ?? beforeAllocated - beforeSold
    soldByOthers[phone.id] = inRegion(move.sales)
      .filter((row) => row.date === date && row.agentId !== seller?.id)
      .reduce((sum, row) => sum + row.quantity, 0)
  }
  const people = closeoutPeople(regionId, actor, date).map((person) => {
    const lines = salesOn(regionId, date)
      .filter((sale) => sale.agentId === person.id && person.id !== seller?.id)
      .map((sale) => {
        const phone = all.find((item) => item.id === sale.phoneId)
        return {
          phoneId: sale.phoneId,
          quantity: sale.quantity,
          label: phone ? `${phone.brand} ${phone.model}` : sale.phoneId,
          supplier: phone?.supplierName ?? "",
        }
      })
    return {
      ...person,
      self: person.id === seller?.id,
      submitted: person.id === seller?.id ? Boolean(submission("lead_closeout", date, regionId)) : Boolean(submission("agent_sales", date, person.id)),
      lines,
    }
  })
  const carried = previousClosing(regionId, date)
  const cash = cashDay(regionId, date)
  return {
    regionName: region?.name ?? "",
    phones: active,
    stockPhones,
    received,
    suggested,
    soldByOthers,
    people,
    carried: carried ? { amount: carried.closing, from: carried.cashDate } : null,
    sent: sendFor(regionId, date)?.amount ?? null,
    existing: {
      openings: openingsOn(regionId, date).map((row) => ({ phoneId: row.phoneId, quantity: String(row.quantity), confirmed: row.confirmed === 1 })),
      prices: pricesOn(regionId, date).map((row) => ({ phoneId: row.phoneId, price: String(row.price) })),
      broughtForward: cash ? String(cash.broughtForward) : "",
      cashReceived: cash ? String(cash.received) : "",
      closing: cash?.closing === null || cash?.closing === undefined ? "" : String(cash.closing),
      sales: salesOn(regionId, date)
        .filter((sale) => sale.agentId === seller?.id)
        .map((sale) => ({ phoneId: sale.phoneId, quantity: String(sale.quantity) })),
      payments: paymentsOn(regionId, date).map((row) => ({ agentId: row.agentId, amount: String(row.amount) })),
    },
    draft: parseDraft(readDraft(actor.id, "lead_closeout", date, regionId)),
    submitted: Boolean(submission("lead_closeout", date, regionId)),
  }
}

export function loadAgent(agentId: string, date: string, userId: string) {
  const agent = getUser(agentId)
  const regionId = agent?.regionId ?? ""
  const all = listPhones()
  const existing = agentSalesOn(agentId, date)
  const phones = all.filter((phone) => (phone.active && phone.supplierActive) || existing.some((sale) => sale.phoneId === phone.id))
  const available: Record<string, number> = {}
  for (const phone of phones) available[phone.id] = availableForAgent(regionId, agentId, phone.id, date)
  return {
    agentName: agent?.name ?? "",
    phones,
    available,
    existing: existing.map((sale) => ({ phoneId: sale.phoneId, quantity: String(sale.quantity) })),
    draft: parseDraft(readDraft(userId, "agent_sales", date, agentId)),
    submitted: Boolean(submission("agent_sales", date, agentId)),
  }
}
