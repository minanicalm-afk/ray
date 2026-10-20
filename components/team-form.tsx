"use client"

import { useState } from "react"
import { addUser, editUser } from "@/app/actions/team"
import { btn, inputClass } from "./ui"
import type { Role } from "@/lib/types"

type Lead = { id: string; name: string; regionId: string | null }
type Region = { id: string; name: string }
type Existing = { id: string; name: string; email: string; role: Role; regionId: string | null; leadId: string | null }

export function TeamForm({ regions, leads, existing }: { regions: Region[]; leads: Lead[]; existing?: Existing }) {
  const [role, setRole] = useState<Role>(existing?.role ?? "SALES_AGENT")
  const [regionId, setRegionId] = useState(existing?.regionId ?? regions[0]?.id ?? "")
  const regionLeads = leads.filter((lead) => lead.regionId === regionId)
  return (
    <form action={existing ? editUser : addUser} className="grid gap-3 rounded-3xl border border-line bg-panel p-4 md:grid-cols-2">
      {existing ? <input type="hidden" name="id" value={existing.id} /> : null}
      <label className="text-sm">Name<input name="name" defaultValue={existing?.name} required className={`mt-1 ${inputClass}`} /></label>
      <label className="text-sm">Email<input name="email" type="email" defaultValue={existing?.email} required className={`mt-1 ${inputClass}`} /></label>
      <label className="text-sm">{existing ? "New password (optional)" : "Password"}
        <input name="password" type="password" required={!existing} minLength={existing ? undefined : 8} className={`mt-1 ${inputClass}`} />
      </label>
      <label className="text-sm">Role
        <select name="role" className={`mt-1 ${inputClass}`} value={role} onChange={(event) => setRole(event.target.value as Role)}>
          <option value="ADMIN">Admin</option>
          <option value="SALES_LEAD">Sales Lead</option>
          <option value="SALES_AGENT">Sales Agent</option>
        </select>
      </label>
      {role !== "ADMIN" ? (
        <label className="text-sm">Region
          <select name="regionId" className={`mt-1 ${inputClass}`} value={regionId} onChange={(event) => setRegionId(event.target.value)}>
            {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
          </select>
        </label>
      ) : null}
      {role === "SALES_AGENT" ? (
        <label className="text-sm">Sales lead
          <select name="leadId" className={`mt-1 ${inputClass}`} defaultValue={existing?.leadId ?? regionLeads[0]?.id ?? ""}>
            {regionLeads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}
          </select>
        </label>
      ) : null}
      <div className="md:col-span-2"><button className={btn.primary}>{existing ? "Save user" : "Add user"}</button></div>
    </form>
  )
}
