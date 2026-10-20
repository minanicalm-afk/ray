export type Role = "ADMIN" | "SALES_LEAD" | "SALES_AGENT"

export type CurrentUser = {
  id: string
  email: string
  name: string
  role: Role
  regionId: string | null
  regionName: string | null
  leadId: string | null
}

export type PhoneRow = {
  id: string
  supplierId: string
  supplierName: string
  brand: string
  model: string
  deposit: number
  active: boolean
  supplierActive: boolean
  createdAt: string
  updatedAt: string
  createdByName: string
  updatedByName: string
}

export type SupplierRow = {
  id: string
  name: string
  active: boolean
  createdAt: string
  updatedAt: string
  createdByName: string
  updatedByName: string
}

export type RegionRow = { id: string; name: string }
export type UserRow = {
  id: string
  email: string
  name: string
  role: Role
  regionId: string | null
  regionName: string | null
  leadId: string | null
  leadName: string | null
  active: boolean
  createdAt: string
}

export type AdminInput = {
  receipts: { phoneId: string; quantity: number }[]
  allocations: { phoneId: string; regionId: string; quantity: number }[]
  sends: { agentId: string; amount: number }[]
}

export type LeadInput = {
  openings: { phoneId: string; quantity: number; confirmed: boolean }[]
  prices: { phoneId: string; price: number }[]
  broughtForward: number
  cashReceived: number
  sales: { phoneId: string; quantity: number }[]
  payments: { agentId: string; amount: number }[]
  closingBalance: number
}

export type AgentInput = {
  lines: { phoneId: string; quantity: number }[]
}

export type ActionFailure = { ok: false; error: string }
export type ActionSuccess<T> = { ok: true; summary: T }

export type AdminSummary = {
  date: string
  updated: boolean
  receipts: { phone: string; quantity: number }[]
  allocations: { phone: string; region: string; quantity: number }[]
  sends: { agent: string; region: string; amount: number }[]
  unallocated: { phone: string; quantity: number }[]
}

export type LeadSummary = {
  date: string
  region: string
  updated: boolean
  startingCash: number
  cashReceived: number
  sent: number | null
  match: string
  broughtForward: number
  carriedFrom: string | null
  closingBalance: number
  transaction: number
  expected: number
  depositGap: number
  units: number
  payments: { name: string; expected: number; paid: number; difference: number }[]
}

export type AgentSummary = {
  date: string
  updated: boolean
  lines: { supplier: string; brand: string; model: string; quantity: number }[]
  units: number
}
