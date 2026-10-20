import { writeAudit } from "./audit"
import { id, now, run, transaction } from "./db"
import { allocationsOn, centralUnallocated, listPhones, listRegions } from "./queries"
import type { CurrentUser } from "./types"

function phoneLabel(phone: { supplierName: string; brand: string; model: string }) {
  return `${phone.supplierName} · ${phone.brand} ${phone.model}`
}

export function recordReceipt(actor: CurrentUser, date: string, phoneId: string, quantity: number) {
  const phone = listPhones().find((item) => item.id === phoneId)
  if (!phone || !phone.active || !phone.supplierActive) return { ok: false as const, error: "Choose an active phone." }
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false as const, error: `Enter a quantity for ${phoneLabel(phone)}.` }
  const receiptId = id()
  const stamp = now()
  transaction(() => {
    run(
      `INSERT INTO stock_receipts (id, phone_id, quantity, received_on, recorded_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [receiptId, phoneId, quantity, date, actor.id, stamp, stamp],
    )
    writeAudit(actor, "create", "stock_receipt", receiptId, null, {
      date,
      phone: phoneLabel(phone),
      quantity,
    })
  })
  return { ok: true as const }
}

export function updateAllocation(actor: CurrentUser, date: string, phoneId: string, regionId: string, quantity: number) {
  const phone = listPhones().find((item) => item.id === phoneId)
  const region = listRegions().find((item) => item.id === regionId)
  if (!phone || !region) return { ok: false as const, error: "Choose a phone and a region." }
  if (!phone.active || !phone.supplierActive) return { ok: false as const, error: "Choose an active phone." }
  if (!Number.isInteger(quantity) || quantity < 0) return { ok: false as const, error: `Enter a whole number for ${phoneLabel(phone)}.` }
  const current = allocationsOn(date)
    .filter((row) => row.phoneId === phoneId && row.regionId === regionId)
    .reduce((sum, row) => sum + row.quantity, 0)
  const available = centralUnallocated(phoneId) + current
  if (quantity > available) return { ok: false as const, error: `Only ${available} available for ${phoneLabel(phone)}.` }
  const stamp = now()
  transaction(() => {
    run("DELETE FROM stock_allocations WHERE phone_id = ? AND region_id = ? AND allocated_on = ?", [phoneId, regionId, date])
    if (quantity > 0) {
      run(
        `INSERT INTO stock_allocations (id, region_id, phone_id, quantity, allocated_on, recorded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id(), regionId, phoneId, quantity, date, actor.id, stamp, stamp],
      )
    }
    writeAudit(
      actor,
      "update",
      "stock_allocation",
      `${phoneId}:${regionId}:${date}`,
      { date, phone: phoneLabel(phone), region: region.name, quantity: current },
      { date, phone: phoneLabel(phone), region: region.name, quantity },
    )
  })
  return { ok: true as const }
}
