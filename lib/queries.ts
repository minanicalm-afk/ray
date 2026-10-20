import { one, rows } from "./db"
import type { PhoneRow, RegionRow, Role, SupplierRow, UserRow } from "./types"

type PhoneSql = Omit<PhoneRow, "active" | "supplierActive"> & { active: number; supplierActive: number }
type SupplierSql = Omit<SupplierRow, "active"> & { active: number }
type UserSql = Omit<UserRow, "active"> & { active: number }

function mapPhone(row: PhoneSql): PhoneRow {
  return { ...row, active: row.active === 1, supplierActive: row.supplierActive === 1 }
}

function mapSupplier(row: SupplierSql): SupplierRow {
  return { ...row, active: row.active === 1 }
}

function mapUser(row: UserSql): UserRow {
  return { ...row, active: row.active === 1 }
}

const phoneSql = `
  SELECT p.id, p.supplier_id AS supplierId, s.name AS supplierName, p.brand, p.model, p.deposit_amount AS deposit,
         p.is_active AS active, s.is_active AS supplierActive,
         p.created_at AS createdAt, p.updated_at AS updatedAt,
         cu.name AS createdByName, uu.name AS updatedByName
  FROM phones p
  JOIN suppliers s ON s.id = p.supplier_id
  JOIN users cu ON cu.id = p.created_by
  JOIN users uu ON uu.id = p.updated_by
`

const supplierSql = `
  SELECT s.id, s.name, s.is_active AS active, s.created_at AS createdAt, s.updated_at AS updatedAt,
         cu.name AS createdByName, uu.name AS updatedByName
  FROM suppliers s
  JOIN users cu ON cu.id = s.created_by
  JOIN users uu ON uu.id = s.updated_by
`

const userSql = `
  SELECT u.id, u.email, u.name, u.role, u.region_id AS regionId, r.name AS regionName,
         u.lead_id AS leadId, lead.name AS leadName, u.is_active AS active, u.created_at AS createdAt
  FROM users u
  LEFT JOIN regions r ON r.id = u.region_id
  LEFT JOIN users lead ON lead.id = u.lead_id
`

export function listRegions() {
  return rows<RegionRow>("SELECT id, name FROM regions ORDER BY name")
}

export function listSuppliers() {
  return rows<SupplierSql>(`${supplierSql} ORDER BY s.name`).map(mapSupplier)
}

export function getSupplier(id: string) {
  const row = one<SupplierSql>(`${supplierSql} WHERE s.id = ?`, [id])
  return row ? mapSupplier(row) : null
}

export function listPhones() {
  return rows<PhoneSql>(`${phoneSql} ORDER BY s.name, p.brand, p.model`).map(mapPhone)
}

export function phonesForSupplier(supplierId: string) {
  return listPhones().filter((phone) => phone.supplierId === supplierId)
}

export function listUsers() {
  return rows<UserSql>(`${userSql} ORDER BY u.name`).map(mapUser)
}

export function getUser(id: string) {
  const row = one<UserSql>(`${userSql} WHERE u.id = ?`, [id])
  return row ? mapUser(row) : null
}

export function activeLeads() {
  return listUsers().filter((user) => user.role === "SALES_LEAD" && user.active)
}

export function agentsInRegion(regionId: string) {
  return listUsers().filter((user) => user.role === "SALES_AGENT" && user.regionId === regionId)
}

export function seenMap(userId: string) {
  const records = rows<{ entityType: string; entityId: string; seenAt: string }>(
    "SELECT entity_type AS entityType, entity_id AS entityId, seen_at AS seenAt FROM catalogue_seen WHERE user_id = ?",
    [userId],
  )
  const map = new Map<string, string>()
  for (const record of records) map.set(`${record.entityType}:${record.entityId}`, record.seenAt)
  return map
}

export function sumQuantity(sql: string, params: Array<string | number | null>) {
  return one<{ n: number }>(sql, params)?.n ?? 0
}

export function centralUnallocated(phoneId: string, exceptDate?: string) {
  const received = sumQuantity(
    `SELECT COALESCE(SUM(quantity), 0) AS n FROM stock_receipts WHERE phone_id = ? ${exceptDate ? "AND received_on <> ?" : ""}`,
    exceptDate ? [phoneId, exceptDate] : [phoneId],
  )
  const allocated = sumQuantity(
    `SELECT COALESCE(SUM(quantity), 0) AS n FROM stock_allocations WHERE phone_id = ? ${exceptDate ? "AND allocated_on <> ?" : ""}`,
    exceptDate ? [phoneId, exceptDate] : [phoneId],
  )
  return received - allocated
}

