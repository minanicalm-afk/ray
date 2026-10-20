"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { setFlash } from "@/lib/flash"
import { getCurrentUser } from "@/lib/session"
import { createRegion, createUser, setUserActive, updateUser } from "@/lib/team-write"
import type { Role } from "@/lib/types"

async function admin() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  if (user.role !== "ADMIN") return null
  return user
}

function roleOf(value: FormDataEntryValue | null): Role {
  const role = String(value)
  if (role === "SALES_LEAD" || role === "SALES_AGENT" || role === "ADMIN") return role
  return "SALES_AGENT"
}

export async function addRegion(formData: FormData) {
  const user = await admin()
  if (!user) redirect("/dashboard")
  const result = createRegion(user, String(formData.get("name") ?? ""))
  await setFlash(result.ok ? "ok" : "err", result.ok ? "Region added." : result.error)
  revalidatePath("/", "layout")
  redirect("/team")
}

export async function addUser(formData: FormData) {
  const user = await admin()
  if (!user) redirect("/dashboard")
  const result = createUser(user, {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    role: roleOf(formData.get("role")),
    regionId: String(formData.get("regionId") ?? ""),
    leadId: String(formData.get("leadId") ?? ""),
  })
  await setFlash(result.ok ? "ok" : "err", result.ok ? "User added." : result.error)
  revalidatePath("/", "layout")
  redirect("/team")
}

export async function editUser(formData: FormData) {
  const user = await admin()
  if (!user) redirect("/dashboard")
  const result = updateUser(user, String(formData.get("id")), {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    role: roleOf(formData.get("role")),
    regionId: String(formData.get("regionId") ?? ""),
    leadId: String(formData.get("leadId") ?? ""),
  })
  await setFlash(result.ok ? "ok" : "err", result.ok ? "User updated." : result.error)
  revalidatePath("/", "layout")
  redirect("/team")
}

export async function deactivateUser(formData: FormData) {
  const user = await admin()
  if (!user) redirect("/dashboard")
  const result = setUserActive(user, String(formData.get("id")), false)
  await setFlash(result.ok ? "ok" : "err", result.ok ? "User deactivated. Their history stays in reports." : result.error)
  revalidatePath("/", "layout")
  redirect("/team")
}

export async function reactivateUser(formData: FormData) {
  const user = await admin()
  if (!user) redirect("/dashboard")
  const result = setUserActive(user, String(formData.get("id")), true)
  await setFlash(result.ok ? "ok" : "err", result.ok ? "User reactivated." : result.error)
  revalidatePath("/", "layout")
  redirect("/team")
}
