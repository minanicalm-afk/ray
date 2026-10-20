import { now, one, run } from "./db"

export function saveDraftRecord(userId: string, flow: string, date: string, scopeId: string, step: number, payload: unknown) {
  const text = JSON.stringify(payload)
  if (text.length > 500_000) return { ok: false as const, error: "This draft is too large to store." }
  const existing = one("SELECT user_id FROM drafts WHERE user_id = ? AND flow = ? AND business_date = ? AND scope_id = ?", [userId, flow, date, scopeId])
  if (existing) {
    run("UPDATE drafts SET step = ?, payload = ?, updated_at = ? WHERE user_id = ? AND flow = ? AND business_date = ? AND scope_id = ?", [
      step,
      text,
      now(),
      userId,
      flow,
      date,
      scopeId,
    ])
  } else {
    run("INSERT INTO drafts (user_id, flow, business_date, scope_id, step, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      userId,
      flow,
      date,
      scopeId,
      step,
      text,
      now(),
    ])
  }
  return { ok: true as const }
}

export function deleteDraftRecord(userId: string, flow: string, date: string, scopeId: string) {
  run("DELETE FROM drafts WHERE user_id = ? AND flow = ? AND business_date = ? AND scope_id = ?", [userId, flow, date, scopeId])
}
