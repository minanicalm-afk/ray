"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { isISODate } from "@/lib/dates"
import { getCurrentUser } from "@/lib/session"
import { recordReceipt, updateAllocation } from "@/lib/stock-write"

async function admin() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  if (user.role !== "ADMIN") return null
  return user
}

export async function receiveStock(date: string, phoneId: string, quantity: number) {
  const user = await admin()
  if (!user) return { ok: false as const, error: "Only an admin can record stock received." }
  if (!isISODate(date)) return { ok: false as const, error: "Choose a valid date." }
  const result = recordReceipt(user, date, phoneId, quantity)
  revalidatePath("/", "layout")
  return result
}

export async function allocateStock(date: string, phoneId: string, regionId: string, quantity: number) {
  const user = await admin()
  if (!user) return { ok: false as const, error: "Only an admin can update an allocation." }
  if (!isISODate(date)) return { ok: false as const, error: "Choose a valid date." }
  const result = updateAllocation(user, date, phoneId, regionId, quantity)
  revalidatePath("/", "layout")
  return result
}