export function movements(phoneId: string) {
  return {
    receipts: rows<{ date: string; quantity: number }>(
      "SELECT received_on AS date, quantity FROM stock_receipts WHERE phone_id = ?",
      [phoneId],
    ),
    allocations: rows<{ date: string; quantity: number; regionId: string }>(
      "SELECT allocated_on AS date, quantity, region_id AS regionId FROM stock_allocations WHERE phone_id = ?",
      [phoneId],
    ),
    sales: rows<{ date: string; quantity: number; regionId: string; agentId: string }>(
      "SELECT sale_date AS date, quantity, region_id AS regionId, agent_id AS agentId FROM sales WHERE phone_id = ?",
      [phoneId],
    ),
    openings: rows<{ date: string; quantity: number; regionId: string; confirmed: number }>(
      "SELECT stock_date AS date, opening_qty AS quantity, region_id AS regionId, received_confirmed AS confirmed FROM daily_openings WHERE phone_id = ?",
      [phoneId],
    ),
  }
}

export function receiptsOn(date: string) {
  return rows<{ id: string; phoneId: string; quantity: number }>(
    "SELECT id, phone_id AS phoneId, quantity FROM stock_receipts WHERE received_on = ?",
    [date],
  )
}

export function allocationsOn(date: string) {
  return rows<{ id: string; phoneId: string; regionId: string; quantity: number }>(
    "SELECT id, phone_id AS phoneId, region_id AS regionId, quantity FROM stock_allocations WHERE allocated_on = ?",
    [date],
  )
}

export function sendsOn(date: string) {
  return rows<{ id: string; agentId: string; regionId: string; amount: number }>(
    "SELECT id, agent_id AS agentId, region_id AS regionId, amount FROM agent_cash_sends WHERE send_date = ?",
    [date],
  )
}

export function sendFor(regionId: string, date: string) {
  const row = one<{ amount: number | null; n: number }>(
    "SELECT SUM(amount) AS amount, COUNT(*) AS n FROM agent_cash_sends WHERE region_id = ? AND send_date = ?",
    [regionId, date],
  )
  if (!row || row.n === 0 || row.amount === null) return undefined
  return { amount: row.amount }
}

export function cashDay(regionId: string, date: string) {
  return one<{
    id: string
    broughtForward: number
    received: number
    closing: number | null
  }>(
    `SELECT id, balance_brought_forward AS broughtForward, cash_received AS received, closing_balance AS closing
     FROM cash_days WHERE region_id = ? AND cash_date = ?`,
    [regionId, date],
  )
}

export function previousClosing(regionId: string, date: string) {
  return one<{ cashDate: string; closing: number }>(
    `SELECT cash_date AS cashDate, closing_balance AS closing FROM cash_days
     WHERE region_id = ? AND cash_date < ? AND closing_balance IS NOT NULL
     ORDER BY cash_date DESC LIMIT 1`,
    [regionId, date],
  )
}

export function openingsOn(regionId: string, date: string) {
  return rows<{ phoneId: string; quantity: number; confirmed: number }>(
    "SELECT phone_id AS phoneId, opening_qty AS quantity, received_confirmed AS confirmed FROM daily_openings WHERE region_id = ? AND stock_date = ?",
    [regionId, date],
  )
}

export function pricesOn(regionId: string, date: string) {
  return rows<{ phoneId: string; price: number }>(
    "SELECT phone_id AS phoneId, unit_price AS price FROM daily_prices WHERE region_id = ? AND price_date = ?",
    [regionId, date],
  )
}

export function salesOn(regionId: string, date: string) {
  return rows<{ id: string; phoneId: string; agentId: string; quantity: number }>(
    "SELECT id, phone_id AS phoneId, agent_id AS agentId, quantity FROM sales WHERE region_id = ? AND sale_date = ?",
    [regionId, date],
  )
}

export function agentSalesOn(agentId: string, date: string) {
  return rows<{ id: string; phoneId: string; quantity: number }>(
    "SELECT id, phone_id AS phoneId, quantity FROM sales WHERE agent_id = ? AND sale_date = ?",
    [agentId, date],
  )
}

