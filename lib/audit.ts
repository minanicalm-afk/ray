import { id, now, run } from "./db"
import type { CurrentUser } from "./types"

export type AuditValue = Record<string, string | number | boolean | null>

export function writeAudit(
  actor: Pick<CurrentUser, "id" | "role">,
  action: string,
  entityType: string,
  entityId: string,
  before: AuditValue | null,
  after: AuditValue | null,
) {
  run(
    `INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id(),
      actor.id,
      actor.role,
      action,
      entityType,
      entityId,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      now(),
    ],
  )
}
