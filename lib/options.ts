import { activeLeads, listPhones, listRegions, listSuppliers, listUsers } from "./queries"
import type { CurrentUser } from "./types"

export function screenOptions(user: CurrentUser) {
  const phones = listPhones().filter((phone) => user.role === "ADMIN" || (phone.active && phone.supplierActive))
  const suppliers = listSuppliers().filter((supplier) => user.role === "ADMIN" || supplier.active)
  const leads = activeLeads()
  const agents = listUsers().filter((person) => {
    if (user.role === "ADMIN") return person.role === "SALES_AGENT" || person.role === "SALES_LEAD"
    if (user.role === "SALES_LEAD") return person.regionId === user.regionId && (person.id === user.id || person.leadId === user.id)
    return false
  })
  return {
    regions: listRegions().map((region) => ({ value: region.id, label: region.name })),
    suppliers: suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
    brands: [...new Set(phones.map((phone) => phone.brand))].map((brand) => ({ value: brand, label: brand })),
    models: phones.map((phone) => ({ value: phone.model, label: `${phone.brand} ${phone.model}`, supplierId: phone.supplierId, brand: phone.brand })),
    leads: leads.map((lead) => ({ value: lead.id, label: `${lead.name} · ${lead.regionName}` })),
    agents: agents.map((agent) => ({ value: agent.id, label: agent.name, leadId: agent.leadId ?? agent.id, regionId: agent.regionId ?? "" })),
    users: listUsers().map((person) => ({ value: person.id, label: person.name })),
    recordTypes: ["supplier", "phone", "region", "user", "stock_receipt", "stock_allocation", "cash_send", "opening", "price", "cash_day", "sale", "agent_payment"].map((type) => ({ value: type, label: type.replaceAll("_", " ") })),
  }
}