export function paymentsOn(regionId: string, date: string) {
  return rows<{ id: string; agentId: string; amount: number }>(
    "SELECT id, agent_id AS agentId, amount FROM agent_payments WHERE region_id = ? AND pay_date = ?",
    [regionId, date],
  )
}

export function submission(flow: string, date: string, scopeId: string) {
  return one<{ submittedAt: string }>(
    "SELECT submitted_at AS submittedAt FROM flow_submissions WHERE flow = ? AND business_date = ? AND scope_id = ?",
    [flow, date, scopeId],
  )
}

export function readDraft(userId: string, flow: string, date: string, scopeId: string) {
  return one<{ step: number; payload: string; updatedAt: string }>(
    "SELECT step, payload, updated_at AS updatedAt FROM drafts WHERE user_id = ? AND flow = ? AND business_date = ? AND scope_id = ?",
    [userId, flow, date, scopeId],
  )
}

export function saleRows() {
  return rows<{
    saleDate: string
    regionId: string
    regionName: string
    supplierId: string
    supplierName: string
    phoneId: string
    brand: string
    model: string
    phoneCreatedAt: string
    agentId: string
    agentName: string
    leadId: string | null
    quantity: number
    price: number | null
  }>(`
    SELECT s.sale_date AS saleDate, s.region_id AS regionId, r.name AS regionName,
           p.supplier_id AS supplierId, sup.name AS supplierName, p.id AS phoneId, p.brand, p.model,
           p.created_at AS phoneCreatedAt, s.agent_id AS agentId, u.name AS agentName, u.lead_id AS leadId,
           s.quantity, COALESCE(dp.unit_price, NULLIF(p.deposit_amount, 0)) AS price
    FROM sales s
    JOIN regions r ON r.id = s.region_id
    JOIN phones p ON p.id = s.phone_id
    JOIN suppliers sup ON sup.id = p.supplier_id
    JOIN users u ON u.id = s.agent_id
    LEFT JOIN daily_prices dp ON dp.region_id = s.region_id AND dp.phone_id = s.phone_id AND dp.price_date = s.sale_date
  `)
}

export function cashRows() {
  return rows<{
    cashDate: string
    regionId: string
    regionName: string
    leadId: string | null
    broughtForward: number
    received: number
    closing: number | null
  }>(`
    SELECT c.cash_date AS cashDate, c.region_id AS regionId, r.name AS regionName, lead.id AS leadId,
           c.balance_brought_forward AS broughtForward, c.cash_received AS received, c.closing_balance AS closing
    FROM cash_days c
    JOIN regions r ON r.id = c.region_id
    LEFT JOIN users lead ON lead.region_id = c.region_id AND lead.role = 'SALES_LEAD' AND lead.is_active = 1
  `)
}

export function allSends() {
  return rows<{ sendDate: string; regionId: string; regionName: string; leadId: string; leadName: string; amount: number }>(`
    SELECT s.send_date AS sendDate, s.region_id AS regionId, r.name AS regionName,
           COALESCE(lead.id, '') AS leadId, COALESCE(lead.name, '') AS leadName, SUM(s.amount) AS amount
    FROM agent_cash_sends s
    JOIN regions r ON r.id = s.region_id
    LEFT JOIN users lead ON lead.region_id = s.region_id AND lead.role = 'SALES_LEAD' AND lead.is_active = 1
    GROUP BY s.send_date, s.region_id
  `)
}

export function auditRows() {
  return rows<{
    id: string
    createdAt: string
    actorId: string
    actorName: string
    actorRole: Role
    action: string
    entityType: string
    entityId: string
    beforeJson: string | null
    afterJson: string | null
  }>(`
    SELECT a.id, a.created_at AS createdAt, a.actor_id AS actorId, u.name AS actorName, a.actor_role AS actorRole,
           a.action, a.entity_type AS entityType, a.entity_id AS entityId, a.before_json AS beforeJson, a.after_json AS afterJson
    FROM audit_logs a
    JOIN users u ON u.id = a.actor_id
    ORDER BY a.created_at DESC
  `)
}

export function countActive(table: "suppliers" | "phones" | "users") {
  return one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE is_active = 1`)?.n ?? 0
}
