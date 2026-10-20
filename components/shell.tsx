"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { viewAs } from "@/app/actions/auth"
import type { Role } from "@/lib/types"

const links: Record<Role, [string, string][]> = {
  ADMIN: [
    ["Dashboard", "/dashboard"],
    ["Daily setup", "/flow/setup"],
    ["Suppliers", "/suppliers"],
    ["Stock", "/stock"],
    ["Reports", "/reports"],
    ["Team", "/team"],
    ["Audit log", "/audit"],
  ],
  SALES_LEAD: [
    ["Dashboard", "/dashboard"],
    ["Close-out", "/flow/closeout"],
    ["Suppliers and phones", "/suppliers"],
    ["Stock", "/stock"],
    ["Reports", "/reports"],
  ],
  SALES_AGENT: [
    ["Dashboard", "/dashboard"],
    ["Record sales", "/flow/sales"],
    ["My sales", "/reports"],
  ],
}

const roleLabel: Record<Role, string> = {
  ADMIN: "Admin",
  SALES_LEAD: "Sales Lead",
  SALES_AGENT: "Sales Agent",
}

export function Shell({
  name,
  role,
  region,
  userId,
  people,
  children,
}: {
  name: string
  role: Role
  region: string | null
  userId: string
  people: { id: string; name: string; role: Role; regionName: string | null }[]
  children: ReactNode
}) {
  const pathname = usePathname()
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-line bg-panel text-ink md:min-h-screen md:border-r">
        <div className="flex items-center justify-between px-5 py-5 md:block">
          <Link href="/dashboard" className="font-serif text-2xl text-pine">
            Ray
          </Link>
          <p className="text-xs text-ink/70 md:mt-1">{roleLabel[role]}{region ? ` · ${region}` : ""}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-1 md:px-3">
          {links[role].map(([label, href]) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
            return (
              <Link key={href} href={href} className={`block whitespace-nowrap rounded-full px-3 py-2 text-sm ${active ? "bg-pine font-medium text-paper" : "text-ink/80 hover:bg-white/10"}`}>
                {label}
              </Link>
            )
          })}
        </nav>
        <form action={viewAs} className="px-3 py-4">
          <label className="block text-xs text-ink/70">
            View as
            <select name="userId" defaultValue={userId} onChange={(event) => event.currentTarget.form?.requestSubmit()} className="mt-1 w-full rounded-xl border border-line bg-mist px-2 py-2 text-sm text-ink">
              {people.map((person) => (
                <option key={person.id} value={person.id} className="bg-panel text-ink">
                  {person.name} · {roleLabel[person.role]}{person.regionName ? ` · ${person.regionName}` : ""}
                </option>
              ))}
            </select>
          </label>
        </form>
        <p className="hidden px-5 pb-6 text-xs text-ink/50 md:block">{name}</p>
      </aside>
      <div className="px-4 py-6 md:px-8">{children}</div>
    </div>
  )
}
