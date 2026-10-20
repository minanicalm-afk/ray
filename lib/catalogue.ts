export { phoneBadge } from "./books"

export function unseenSinceVisit(updatedAt: string, seenAt: string | null) {
  return !seenAt || seenAt < updatedAt
}
