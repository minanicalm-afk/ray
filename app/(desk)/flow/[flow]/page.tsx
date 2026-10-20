import { notFound, redirect } from "next/navigation"
import { AdminFlow } from "@/components/flows/admin-flow"
import { AgentFlow } from "@/components/flows/agent-flow"
import { LeadFlow } from "@/components/flows/lead-flow"
import { SupplierWizard } from "@/components/flows/supplier-wizard"
import { PageHeader } from "@/components/ui"
import { catalogueView } from "@/lib/catalogue-view"
import { businessToday, formatDate, isISODate } from "@/lib/dates"
import { queryValue, type Query } from "@/lib/filters"
import { loadAdmin, loadAgent, loadLead, parseDraft } from "@/lib/flow-load"
import { readDraft } from "@/lib/queries"
import { listSuppliers } from "@/lib/queries"
import { requireUser } from "@/lib/session"

export default async function FlowPage({ params, searchParams }: { params: Promise<{ flow: string }>; searchParams: Promise<Query> }) {
  const user = await requireUser()
  const { flow } = await params
  const query = await searchParams
  const today = businessToday()
  const date = isISODate(queryValue(query, "date")) ? queryValue(query, "date") : today
  if (flow === "setup") {
    if (user.role !== "ADMIN") redirect("/dashboard")
    const data = loadAdmin(user.id, date)
    return (
      <>
        <PageHeader title="Daily Admin Setup" text={`${formatDate(date)}. Supplier, phone type, model, then a quantity for each region.`} action={<DateForm date={date} />} />
        <AdminFlow date={date} {...data} suppliers={data.suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name, active: supplier.active }))} />
      </>
    )
  }
  if (flow === "supplier") {
    if (user.role !== "ADMIN") redirect("/dashboard")
    return (
      <>
        <PageHeader title="Add supplier" text="The catalogue starts empty. Add each supplier with its phones." />
        <SupplierWizard names={listSuppliers().map((supplier) => supplier.name)} draft={parseDraft(readDraft(user.id, "supplier", "catalogue", "catalogue"))} />
      </>
    )
  }
  if (flow === "closeout") {
    if (user.role === "SALES_AGENT") redirect("/dashboard")
    const regionId = user.role === "ADMIN" ? queryValue(query, "region") : user.regionId
    if (!regionId) {
      const { listRegions } = await import("@/lib/queries")
      return (
        <>
          <PageHeader title="Daily Region Close-Out" text="Choose the region to edit." />
          <ul className="space-y-2">{listRegions().map((region) => <li key={region.id}><a className="text-gold" href={`/flow/closeout?region=${region.id}&date=${date}`}>{region.name}</a></li>)}</ul>
        </>
      )
    }
    const data = loadLead(user, regionId, date)
    const catalogue = catalogueView(user.id, false, today).map((group) => ({
      supplier: group.supplier,
      unseen: group.unseen,
      phones: group.phones.map((phone) => ({ id: phone.id, brand: phone.brand, model: phone.model, badge: phone.badge, when: phone.when, by: phone.by, unseen: phone.unseen })),
    }))
    return (
      <>
        <PageHeader title="Daily Region Close-Out" text={formatDate(date)} action={<DateForm date={date} region={regionId} />} />
        <LeadFlow date={date} regionId={regionId} catalogue={catalogue} {...data} />
      </>
    )
  }
  if (flow === "sales") {
    if (user.role === "SALES_LEAD") redirect("/flow/closeout")
    const agentId = user.role === "ADMIN" ? queryValue(query, "agent") : user.id
    if (!agentId) redirect("/reports")
    const data = loadAgent(agentId, date, user.id)
    return (
      <>
        <PageHeader title="Record Today’s Sales" text={`${data.agentName} · ${formatDate(date)}`} action={<DateForm date={date} agent={user.role === "ADMIN" ? agentId : undefined} />} />
        <AgentFlow date={date} agentId={agentId} {...data} />
      </>
    )
  }
  notFound()
}

function DateForm({ date, region, agent }: { date: string; region?: string; agent?: string }) {
  return (
    <form className="flex items-center gap-2" action="">
      {region ? <input type="hidden" name="region" value={region} /> : null}
      {agent ? <input type="hidden" name="agent" value={agent} /> : null}
      <input type="date" name="date" defaultValue={date} className="rounded-full border border-line bg-panel px-3 py-2 text-sm" />
      <button className="rounded-full border border-line bg-panel px-3 py-2 text-sm">Open date</button>
    </form>
  )
}
