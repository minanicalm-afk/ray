"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { deleteDraftRecord, saveDraftRecord } from "@/lib/drafts"
import { isISODate } from "@/lib/dates"
import { getCurrentUser } from "@/lib/session"
import { submitAdminDay, submitAgentSales, submitLeadDay } from "@/lib/submit"
import type { AdminInput, AgentInput, LeadInput } from "@/lib/types"

async function user() {
  const current = await getCurrentUser()
  if (!current) redirect("/")
  return current
}

export async function saveFlowDraft(flow: string, date: string, scopeId: string, step: number, payload: unknown) {
  const current = await user()
  if (!isISODate(date) && date !== "catalogue") return { ok: false as const, error: "Choose a valid date." }
  return saveDraftRecord(current.id, flow, date, scopeId, step, payload)
}

export async function discardFlowDraft(flow: string, date: string, scopeId: string) {
  const current = await user()
  deleteDraftRecord(current.id, flow, date, scopeId)
  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function submitAdmin(date: string, input: AdminInput) {
  const current = await user()
  if (current.role !== "ADMIN") return { ok: false as const, error: "Only an admin can submit this flow." }
  if (!isISODate(date)) return { ok: false as const, error: "Choose a valid date." }
  const result = submitAdminDay(current, date, input)
  revalidatePath("/", "layout")
  return result
}

export async function submitLead(regionId: string, date: string, input: LeadInput) {
  const current = await user()
  if (current.role === "SALES_AGENT") return { ok: false as const, error: "Agents record sales only." }
  if (current.role === "SALES_LEAD" && current.regionId !== regionId) return { ok: false as const, error: "You can only close out your own region." }
  if (!isISODate(date)) return { ok: false as const, error: "Choose a valid date." }
  const result = submitLeadDay(current, regionId, date, input)
  revalidatePath("/", "layout")
  return result
}

export async function submitAgent(agentId: string, date: string, input: AgentInput) {
  const current = await user()
  if (current.role === "SALES_AGENT" && current.id !== agentId) return { ok: false as const, error: "You can only record your own sales." }
  if (current.role === "SALES_LEAD") return { ok: false as const, error: "Record your own sales inside the region close-out." }
  if (!isISODate(date)) return { ok: false as const, error: "Choose a valid date." }
  const result = submitAgentSales(current, agentId, date, input)
  revalidatePath("/", "layout")
  return result
}
