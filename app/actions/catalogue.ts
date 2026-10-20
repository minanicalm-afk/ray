"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { addPhone, createSupplier, markSeen, setPhoneActive, setSupplierActive, updatePhone, updateSupplierName } from "@/lib/catalogue-write"
import { setFlash } from "@/lib/flash"
import { getCurrentUser } from "@/lib/session"

async function admin() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  if (user.role !== "ADMIN") return null
  return user
}

export async function saveSupplier(input: { name: string; phones: { brand: string; model: string; deposit: number }[] }) {
  const user = await admin()
  if (!user) return { ok: false as const, error: "Only an admin can add a supplier." }
  const result = createSupplier(user, input.name, input.phones)
  revalidatePath("/", "layout")
  return result
}

export async function renameSupplier(supplierId: string, name: string) {
  const user = await admin()
  if (!user) return { ok: false as const, error: "Only an admin can edit a supplier." }
  const result = updateSupplierName(user, supplierId, name)
  revalidatePath("/", "layout")
  return result
}

export async function addSupplierPhone(supplierId: string, brand: string, model: string, deposit: number) {
  const user = await admin()
  if (!user) return { ok: false as const, error: "Only an admin can add a phone." }
  const result = addPhone(user, supplierId, brand, model, deposit)
  revalidatePath("/", "layout")
  return result
}

export async function editPhone(phoneId: string, brand: string, model: string, deposit: number) {
  const user = await admin()
  if (!user) return { ok: false as const, error: "Only an admin can edit a phone." }
  const result = updatePhone(user, phoneId, brand, model, deposit)
  revalidatePath("/", "layout")
  return result
}

function returnPath(formData: FormData, fallback: string) {
  const next = String(formData.get("next") ?? "")
  if (next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) return next
  return fallback
}

export async function deactivateSupplierAction(formData: FormData) {
  const user = await admin()
  if (!user) redirect("/dashboard")
  const result = setSupplierActive(user, String(formData.get("id")), false)
  await setFlash(result.ok ? "ok" : "err", result.ok ? "Supplier deactivated. Past records stay in reports." : result.error)
  revalidatePath("/", "layout")
  redirect(returnPath(formData, "/suppliers"))
}

export async function reactivateSupplierAction(formData: FormData) {
  const user = await admin()
  if (!user) redirect("/dashboard")
  const result = setSupplierActive(user, String(formData.get("id")), true)
  await setFlash(result.ok ? "ok" : "err", result.ok ? "Supplier reactivated." : result.error)
  revalidatePath("/", "layout")
  redirect("/suppliers")
}

export async function deactivatePhoneAction(formData: FormData) {
  const user = await admin()
  if (!user) redirect("/dashboard")
  const supplierId = String(formData.get("supplierId"))
  const result = setPhoneActive(user, String(formData.get("id")), false)
  await setFlash(result.ok ? "ok" : "err", result.ok ? "Phone deactivated. Past records stay in reports." : result.error)
  revalidatePath("/", "layout")
  redirect(`/suppliers/${supplierId}`)
}

export async function reactivatePhoneAction(formData: FormData) {
  const user = await admin()
  if (!user) redirect("/dashboard")
  const supplierId = String(formData.get("supplierId"))
  const result = setPhoneActive(user, String(formData.get("id")), true)
  await setFlash(result.ok ? "ok" : "err", result.ok ? "Phone reactivated." : result.error)
  revalidatePath("/", "layout")
  redirect(`/suppliers/${supplierId}`)
}

export async function markCatalogueSeen() {
  const user = await getCurrentUser()
  if (!user || user.role !== "SALES_LEAD") return { ok: false as const, error: "Only a sales lead can mark the catalogue as seen." }
  const { listPhones, listSuppliers } = await import("@/lib/queries")
  const phones = listPhones().filter((phone) => phone.active && phone.supplierActive)
  const suppliers = listSuppliers().filter((supplier) => supplier.active)
  markSeen(
    user,
    phones.map((phone) => phone.id),
    suppliers.map((supplier) => supplier.id),
  )
  revalidatePath("/", "layout")
  return { ok: true as const }
}
