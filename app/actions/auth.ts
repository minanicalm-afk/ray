"use server"

import { redirect } from "next/navigation"
import { getUser } from "@/lib/queries"
import { setView } from "@/lib/session"

export async function viewAs(formData: FormData) {
  const userId = String(formData.get("userId") ?? "")
  if (getUser(userId)) await setView(userId)
  redirect("/dashboard")
}
