import { writeAudit } from "./audit"
import { id, now, one, run, transaction } from "./db"
import { hashPassword } from "./password"
import { cleanText } from "./format"
import { agentsInRegion, getUser, listRegions, listUsers } from "./queries"
import { endUserSessions } from "./session"
import type { CurrentUser, Role } from "./types"

export function createRegion(actor: CurrentUser, name: string) {
  const regionName = cleanText(name)
  if (!regionName) return { ok: false as const, error: "Enter the region name." }
  if (regionName.length > 80) return { ok: false as const, error: "Region name is too long." }
  const regionId = id()
  try {
    transaction(() => {
      run("INSERT INTO regions (id, name, created_at) VALUES (?, ?, ?)", [regionId, regionName, now()])
      writeAudit(actor, "create", "region", regionId, null, { name: regionName })
    })
  } catch (error) {
    const text = error instanceof Error ? error.message : ""
    if (text.includes("regions_name_lower") || text.includes("UNIQUE")) return { ok: false as const, error: "That region already exists." }
    throw error
  }
  return { ok: true as const }
}

export function createUser(
  actor: CurrentUser,
  input: { name: string; email: string; password: string; role: Role; regionId: string; leadId: string },
) {
  const name = cleanText(input.name)
  const email = input.email.trim().toLowerCase()
  const error = validateUser(name, email, input.password, input.role, input.regionId, input.leadId, null)
  if (error) return { ok: false as const, error }
  const userId = id()
  const stamp = now()
  try {
    transaction(() => {
      run(
        `INSERT INTO users (id, email, password_hash, name, role, region_id, lead_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          userId,
          email,
          hashPassword(input.password),
          name,
          input.role,
          input.role === "ADMIN" ? null : input.regionId,
          input.role === "SALES_AGENT" ? input.leadId : null,
          stamp,
          stamp,
        ],
      )
      writeAudit(actor, "create", "user", userId, null, snapshot(userId))
    })
  } catch (error) {
    return { ok: false as const, error: constraintMessage(error) }
  }
  return { ok: true as const }
}

export function updateUser(
  actor: CurrentUser,
  userId: string,
  input: { name: string; email: string; password: string; role: Role; regionId: string; leadId: string },
) {
  const existing = getUser(userId)
  if (!existing) return { ok: false as const, error: "That user does not exist." }
  const name = cleanText(input.name)
  const email = input.email.trim().toLowerCase()
  const error = validateUser(name, email, input.password || "placeholder", input.role, input.regionId, input.leadId, existing.id)
  if (error) return { ok: false as const, error }
  if (input.password && input.password.length < 8) return { ok: false as const, error: "Passwords need at least 8 characters." }
  if (existing.role === "SALES_LEAD" && input.role !== "SALES_LEAD") {
    const agents = agentsInRegion(existing.regionId ?? "").filter((agent) => agent.active && agent.leadId === existing.id)
    if (agents.length) return { ok: false as const, error: "Reassign or deactivate this lead's agents first." }
  }
  const before = snapshot(userId)
  const stamp = now()
  try {
    transaction(() => {
      run(
        `UPDATE users SET email = ?, name = ?, role = ?, region_id = ?, lead_id = ?, updated_at = ? WHERE id = ?`,
        [
          email,
          name,
          input.role,
          input.role === "ADMIN" ? null : input.regionId,
          input.role === "SALES_AGENT" ? input.leadId : null,
          stamp,
          userId,
        ],
      )
      if (input.password) run("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(input.password), userId])
      const after = snapshot(userId)
      if (input.password) after.password = "changed"
      writeAudit(actor, "update", "user", userId, before, after)
    })
  } catch (error) {
    return { ok: false as const, error: constraintMessage(error) }
  }
  return { ok: true as const }
}

export function setUserActive(actor: CurrentUser, userId: string, active: boolean) {
  const existing = getUser(userId)
  if (!existing) return { ok: false as const, error: "That user does not exist." }
  if (existing.id === actor.id && !active) return { ok: false as const, error: "You cannot deactivate your own account." }
  if (!active && existing.role === "ADMIN") {
    const admins = listUsers().filter((user) => user.role === "ADMIN" && user.active && user.id !== existing.id)
    if (admins.length === 0) return { ok: false as const, error: "Keep at least one active admin." }
  }
  if (active && existing.role === "SALES_AGENT") {
    const other = listUsers().find((user) => user.role === "SALES_AGENT" && user.active && user.regionId === existing.regionId && user.id !== existing.id)
    if (other) return { ok: false as const, error: `${existing.regionName} already has a sales agent.` }
  }
  if (!active && existing.role === "SALES_LEAD") {
    const agents = agentsInRegion(existing.regionId ?? "").filter((agent) => agent.active && agent.leadId === existing.id)
    if (agents.length) return { ok: false as const, error: "Reassign or deactivate this lead's agents first." }
  }
  const stamp = now()
  transaction(() => {
    run("UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?", [active ? 1 : 0, stamp, userId])
    if (!active) endUserSessions(userId)
    writeAudit(
      actor,
      active ? "reactivate" : "deactivate",
      "user",
      userId,
      { name: existing.name, email: existing.email, role: existing.role, active: existing.active },
      { name: existing.name, email: existing.email, role: existing.role, active },
    )
  })
  return { ok: true as const }
}

function validateUser(name: string, email: string, password: string, role: Role, regionId: string, leadId: string, ignoreId: string | null) {
  if (!name) return "Enter the person's name."
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email."
  if (!ignoreId && password.length < 8) return "Passwords need at least 8 characters."
  if (!["ADMIN", "SALES_LEAD", "SALES_AGENT"].includes(role)) return "Choose a role."
  if (role !== "ADMIN") {
    if (!listRegions().some((region) => region.id === regionId)) return "Choose a region."
  }
  if (role === "SALES_LEAD") {
    const other = listUsers().find((user) => user.role === "SALES_LEAD" && user.active && user.regionId === regionId && user.id !== ignoreId)
    if (other) return `${other.regionName} already has an active sales lead. Deactivate them first.`
  }
  if (role === "SALES_AGENT") {
    const lead = getUser(leadId)
    if (!lead || lead.role !== "SALES_LEAD" || !lead.active || lead.regionId !== regionId) {
      return "Place the agent under the active sales lead for that region."
    }
    const other = listUsers().find((user) => user.role === "SALES_AGENT" && user.active && user.regionId === regionId && user.id !== ignoreId)
    if (other) return `${other.regionName} already has a sales agent.`
  }
  const emailTaken = one<{ id: string }>("SELECT id FROM users WHERE lower(email) = lower(?) AND id <> ?", [email, ignoreId ?? ""])
  if (emailTaken) return "That email is already in use."
  return null
}

function snapshot(userId: string) {
  const user = getUser(userId)!
  return {
    name: user.name,
    email: user.email,
    role: user.role,
    region: user.regionName,
    lead: user.leadName,
    active: user.active,
  } as Record<string, string | number | boolean | null>
}

function constraintMessage(error: unknown) {
  const text = error instanceof Error ? error.message : ""
  if (text.includes("users_email_lower") || text.includes("email")) return "That email is already in use."
  if (text.includes("users_one_active_lead")) return "That region already has an active sales lead."
  return "Something went wrong. Please try again."
}
