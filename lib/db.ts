import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { hashPassword } from "./password"

type SqlValue = string | number | null | bigint

const globalForDb = globalThis as unknown as { rayDb?: DatabaseSync }

function create() {
  const directory = path.join(process.cwd(), "data")
  mkdirSync(directory, { recursive: true })
  const database = new DatabaseSync(path.join(directory, "ray.db"))
  database.exec("PRAGMA foreign_keys = ON")
  database.exec("PRAGMA busy_timeout = 3000")
  database.exec(SCHEMA)
  seed(database)
  return database
}

let migrated = false

export function database() {
  if (!globalForDb.rayDb) globalForDb.rayDb = create()
  if (!migrated) {
    migrate(globalForDb.rayDb)
    migrated = true
  }
  return globalForDb.rayDb
}

export function rows<T>(sql: string, params: SqlValue[] = []) {
  return database().prepare(sql).all(...params).map((row) => ({ ...row })) as T[]
}

export function one<T>(sql: string, params: SqlValue[] = []) {
  const row = database().prepare(sql).get(...params)
  return row ? ({ ...row } as T) : undefined
}

export function run(sql: string, params: SqlValue[] = []) {
  return database().prepare(sql).run(...params)
}

export function transaction<T>(fn: () => T) {
  const db = database()
  db.exec("BEGIN")
  try {
    const result = fn()
    db.exec("COMMIT")
    return result
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

export function id() {
  return randomUUID()
}

export function now() {
  return new Date().toISOString()
}

export function friendlyError(error: unknown) {
  const text = error instanceof Error ? error.message : ""
  if (text.includes("suppliers_name_lower")) return "A supplier with that name already exists."
  if (text.includes("phones_identity")) return "That brand and model is already listed for this supplier."
  if (text.includes("regions_name_lower")) return "That region already exists."
  if (text.includes("users_email_lower")) return "That email is already in use."
  if (text.includes("users_one_active_lead")) return "That region already has an active sales lead."
  return "Something went wrong. Please try again."
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS regions_name_lower ON regions(lower(name));

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN','SALES_LEAD','SALES_AGENT')),
  region_id TEXT REFERENCES regions(id),
  lead_id TEXT REFERENCES users(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users(lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_one_active_lead ON users(region_id) WHERE role = 'SALES_LEAD' AND is_active = 1;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_lower ON suppliers(lower(name));

CREATE TABLE IF NOT EXISTS phones (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS phones_identity ON phones(supplier_id, lower(brand), lower(model));

CREATE TABLE IF NOT EXISTS catalogue_seen (
  user_id TEXT NOT NULL REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  seen_at TEXT NOT NULL,
  PRIMARY KEY (user_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS stock_receipts (
  id TEXT PRIMARY KEY,
  phone_id TEXT NOT NULL REFERENCES phones(id),
  quantity INTEGER NOT NULL CHECK(quantity >= 0),
  received_on TEXT NOT NULL,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_allocations (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES regions(id),
  phone_id TEXT NOT NULL REFERENCES phones(id),
  quantity INTEGER NOT NULL CHECK(quantity >= 0),
  allocated_on TEXT NOT NULL,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_prices (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES regions(id),
  phone_id TEXT NOT NULL REFERENCES phones(id),
  price_date TEXT NOT NULL,
  unit_price INTEGER NOT NULL CHECK(unit_price >= 0),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(region_id, phone_id, price_date)
);

CREATE TABLE IF NOT EXISTS daily_openings (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES regions(id),
  phone_id TEXT NOT NULL REFERENCES phones(id),
  stock_date TEXT NOT NULL,
  opening_qty INTEGER NOT NULL CHECK(opening_qty >= 0),
  received_confirmed INTEGER NOT NULL DEFAULT 0,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(region_id, phone_id, stock_date)
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES regions(id),
  phone_id TEXT NOT NULL REFERENCES phones(id),
  agent_id TEXT NOT NULL REFERENCES users(id),
  sale_date TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(agent_id, phone_id, sale_date)
);

CREATE TABLE IF NOT EXISTS cash_sends (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES regions(id),
  lead_id TEXT NOT NULL REFERENCES users(id),
  send_date TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount >= 0),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(region_id, send_date)
);

CREATE TABLE IF NOT EXISTS cash_days (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES regions(id),
  cash_date TEXT NOT NULL,
  balance_brought_forward INTEGER NOT NULL CHECK(balance_brought_forward >= 0),
  cash_received INTEGER NOT NULL CHECK(cash_received >= 0),
  closing_balance INTEGER CHECK(closing_balance IS NULL OR closing_balance >= 0),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(region_id, cash_date)
);

CREATE TABLE IF NOT EXISTS agent_payments (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES regions(id),
  agent_id TEXT NOT NULL REFERENCES users(id),
  pay_date TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount >= 0),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(agent_id, pay_date)
);

CREATE TABLE IF NOT EXISTS drafts (
  user_id TEXT NOT NULL REFERENCES users(id),
  flow TEXT NOT NULL,
  business_date TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  step INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, flow, business_date, scope_id)
);

CREATE TABLE IF NOT EXISTS flow_submissions (
  id TEXT PRIMARY KEY,
  flow TEXT NOT NULL,
  business_date TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id),
  submitted_at TEXT NOT NULL,
  UNIQUE(flow, business_date, scope_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS sales_date ON sales(sale_date);
`

function seed(db: DatabaseSync) {
  const stamp = now()
  const regionNames = ["Mombasa", "Nyandarua"]
  for (const name of regionNames) {
    const existing = db.prepare("SELECT id FROM regions WHERE lower(name) = lower(?)").get(name) as { id: string } | undefined
    if (!existing) db.prepare("INSERT INTO regions (id, name, created_at) VALUES (?, ?, ?)").run(id(), name, stamp)
  }
  const existingAdmin = db.prepare("SELECT id FROM users WHERE lower(email) = 'admin@ray.test'").get()
  if (existingAdmin) return

  const regionList = db.prepare("SELECT id, name FROM regions").all() as { id: string; name: string }[]
  const regionId = (name: string) => regionList.find((region) => region.name === name)!.id
  const password = hashPassword("Ray-demo-2026")
  const insert = db.prepare(
    `INSERT INTO users (id, email, password_hash, name, role, region_id, lead_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  )
  const adminId = id()
  const mombasaLead = id()
  const nyandaruaLead = id()
  insert.run(adminId, "admin@ray.test", password, "Ray Admin", "ADMIN", null, null, stamp, stamp)
  insert.run(mombasaLead, "mombasa.lead@ray.test", password, "Mombasa Lead", "SALES_LEAD", regionId("Mombasa"), null, stamp, stamp)
  insert.run(nyandaruaLead, "nyandarua.lead@ray.test", password, "Nyandarua Lead", "SALES_LEAD", regionId("Nyandarua"), null, stamp, stamp)
  insert.run(id(), "mombasa.agent@ray.test", password, "Mombasa Agent", "SALES_AGENT", regionId("Mombasa"), mombasaLead, stamp, stamp)
  insert.run(id(), "mombasa.agent2@ray.test", password, "Mombasa Agent Two", "SALES_AGENT", regionId("Mombasa"), mombasaLead, stamp, stamp)
  insert.run(id(), "nyandarua.agent@ray.test", password, "Nyandarua Agent", "SALES_AGENT", regionId("Nyandarua"), nyandaruaLead, stamp, stamp)
}

function migrate(db: DatabaseSync) {
  const columns = db.prepare("PRAGMA table_info(phones)").all() as { name: string }[]
  if (!columns.some((column) => column.name === "deposit_amount")) {
    db.exec("ALTER TABLE phones ADD COLUMN deposit_amount INTEGER NOT NULL DEFAULT 0")
  }
  db.exec(`
    UPDATE phones SET deposit_amount = (
      SELECT dp.unit_price FROM daily_prices dp WHERE dp.phone_id = phones.id ORDER BY dp.price_date DESC LIMIT 1
    )
    WHERE deposit_amount = 0 AND EXISTS (SELECT 1 FROM daily_prices dp WHERE dp.phone_id = phones.id)
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_cash_sends (
      id TEXT PRIMARY KEY,
      region_id TEXT NOT NULL REFERENCES regions(id),
      agent_id TEXT NOT NULL REFERENCES users(id),
      send_date TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK(amount >= 0),
      recorded_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(agent_id, send_date)
    );
  `)
  const copied = db.prepare("SELECT COUNT(*) AS n FROM agent_cash_sends").get() as { n: number }
  if (copied.n === 0) {
    db.exec(`
      INSERT INTO agent_cash_sends (id, region_id, agent_id, send_date, amount, recorded_by, created_at, updated_at)
      SELECT id, region_id, lead_id, send_date, amount, recorded_by, created_at, updated_at FROM cash_sends
    `)
  }
  seedRegionalView(db)
  keepOneAgent(db)
}

function keepOneAgent(db: DatabaseSync) {
  const agents = db.prepare(
    "SELECT id, region_id AS regionId FROM users WHERE role = 'SALES_AGENT' AND is_active = 1 ORDER BY created_at, name, id",
  ).all() as { id: string; regionId: string }[]
  const seen = new Set<string>()
  const stamp = now()
  for (const agent of agents) {
    if (!seen.has(agent.regionId)) {
      seen.add(agent.regionId)
      continue
    }
    db.prepare("UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?").run(stamp, agent.id)
  }
}

function seedRegionalView(db: DatabaseSync) {
  const phone = db.prepare(`
    SELECT p.id FROM phones p
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.is_active = 1 AND s.is_active = 1
    ORDER BY CASE WHEN p.deposit_amount > 0 THEN 0 ELSE 1 END, p.created_at
    LIMIT 1
  `).get() as { id: string } | undefined
  if (!phone) return
  const already = db.prepare("SELECT id FROM sales LIMIT 1").get()
  if (already) return
  const admin = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1").get() as { id: string } | undefined
  if (!admin) return
  const regionRows = db.prepare(`
    SELECT r.id, r.name, u.id AS leadId
    FROM regions r
    JOIN users u ON u.region_id = r.id AND u.role = 'SALES_LEAD' AND u.is_active = 1
  `).all() as { id: string; name: string; leadId: string }[]
  const plan: [string, string, number][] = [
    ["2026-10-06", "Mombasa", 20],
    ["2026-10-06", "Nyandarua", 8],
    ["2026-10-07", "Mombasa", 16],
    ["2026-10-07", "Nyandarua", 11],
    ["2026-10-08", "Mombasa", 24],
    ["2026-10-08", "Nyandarua", 6],
    ["2026-10-09", "Mombasa", 19],
    ["2026-10-09", "Nyandarua", 14],
    ["2026-10-10", "Mombasa", 28],
    ["2026-10-10", "Nyandarua", 9],
    ["2026-10-12", "Mombasa", 26],
    ["2026-10-12", "Nyandarua", 15],
    ["2026-10-13", "Mombasa", 21],
    ["2026-10-13", "Nyandarua", 12],
    ["2026-10-14", "Mombasa", 33],
    ["2026-10-14", "Nyandarua", 18],
    ["2026-10-15", "Mombasa", 17],
    ["2026-10-15", "Nyandarua", 10],
    ["2026-10-16", "Nyandarua", 12],
  ]
  const stamp = now()
  const sale = db.prepare(
    `INSERT INTO sales (id, region_id, phone_id, agent_id, sale_date, quantity, recorded_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const allocation = db.prepare(
    `INSERT INTO stock_allocations (id, region_id, phone_id, quantity, allocated_on, recorded_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const receipt = db.prepare(
    `INSERT INTO stock_receipts (id, phone_id, quantity, received_on, recorded_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const taken = db.prepare("SELECT id FROM sales WHERE agent_id = ? AND phone_id = ? AND sale_date = ?")
  db.exec("BEGIN")
  try {
    for (const [date, name, quantity] of plan) {
      const region = regionRows.find((item) => item.name.toLowerCase() === name.toLowerCase())
      if (!region || taken.get(region.leadId, phone.id, date)) continue
      sale.run(id(), region.id, phone.id, region.leadId, date, quantity, admin.id, stamp, stamp)
      allocation.run(id(), region.id, phone.id, quantity, date, admin.id, stamp, stamp)
      receipt.run(id(), phone.id, quantity, date, admin.id, stamp, stamp)
    }
    const nyandarua = regionRows.find((item) => item.name.toLowerCase() === "nyandarua")
    if (nyandarua) {
      const cash = db.prepare("SELECT id FROM cash_days WHERE region_id = ? AND cash_date = '2026-10-16'").get(nyandarua.id)
      if (!cash) {
        db.prepare(
          `INSERT INTO cash_days (id, region_id, cash_date, balance_brought_forward, cash_received, closing_balance, recorded_by, created_at, updated_at)
           VALUES (?, ?, '2026-10-16', 15000, 45000, 18000, ?, ?, ?)`,
        ).run(id(), nyandarua.id, nyandarua.leadId, stamp, stamp)
      }
      db.prepare(
        `INSERT INTO agent_cash_sends (id, region_id, agent_id, send_date, amount, recorded_by, created_at, updated_at)
         VALUES (?, ?, ?, '2026-10-16', 45000, ?, ?, ?)
         ON CONFLICT(agent_id, send_date) DO UPDATE SET amount = 45000, updated_at = excluded.updated_at
         WHERE agent_cash_sends.amount = 0`,
      ).run(id(), nyandarua.id, nyandarua.leadId, admin.id, stamp, stamp)
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}
