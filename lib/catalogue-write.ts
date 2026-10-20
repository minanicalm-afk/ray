import { writeAudit } from "./audit"
import { id, now, one, run, transaction } from "./db"
import { cleanText, sameText } from "./format"
import { getSupplier, phonesForSupplier } from "./queries"
import type { CurrentUser } from "./types"

export function createSupplier(actor: CurrentUser, name: string, phones: { brand: string; model: string; deposit: number }[]) {
  const supplierName = cleanText(name)
  if (!supplierName) return { ok: false as const, error: "Enter the supplier name." }
  if (supplierName.length > 120) return { ok: false as const, error: "Supplier name is too long." }
  const cleaned = phones.map((phone) => ({ brand: cleanText(phone.brand), model: cleanText(phone.model), deposit: phone.deposit }))
  if (cleaned.length === 0) return { ok: false as const, error: "Add at least one phone." }
  for (const phone of cleaned) {
    if (!phone.brand || !phone.model) return { ok: false as const, error: "Enter a brand and model for every phone." }
    if (phone.brand.length > 80 || phone.model.length > 80) return { ok: false as const, error: "Brand or model is too long." }
    if (!Number.isInteger(phone.deposit) || phone.deposit < 0) return { ok: false as const, error: "Enter a deposit amount for every phone." }
  }
  if (cleaned.some((phone, index) => cleaned.findIndex((other) => sameText(other.brand, phone.brand) && sameText(other.model, phone.model)) !== index)) {
    return { ok: false as const, error: "The same brand and model cannot be entered twice under one supplier." }
  }
  const taken = one("SELECT id FROM suppliers WHERE lower(name) = lower(?)", [supplierName])
  if (taken) return { ok: false as const, error: "A supplier with that name already exists." }
  const supplierId = id()
  transaction(() => {
    const stamp = now()
    run(
      `INSERT INTO suppliers (id, name, is_active, created_by, updated_by, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?, ?)`,
      [supplierId, supplierName, actor.id, actor.id, stamp, stamp],
    )
    writeAudit(actor, "create", "supplier", supplierId, null, { name: supplierName, active: true })
    for (const phone of cleaned) {
      const phoneId = id()
      run(
        `INSERT INTO phones (id, supplier_id, brand, model, deposit_amount, is_active, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [phoneId, supplierId, phone.brand, phone.model, phone.deposit, actor.id, actor.id, stamp, stamp],
      )
      writeAudit(actor, "create", "phone", phoneId, null, { supplier: supplierName, brand: phone.brand, model: phone.model, deposit: phone.deposit, active: true })
    }
  })
  return { ok: true as const, id: supplierId }
}

export function updateSupplierName(actor: CurrentUser, supplierId: string, name: string) {
  const supplier = getSupplier(supplierId)
  if (!supplier) return { ok: false as const, error: "That supplier does not exist." }
  const supplierName = cleanText(name)
  if (!supplierName) return { ok: false as const, error: "Enter the supplier name." }
  const taken = one<{ id: string }>("SELECT id FROM suppliers WHERE lower(name) = lower(?) AND id <> ?", [supplierName, supplierId])
  if (taken) return { ok: false as const, error: "A supplier with that name already exists." }
  if (supplierName === supplier.name) return { ok: true as const }
  const stamp = now()
  transaction(() => {
    run("UPDATE suppliers SET name = ?, updated_by = ?, updated_at = ? WHERE id = ?", [supplierName, actor.id, stamp, supplierId])
    writeAudit(actor, "update", "supplier", supplierId, { name: supplier.name }, { name: supplierName })
  })
  return { ok: true as const }
}

export function setSupplierActive(actor: CurrentUser, supplierId: string, active: boolean) {
  const supplier = getSupplier(supplierId)
  if (!supplier) return { ok: false as const, error: "That supplier does not exist." }
  if (supplier.active === active) return { ok: true as const }
  const stamp = now()
  transaction(() => {
    run("UPDATE suppliers SET is_active = ?, updated_by = ?, updated_at = ? WHERE id = ?", [active ? 1 : 0, actor.id, stamp, supplierId])
    writeAudit(actor, active ? "reactivate" : "deactivate", "supplier", supplierId, { name: supplier.name, active: supplier.active }, { name: supplier.name, active })
  })
  return { ok: true as const }
}

export function addPhone(actor: CurrentUser, supplierId: string, brand: string, model: string, deposit: number) {
  const supplier = getSupplier(supplierId)
  if (!supplier) return { ok: false as const, error: "That supplier does not exist." }
  const phoneBrand = cleanText(brand)
  const phoneModel = cleanText(model)
  if (!phoneBrand || !phoneModel) return { ok: false as const, error: "Enter a brand and model." }
  if (!Number.isInteger(deposit) || deposit < 0) return { ok: false as const, error: "Enter a deposit amount." }
  const existing = phonesForSupplier(supplierId).find((phone) => sameText(phone.brand, phoneBrand) && sameText(phone.model, phoneModel))
  if (existing) return { ok: false as const, error: "The same brand and model cannot be entered twice under one supplier." }
  const phoneId = id()
  const stamp = now()
  transaction(() => {
    run(
      `INSERT INTO phones (id, supplier_id, brand, model, deposit_amount, is_active, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [phoneId, supplierId, phoneBrand, phoneModel, deposit, actor.id, actor.id, stamp, stamp],
    )
    run("UPDATE suppliers SET updated_by = ?, updated_at = ? WHERE id = ?", [actor.id, stamp, supplierId])
    writeAudit(actor, "create", "phone", phoneId, null, { supplier: supplier.name, brand: phoneBrand, model: phoneModel, deposit, active: true })
  })
  return { ok: true as const }
}

export function updatePhone(actor: CurrentUser, phoneId: string, brand: string, model: string, deposit: number) {
  const phone = phonesForSupplierQuery(phoneId)
  if (!phone) return { ok: false as const, error: "That phone does not exist." }
  const phoneBrand = cleanText(brand)
  const phoneModel = cleanText(model)
  if (!phoneBrand || !phoneModel) return { ok: false as const, error: "Enter a brand and model." }
  if (!Number.isInteger(deposit) || deposit < 0) return { ok: false as const, error: "Enter a deposit amount." }
  const existing = phonesForSupplier(phone.supplierId).find(
    (item) => item.id !== phoneId && sameText(item.brand, phoneBrand) && sameText(item.model, phoneModel),
  )
  if (existing) return { ok: false as const, error: "The same brand and model cannot be entered twice under one supplier." }
  if (phoneBrand === phone.brand && phoneModel === phone.model && deposit === phone.deposit) return { ok: true as const }
  const stamp = now()
  transaction(() => {
    run("UPDATE phones SET brand = ?, model = ?, deposit_amount = ?, updated_by = ?, updated_at = ? WHERE id = ?", [phoneBrand, phoneModel, deposit, actor.id, stamp, phoneId])
    run("UPDATE suppliers SET updated_by = ?, updated_at = ? WHERE id = ?", [actor.id, stamp, phone.supplierId])
    writeAudit(
      actor,
      "update",
      "phone",
      phoneId,
      { supplier: phone.supplierName, brand: phone.brand, model: phone.model, deposit: phone.deposit },
      { supplier: phone.supplierName, brand: phoneBrand, model: phoneModel, deposit },
    )
  })
  return { ok: true as const }
}

export function setPhoneActive(actor: CurrentUser, phoneId: string, active: boolean) {
  const phone = phonesForSupplierQuery(phoneId)
  if (!phone) return { ok: false as const, error: "That phone does not exist." }
  if (phone.active === active) return { ok: true as const }
  const stamp = now()
  transaction(() => {
    run("UPDATE phones SET is_active = ?, updated_by = ?, updated_at = ? WHERE id = ?", [active ? 1 : 0, actor.id, stamp, phoneId])
    writeAudit(
      actor,
      active ? "reactivate" : "deactivate",
      "phone",
      phoneId,
      { supplier: phone.supplierName, brand: phone.brand, model: phone.model, active: phone.active },
      { supplier: phone.supplierName, brand: phone.brand, model: phone.model, active },
    )
  })
  return { ok: true as const }
}

export function markSeen(actor: CurrentUser, phoneIds: string[], supplierIds: string[]) {
  const stamp = now()
  transaction(() => {
    for (const phoneId of phoneIds) {
      run(
        `INSERT INTO catalogue_seen (user_id, entity_type, entity_id, seen_at) VALUES (?, 'phone', ?, ?)
         ON CONFLICT(user_id, entity_type, entity_id) DO UPDATE SET seen_at = excluded.seen_at`,
        [actor.id, phoneId, stamp],
      )
    }
    for (const supplierId of supplierIds) {
      run(
        `INSERT INTO catalogue_seen (user_id, entity_type, entity_id, seen_at) VALUES (?, 'supplier', ?, ?)
         ON CONFLICT(user_id, entity_type, entity_id) DO UPDATE SET seen_at = excluded.seen_at`,
        [actor.id, supplierId, stamp],
      )
    }
  })
}

function phonesForSupplierQuery(phoneId: string) {
  const row = one<{ id: string; supplierId: string; supplierName: string; brand: string; model: string; deposit: number; active: number }>(
    `SELECT p.id, p.supplier_id AS supplierId, s.name AS supplierName, p.brand, p.model, p.deposit_amount AS deposit, p.is_active AS active
     FROM phones p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`,
    [phoneId],
  )
  return row ? { ...row, active: row.active === 1 } : null
}
