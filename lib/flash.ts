import { cookies } from "next/headers"

export type Flash = { type: "ok" | "err"; message: string }

export async function setFlash(type: Flash["type"], message: string) {
  const jar = await cookies()
  jar.set("ray_flash", JSON.stringify({ type, message }), { path: "/", maxAge: 20 })
}

export async function takeFlash() {
  const jar = await cookies()
  const raw = jar.get("ray_flash")?.value
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Flash
    if ((parsed.type === "ok" || parsed.type === "err") && typeof parsed.message === "string") return parsed
  } catch {
    return null
  }
  return null
}
