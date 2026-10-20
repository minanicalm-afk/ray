import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { id, now, one, rows, run } from "./db"
import type { CurrentUser, Role } from "./types"

type UserRecord = {
  id: string
  email: string
  name: string
  role: Role
  regionId: string | null
  regionName: string | null
  leadId: string | null
  active: number
  passwordHash: string
}

const userSelect = `
  SELECT u.id, u.email, u.name, u.role, u.region_id AS regionId, r.name AS regionName,
         u.lead_id AS leadId, u.is_active AS active, u.password_hash AS passwordHash
  FROM users u
  LEFT JOIN regions r ON r.id = u.region_id
`

export async function createSession(userId: string) {
  const sessionId = id()
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  run("DELETE FROM sessions WHERE expires_at < ?", [now()])
  run("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)", [sessionId, userId, expires])
  const jar = await cookies()
  jar.set("ray_session", sessionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(expires),
  })
}

export async function clearSession() {
  const jar = await cookies()
  const sessionId = jar.get("ray_session")?.value
  if (sessionId) run("DELETE FROM sessions WHERE id = ?", [sessionId])
  jar.set("ray_session", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 })
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  return user
}

export async function getCurrentUser() {
  const jar = await cookies()
  const viewId = jar.get("ray_view")?.value
  if (viewId) {
    const picked = one<UserRecord>(`${userSelect} WHERE u.id = ?`, [viewId])
    if (picked) return toCurrent(picked)
  }
  const fallback = one<UserRecord>(`${userSelect} WHERE u.role = 'ADMIN' AND u.is_active = 1 ORDER BY u.name LIMIT 1`)
    ?? one<UserRecord>(`${userSelect} ORDER BY u.name LIMIT 1`)
  return fallback ? toCurrent(fallback) : null
}

export async function setView(userId: string) {
  const jar = await cookies()
  jar.set("ray_view", userId, { httpOnly: true, sameSite: "lax", path: "/" })
}

export function getUserByEmail(email: string) {
  return one<UserRecord>(`${userSelect} WHERE lower(u.email) = lower(?)`, [email.trim()])
}

export function toCurrent(user: UserRecord): CurrentUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    regionId: user.regionId,
    regionName: user.regionName,
    leadId: user.leadId,
  }
}

export function endUserSessions(userId: string) {
  run("DELETE FROM sessions WHERE user_id = ?", [userId])
}

export function listSessionUsers() {
  return rows("SELECT id FROM users")
}
