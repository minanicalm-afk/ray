import { Suspense } from "react"
import { addRegion, deactivateUser, reactivateUser } from "@/app/actions/team"
import { ConfirmButton } from "@/components/confirm-button"
import { ExportLink, FilterPanel, Pager, SearchBox, SortLink } from "@/components/list-controls"
import { TeamForm } from "@/components/team-form"
import { Empty, PageHeader, btn, inputClass } from "@/components/ui"
import { formatDate } from "@/lib/dates"
import { readFilters, type Query } from "@/lib/filters"
import { screenOptions } from "@/lib/options"
import { pageOf, sortBy } from "@/lib/paging"
import { activeLeads, listRegions, listUsers } from "@/lib/queries"
import { requireUser } from "@/lib/session"

const roleLabel = { ADMIN: "Admin", SALES_LEAD: "Sales Lead", SALES_AGENT: "Sales Agent" }

export default async function TeamPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireUser()
  if (user.role !== "ADMIN") return <p>Only an admin manages regions and users.</p>
  const filters = readFilters(await searchParams, user)
  const options = screenOptions(user)
  const regions = listRegions()
  const leads = activeLeads()
  const rows = listUsers()
    .filter((person) => !filters.regionId || person.regionId === filters.regionId)
    .filter((person) => !filters.addedFrom || person.createdAt.slice(0, 10) >= filters.addedFrom)
    .filter((person) => !filters.addedTo || person.createdAt.slice(0, 10) <= filters.addedTo)
    .filter((person) => !filters.q || `${person.name} ${person.email} ${person.regionName ?? ""}`.toLowerCase().includes(filters.q.toLowerCase()))
  const sorted = sortBy(rows, (person) => filters.sort === "role" ? person.role : filters.sort === "region" ? person.regionName ?? "" : person.name, filters.sort ? filters.dir : "asc")
  const paged = pageOf(sorted, filters.page)
  return (
    <>
      <PageHeader title="Team" text="Deactivating a person keeps their sales, stock and cash in the reports." />
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <form action={addRegion} className="rounded-3xl border border-line bg-panel p-4">
          <h2 className="font-serif text-2xl">Add region</h2>
          <label className="mt-3 block text-sm">Name<input name="name" required className={`mt-1 ${inputClass}`} /></label>
          <button className={`${btn.primary} mt-3`}>Add region</button>
        </form>
        <div>
          <h2 className="mb-3 font-serif text-2xl">Add user</h2>
          <TeamForm regions={regions} leads={leads} />
        </div>
      </div>
      <Suspense>
        <FilterPanel show={{ region: true, added: true }} options={options} />
        <div className="mb-3 flex gap-2"><SearchBox placeholder="Search people" /><ExportLink kind="team" /></div>
      </Suspense>
      <div className="mb-2 flex gap-4 text-xs text-ink/50">
        <Suspense><SortLink label="Name" column="name" /></Suspense>
        <Suspense><SortLink label="Role" column="role" /></Suspense>
        <Suspense><SortLink label="Region" column="region" /></Suspense>
      </div>
      <p className="mb-2 text-sm">{paged.total} records</p>
      {paged.total === 0 ? <Empty>No records match these filters</Empty> : (
        <div className="space-y-3">
          {paged.items.map((person) => (
            <details key={person.id} className="rounded-3xl border border-line bg-panel p-4">
              <summary className="cursor-pointer text-sm">
                <span className="font-medium">{person.name}</span> · {roleLabel[person.role]} · {person.regionName ?? "All regions"} · {person.active ? "Active" : "Inactive"}
              </summary>
              <p className="mt-2 text-sm text-ink/70">{person.email}{person.leadName ? ` · under ${person.leadName}` : ""} · added {formatDate(person.createdAt.slice(0, 10))}</p>
              <div className="mt-3"><TeamForm regions={regions} leads={leads} existing={person} /></div>
              <div className="mt-3">
                {person.active ? <ConfirmButton action={deactivateUser} message={`Deactivate ${person.name}? They will not be able to sign in.`} fields={{ id: person.id }}>Deactivate</ConfirmButton> : <ConfirmButton action={reactivateUser} tone="ghost" message={`Reactivate ${person.name}?`} fields={{ id: person.id }}>Reactivate</ConfirmButton>}
              </div>
            </details>
          ))}
        </div>
      )}
      <Suspense><Pager page={paged.page} pages={paged.pages} /></Suspense>
    </>
  )
}
