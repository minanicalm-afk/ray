import { writeAudit } from "./audit"
import { availableToSell, depositGap, expectedDeposits, startingCash, transactionAmount } from "./books"
import { id, now, rows, run, transaction } from "./db"
import { matchText } from "./format"
import {
  activeLeads,
  agentSalesOn,
  agentsInRegion,
  allocationsOn,
  cashDay,
  centralUnallocated,
  getUser,
  listPhones,
  listRegions,
  listUsers,
  openingsOn,
  paymentsOn,
  previousClosing,
  pricesOn,
  receiptsOn,
  salesOn,
  sendFor,
  sendsOn,
  submission,
} from "./queries"
import type { AdminInput, AdminSummary, AgentInput, AgentSummary, CurrentUser, LeadInput, LeadSummary } from "./types"

function phoneLabel(phone: { supplierName: string; brand: string; model: string }) {
  return `${phone.supplierName} · ${phone.brand} ${phone.model}`
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

export function submitAdminDay(actor: CurrentUser, date: string, input: AdminInput) {
  const phones = listPhones()
  const phoneById = new Map(phones.map((phone) => [phone.id, phone]))
  const regions = listRegions()
  const regionById = new Map(regions.map((region) => [region.id, region]))
  const sellers = listUsers().filter((user) => user.active && user.regionId && (user.role === "SALES_AGENT" || user.role === "SALES_LEAD"))
  const sellerById = new Map(sellers.map((seller) => [seller.id, seller]))

  if (input.receipts.some((line, index) => input.receipts.findIndex((other) => other.phoneId === line.phoneId) !== index)) {
    return fail("Each phone can only appear once in stock received.")
  }
  for (const line of input.receipts) {
    const phone = phoneById.get(line.phoneId)
    if (!phone || !phone.active || !phone.supplierActive) return fail("Choose an active phone for every receipt.")
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) return fail(`Enter a quantity for ${phoneLabel(phone)}.`)
  }
  const allocationSums = new Map<string, number>()
  for (const line of input.allocations) {
    const phone = phoneById.get(line.phoneId)
    const region = regionById.get(line.regionId)
    if (!phone || !region) return fail("An allocation refers to a phone or region that does not exist.")
    if (!Number.isInteger(line.quantity) || line.quantity < 0) return fail(`Enter a whole number for ${phoneLabel(phone)}.`)
    allocationSums.set(line.phoneId, (allocationSums.get(line.phoneId) ?? 0) + line.quantity)
  }
  for (const [phoneId, allocated] of allocationSums) {
    const phone = phoneById.get(phoneId)!
    const already = receiptsOn(date).filter((row) => row.phoneId === phoneId).reduce((sum, row) => sum + row.quantity, 0)
    const available = centralUnallocated(phoneId, date) + Math.max(already, allocated)
    if (allocated > available) return fail(`Only ${available} unallocated for ${phoneLabel(phone)}.`)
  }
  if (input.sends.length !== sellers.length || input.sends.some((line) => !sellerById.has(line.agentId))) {
    return fail("Enter an amount sent for every sales agent.")
  }
  for (const line of input.sends) {
    if (!Number.isInteger(line.amount) || line.amount < 0) return fail(`Enter a whole shilling amount for ${sellerById.get(line.agentId)!.name}.`)
  }

  const updated = Boolean(submission("admin_setup", date, "admin"))
  const summary = transaction(() => {
    const beforeReceipts = receiptsOn(date)
    const beforeAllocations = allocationsOn(date)
    const beforeSends = sendsOn(date)
    run("DELETE FROM stock_allocations WHERE allocated_on = ?", [date])
    run("DELETE FROM cash_sends WHERE send_date = ?", [date])
    run("DELETE FROM agent_cash_sends WHERE send_date = ?", [date])
    const stamp = now()
    const receiptBefore = new Map<string, number>()
    for (const row of beforeReceipts) receiptBefore.set(row.phoneId, (receiptBefore.get(row.phoneId) ?? 0) + row.quantity)
    for (const [phoneId, allocated] of allocationSums) {
      const already = receiptBefore.get(phoneId) ?? 0
      if (allocated <= already) continue
      run(
        `INSERT INTO stock_receipts (id, phone_id, quantity, received_on, recorded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id(), phoneId, allocated - already, date, actor.id, stamp, stamp],
      )
    }
    for (const line of input.allocations.filter((item) => item.quantity > 0)) {
      run(
        `INSERT INTO stock_allocations (id, region_id, phone_id, quantity, allocated_on, recorded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id(), line.regionId, line.phoneId, line.quantity, date, actor.id, stamp, stamp],
      )
    }
    for (const line of input.sends) {
      const seller = sellerById.get(line.agentId)!
      run(
        `INSERT INTO agent_cash_sends (id, region_id, agent_id, send_date, amount, recorded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id(), seller.regionId, line.agentId, date, line.amount, actor.id, stamp, stamp],
      )
    }
    const receiptAfter = new Map(receiptBefore)
    for (const [phoneId, allocated] of allocationSums) receiptAfter.set(phoneId, Math.max(receiptAfter.get(phoneId) ?? 0, allocated))
    diffRows(
      actor,
      "stock_receipt",
      [...receiptBefore.entries()].map(([phoneId, quantity]) => ({ key: phoneId, values: { date, phone: labelOf(phoneById, phoneId), quantity } })),
      [...receiptAfter.entries()].map(([phoneId, quantity]) => ({ key: phoneId, values: { date, phone: labelOf(phoneById, phoneId), quantity } })),
    )
    diffRows(
      actor,
      "stock_allocation",
      beforeAllocations.map((row) => ({
        key: `${row.phoneId}:${row.regionId}`,
        id: row.id,
        values: { date, phone: labelOf(phoneById, row.phoneId), region: regionById.get(row.regionId)?.name ?? row.regionId, quantity: row.quantity },
      })),
      input.allocations
        .filter((row) => row.quantity > 0)
        .map((row) => ({
          key: `${row.phoneId}:${row.regionId}`,
          values: { date, phone: labelOf(phoneById, row.phoneId), region: regionById.get(row.regionId)?.name ?? row.regionId, quantity: row.quantity },
        })),
    )
    diffRows(
      actor,
      "cash_send",
      beforeSends.map((row) => ({
        key: row.agentId,
        id: row.id,
        values: { date, agent: sellerById.get(row.agentId)?.name ?? row.agentId, amount: row.amount },
      })),
      input.sends.map((row) => ({
        key: row.agentId,
        values: { date, agent: sellerById.get(row.agentId)?.name ?? row.agentId, amount: row.amount },
      })),
    )
    markSubmitted("admin_setup", date, "admin", actor.id)
    clearDraft(actor.id, "admin_setup", date, "admin")
    const result: AdminSummary = {
      date,
      updated,
      receipts: [...receiptAfter.entries()].map(([phoneId, quantity]) => ({ phone: labelOf(phoneById, phoneId), quantity })),
      allocations: input.allocations
        .filter((line) => line.quantity > 0)
        .map((line) => ({
          phone: labelOf(phoneById, line.phoneId),
          region: regionById.get(line.regionId)?.name ?? "",
          quantity: line.quantity,
        })),
      sends: input.sends.map((line) => ({
        agent: sellerById.get(line.agentId)!.name,
        region: sellerById.get(line.agentId)!.regionName ?? "",
        amount: line.amount,
      })),
      unallocated: phones
        .filter((phone) => phone.active)
        .map((phone) => ({ phone: phoneLabel(phone), quantity: centralUnallocated(phone.id) }))
        .filter((line) => line.quantity > 0),
    }
    return result
  })
  return { ok: true as const, summary }
}

export function submitLeadDay(actor: CurrentUser, regionId: string, date: string, input: LeadInput) {
  const region = listRegions().find((item) => item.id === regionId)
  if (!region) return fail("That region does not exist.")
  const phones = listPhones()
  const phoneById = new Map(phones.map((phone) => [phone.id, phone]))
  const activePhones = phones.filter((phone) => phone.active && phone.supplierActive)
  const requiredIds = new Set(activePhones.map((phone) => phone.id))
  for (const sale of salesOn(regionId, date)) requiredIds.add(sale.phoneId)
  for (const allocation of allocationsOn(date).filter((line) => line.regionId === regionId)) requiredIds.add(allocation.phoneId)

  if (input.openings.length !== requiredIds.size || input.openings.some((line) => !requiredIds.has(line.phoneId))) {
    return fail("Enter opening stock for every phone.")
  }
  for (const line of input.openings) {
    const phone = phoneById.get(line.phoneId)
    if (!phone) return fail("A stock line refers to a phone that does not exist.")
    if (!Number.isInteger(line.quantity) || line.quantity < 0) return fail(`Enter opening stock for ${phoneLabel(phone)}.`)
    const received = allocationsOn(date)
      .filter((item) => item.regionId === regionId && item.phoneId === line.phoneId)
      .reduce((sum, item) => sum + item.quantity, 0)
    if (received > 0 && !line.confirmed) return fail(`Confirm the stock received for ${phoneLabel(phone)}.`)
  }
  if (input.prices.length !== activePhones.length || input.prices.some((line) => !activePhones.some((phone) => phone.id === line.phoneId))) {
    return fail("Set a price for every active phone.")
  }
  const priceByPhone = new Map<string, number>()
  for (const line of input.prices) {
    const phone = phoneById.get(line.phoneId)!
    if (!Number.isInteger(line.price) || line.price < 0) return fail(`Enter a price for ${phoneLabel(phone)}.`)
    priceByPhone.set(line.phoneId, line.price)
  }
  const carried = previousClosing(regionId, date)
  const broughtForward = carried ? carried.closing : input.broughtForward
  if (!Number.isInteger(broughtForward) || broughtForward < 0) return fail("Enter the balance brought forward.")
  if (!Number.isInteger(input.cashReceived) || input.cashReceived < 0) return fail("Enter the cash received.")
  if (!Number.isInteger(input.closingBalance) || input.closingBalance < 0) return fail("Enter the closing balance.")
  if (input.sales.some((line, index) => input.sales.findIndex((other) => other.phoneId === line.phoneId) !== index)) {
    return fail("Each phone can only appear once in your sales.")
  }

  const people = peopleForClose(regionId, actor, date)
  if (input.payments.length !== people.length || input.payments.some((line) => !people.some((person) => person.id === line.agentId))) {
    return fail("Enter the amount paid for every agent.")
  }
  for (const line of input.payments) {
    if (!Number.isInteger(line.amount) || line.amount < 0) return fail("Enter a whole shilling amount for every agent.")
  }

  for (const line of input.sales) {
    const phone = phoneById.get(line.phoneId)
    if (!phone) return fail("Choose a phone for every sale.")
    const seller = activeLeads().find((lead) => lead.regionId === regionId) ?? actor
    const existing = salesOn(regionId, date).some((sale) => sale.agentId === seller.id && sale.phoneId === line.phoneId)
    if ((!phone.active || !phone.supplierActive) && !existing) return fail(`${phoneLabel(phone)} is not available for new sales.`)
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) return fail(`Enter a quantity for ${phoneLabel(phone)}.`)
    const opening = input.openings.find((item) => item.phoneId === line.phoneId)?.quantity ?? 0
    const received = receivedToday(regionId, line.phoneId, date)
    const soldOthers = salesOn(regionId, date)
      .filter((sale) => sale.phoneId === line.phoneId && sale.agentId !== seller.id)
      .reduce((sum, sale) => sum + sale.quantity, 0)
    const available = opening + received - soldOthers
    if (line.quantity > available) return fail(`Only ${Math.max(available, 0)} available for ${phoneLabel(phone)}.`)
  }

  const seller = activeLeads().find((lead) => lead.regionId === regionId) ?? actor
  const updated = Boolean(submission("lead_closeout", date, regionId))
  const summary = transaction(() => {
    const stamp = now()
    const beforeOpen = openingsOn(regionId, date)
    const beforePrices = pricesOn(regionId, date)
    const beforeCash = cashDay(regionId, date)
    const beforeSales = salesOn(regionId, date).filter((sale) => sale.agentId === seller.id)
    const beforePayments = paymentsOn(regionId, date)

    for (const line of input.openings) {
      run(
        `INSERT INTO daily_openings (id, region_id, phone_id, stock_date, opening_qty, received_confirmed, recorded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(region_id, phone_id, stock_date) DO UPDATE SET
           opening_qty = excluded.opening_qty,
           received_confirmed = excluded.received_confirmed,
           recorded_by = excluded.recorded_by,
           updated_at = excluded.updated_at`,
        [id(), regionId, line.phoneId, date, line.quantity, line.confirmed ? 1 : 0, actor.id, stamp, stamp],
      )
    }
    for (const line of input.prices) {
      run(
        `INSERT INTO daily_prices (id, region_id, phone_id, price_date, unit_price, recorded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(region_id, phone_id, price_date) DO UPDATE SET
           unit_price = excluded.unit_price,
           recorded_by = excluded.recorded_by,
           updated_at = excluded.updated_at`,
        [id(), regionId, line.phoneId, date, line.price, actor.id, stamp, stamp],
      )
    }
    run(
      `INSERT INTO cash_days (id, region_id, cash_date, balance_brought_forward, cash_received, closing_balance, recorded_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(region_id, cash_date) DO UPDATE SET
         balance_brought_forward = excluded.balance_brought_forward,
         cash_received = excluded.cash_received,
         closing_balance = excluded.closing_balance,
         recorded_by = excluded.recorded_by,
         updated_at = excluded.updated_at`,
      [id(), regionId, date, broughtForward, input.cashReceived, input.closingBalance, actor.id, stamp, stamp],
    )
    run("DELETE FROM sales WHERE agent_id = ? AND sale_date = ?", [seller.id, date])
    for (const line of input.sales) {
      run(
        `INSERT INTO sales (id, region_id, phone_id, agent_id, sale_date, quantity, recorded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id(), regionId, line.phoneId, seller.id, date, line.quantity, actor.id, stamp, stamp],
      )
    }
    run("DELETE FROM agent_payments WHERE region_id = ? AND pay_date = ?", [regionId, date])
    for (const line of input.payments) {
      run(
        `INSERT INTO agent_payments (id, region_id, agent_id, pay_date, amount, recorded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id(), regionId, line.agentId, date, line.amount, actor.id, stamp, stamp],
      )
    }

    diffRows(
      actor,
      "opening",
      beforeOpen.map((row) => ({ key: row.phoneId, values: { date, region: region.name, phone: labelOf(phoneById, row.phoneId), quantity: row.quantity } })),
      input.openings.map((row) => ({ key: row.phoneId, values: { date, region: region.name, phone: labelOf(phoneById, row.phoneId), quantity: row.quantity } })),
    )
    diffRows(
      actor,
      "price",
      beforePrices.map((row) => ({ key: row.phoneId, values: { date, region: region.name, phone: labelOf(phoneById, row.phoneId), price: row.price } })),
      input.prices.map((row) => ({ key: row.phoneId, values: { date, region: region.name, phone: labelOf(phoneById, row.phoneId), price: row.price } })),
    )
    const sent = sendFor(regionId, date)?.amount ?? null
    const starting = startingCash(broughtForward, input.cashReceived)
    const transactionValue = transactionAmount(starting, input.closingBalance)
    writeAudit(
      actor,
      beforeCash ? "update" : "create",
      "cash_day",
      beforeCash?.id ?? regionId,
      beforeCash
        ? { date, region: region.name, broughtForward: beforeCash.broughtForward, received: beforeCash.received, closing: beforeCash.closing }
        : null,
      { date, region: region.name, broughtForward, received: input.cashReceived, closing: input.closingBalance, transaction: transactionValue },
    )
    diffRows(
      actor,
      "sale",
      beforeSales.map((row) => ({ key: row.phoneId, id: row.id, values: { date, region: region.name, agent: seller.name, phone: labelOf(phoneById, row.phoneId), quantity: row.quantity } })),
      input.sales.map((row) => ({ key: row.phoneId, values: { date, region: region.name, agent: seller.name, phone: labelOf(phoneById, row.phoneId), quantity: row.quantity } })),
    )
    diffRows(
      actor,
      "agent_payment",
      beforePayments.map((row) => ({
        key: row.agentId,
        id: row.id,
        values: { date, region: region.name, agent: getUser(row.agentId)?.name ?? row.agentId, amount: row.amount },
      })),
      input.payments.map((row) => ({
        key: row.agentId,
        values: { date, region: region.name, agent: getUser(row.agentId)?.name ?? row.agentId, amount: row.amount },
      })),
    )
    markSubmitted("lead_closeout", date, regionId, actor.id)
    markSubmitted("agent_sales", date, seller.id, actor.id)
    clearDraft(actor.id, "lead_closeout", date, regionId)

    const allSales = salesOn(regionId, date)
    const payments = people.map((person) => {
      const expected = expectedDeposits(
        allSales
          .filter((sale) => sale.agentId === person.id)
          .map((sale) => ({ quantity: sale.quantity, price: priceByPhone.get(sale.phoneId) ?? 0 })),
      )
      const paid = input.payments.find((line) => line.agentId === person.id)?.amount ?? 0
      return { name: person.name, expected, paid, difference: paid - expected }
    })
    const expected = payments.reduce((sum, line) => sum + line.expected, 0)
    const result: LeadSummary = {
      date,
      region: region.name,
      updated,
      startingCash: starting,
      cashReceived: input.cashReceived,
      sent,
      match: matchText(sent, input.cashReceived),
      broughtForward,
      carriedFrom: carried?.cashDate ?? null,
      closingBalance: input.closingBalance,
      transaction: transactionValue,
      expected,
      depositGap: depositGap(transactionValue, expected),
      units: allSales.reduce((sum, sale) => sum + sale.quantity, 0),
      payments,
    }
    return result
  })
  return { ok: true as const, summary }
}

export function submitAgentSales(actor: CurrentUser, agentId: string, date: string, input: AgentInput) {
  const agent = getUser(agentId)
  if (!agent || !agent.regionId) return fail("That sales agent does not exist.")
  if (!agent.active && actor.id !== agent.id) return fail("That sales agent is deactivated.")
  const regionId = agent.regionId
  const phones = listPhones()
  const phoneById = new Map(phones.map((phone) => [phone.id, phone]))
  if (input.lines.some((line, index) => input.lines.findIndex((other) => other.phoneId === line.phoneId) !== index)) {
    return fail("Each phone can only appear once.")
  }
  for (const line of input.lines) {
    const phone = phoneById.get(line.phoneId)
    if (!phone) return fail("Choose a phone for every line.")
    const existing = agentSalesOn(agentId, date).some((sale) => sale.phoneId === line.phoneId)
    if ((!phone.active || !phone.supplierActive) && !existing) return fail(`${phoneLabel(phone)} is not available for new sales.`)
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) return fail(`Enter a quantity for ${phoneLabel(phone)}.`)
    const available = availableForAgent(regionId, agentId, line.phoneId, date)
    if (line.quantity > available) return fail(`Only ${Math.max(available, 0)} available for ${phoneLabel(phone)}.`)
  }

  const updated = Boolean(submission("agent_sales", date, agentId))
  const summary = transaction(() => {
    const stamp = now()
    const before = agentSalesOn(agentId, date)
    run("DELETE FROM sales WHERE agent_id = ? AND sale_date = ?", [agentId, date])
    for (const line of input.lines) {
      run(
        `INSERT INTO sales (id, region_id, phone_id, agent_id, sale_date, quantity, recorded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id(), regionId, line.phoneId, agentId, date, line.quantity, actor.id, stamp, stamp],
      )
    }
    diffRows(
      actor,
      "sale",
      before.map((row) => ({
        key: row.phoneId,
        id: row.id,
        values: { date, agent: agent.name, phone: labelOf(phoneById, row.phoneId), quantity: row.quantity },
      })),
      input.lines.map((row) => ({
        key: row.phoneId,
        values: { date, agent: agent.name, phone: labelOf(phoneById, row.phoneId), quantity: row.quantity },
      })),
    )
    markSubmitted("agent_sales", date, agentId, actor.id)
    clearDraft(actor.id, "agent_sales", date, agentId)
    const result: AgentSummary = {
      date,
      updated,
      lines: input.lines.map((line) => {
        const phone = phoneById.get(line.phoneId)!
        return { supplier: phone.supplierName, brand: phone.brand, model: phone.model, quantity: line.quantity }
      }),
      units: input.lines.reduce((sum, line) => sum + line.quantity, 0),
    }
    return result
  })
  return { ok: true as const, summary }
}

export function availableForAgent(regionId: string, agentId: string, phoneId: string, date: string) {
  const openingRow = openingsOn(regionId, date).find((row) => row.phoneId === phoneId)
  const received = receivedToday(regionId, phoneId, date)
  const sales = salesOn(regionId, date).filter((sale) => sale.phoneId === phoneId)
  const soldOthers = sales.filter((sale) => sale.agentId !== agentId).reduce((sum, sale) => sum + sale.quantity, 0)
  const allocatedToDate = allocationsOnAll(regionId, phoneId).filter((row) => row.date <= date).reduce((sum, row) => sum + row.quantity, 0)
  const soldToDateExceptMineToday = salesAll(regionId, phoneId)
    .filter((row) => row.date < date || (row.date === date && row.agentId !== agentId))
    .reduce((sum, row) => sum + row.quantity, 0)
  return availableToSell({
    opening: openingRow ? openingRow.quantity : null,
    receivedToday: received,
    soldByOthersToday: soldOthers,
    onHandIfThisLineIsZero: allocatedToDate - soldToDateExceptMineToday,
  })
}

function allocationsOnAll(regionId: string, phoneId: string) {
  return rows<{ date: string; quantity: number }>(
    "SELECT allocated_on AS date, quantity FROM stock_allocations WHERE region_id = ? AND phone_id = ?",
    [regionId, phoneId],
  )
}

function salesAll(regionId: string, phoneId: string) {
  return rows<{ date: string; quantity: number; agentId: string }>(
    "SELECT sale_date AS date, quantity, agent_id AS agentId FROM sales WHERE region_id = ? AND phone_id = ?",
    [regionId, phoneId],
  )
}

function receivedToday(regionId: string, phoneId: string, date: string) {
  return allocationsOn(date)
    .filter((line) => line.regionId === regionId && line.phoneId === phoneId)
    .reduce((sum, line) => sum + line.quantity, 0)
}

function peopleForClose(regionId: string, actor: CurrentUser, date: string) {
  const lead = listRegionLead(regionId)
  const people = new Map<string, { id: string; name: string }>()
  if (lead) people.set(lead.id, lead)
  else if (actor.regionId === regionId) people.set(actor.id, { id: actor.id, name: actor.name })
  for (const agent of agentsInRegion(regionId).filter((user) => user.active)) people.set(agent.id, { id: agent.id, name: agent.name })
  for (const sale of salesOn(regionId, date)) {
    if (!people.has(sale.agentId)) {
      const user = getUser(sale.agentId)
      if (user) people.set(user.id, { id: user.id, name: user.name })
    }
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function listRegionLead(regionId: string) {
  return activeLeads().find((lead) => lead.regionId === regionId) ?? null
}

function labelOf(phoneById: Map<string, { supplierName: string; brand: string; model: string }>, phoneId: string) {
  const phone = phoneById.get(phoneId)
  return phone ? phoneLabel(phone) : phoneId
}

function markSubmitted(flow: string, date: string, scopeId: string, actorId: string) {
  run(
    `INSERT INTO flow_submissions (id, flow, business_date, scope_id, actor_id, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(flow, business_date, scope_id) DO UPDATE SET actor_id = excluded.actor_id, submitted_at = excluded.submitted_at`,
    [id(), flow, date, scopeId, actorId, now()],
  )
}

function clearDraft(userId: string, flow: string, date: string, scopeId: string) {
  run("DELETE FROM drafts WHERE user_id = ? AND flow = ? AND business_date = ? AND scope_id = ?", [userId, flow, date, scopeId])
}

function diffRows(
  actor: CurrentUser,
  entityType: string,
  before: { key: string; id?: string; values: Record<string, string | number | boolean | null> }[],
  after: { key: string; values: Record<string, string | number | boolean | null> }[],
) {
  const beforeMap = new Map(before.map((row) => [row.key, row]))
  const afterMap = new Map(after.map((row) => [row.key, row]))
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()])
  for (const key of keys) {
    const previous = beforeMap.get(key)
    const next = afterMap.get(key)
    const same = previous && next && JSON.stringify(previous.values) === JSON.stringify(next.values)
    if (same) continue
    writeAudit(
      actor,
      previous && next ? "update" : previous ? "delete" : "create",
      entityType,
      previous?.id ?? key,
      previous?.values ?? null,
      next?.values ?? null,
    )
  }
}

export function closeoutPeople(regionId: string, actor: CurrentUser, date: string) {
  return peopleForClose(regionId, actor, date)
}
