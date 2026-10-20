import type { ReactNode } from "react"
import { Shell } from "@/components/shell"
import { Banner } from "@/components/ui"
import { takeFlash } from "@/lib/flash"
import { listUsers } from "@/lib/queries"
import { requireUser } from "@/lib/session"

export default async function DeskLayout({ children }: { children: ReactNode }) {
  const user = await requireUser()
  const flash = await takeFlash()
  const people = listUsers().filter((person) => person.active).map((person) => ({ id: person.id, name: person.name, role: person.role, regionName: person.regionName }))
  return (
    <Shell name={user.name} role={user.role} region={user.regionName} userId={user.id} people={people}>
      {flash ? <Banner type={flash.type} message={flash.message} /> : null}
      {children}
    </Shell>
  )
}
