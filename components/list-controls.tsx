"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"
import { businessToday, monthRange, weekRange } from "@/lib/dates"
import { btn, inputClass } from "./ui"

type Option = { value: string; label: string }
type ModelOption = Option & { supplierId: string; brand: string }
type AgentOption = Option & { leadId: string; regionId: string }

export function SearchBox({ placeholder }: { placeholder: string }) {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const [value, setValue] = useState(params.get("q") ?? "")

  useEffect(() => {
    setValue(params.get("q") ?? "")
  }, [params])

  useEffect(() => {
    const handle = setTimeout(() => {
      const current = params.get("q") ?? ""
      if (value.trim() === current) return
      const next = new URLSearchParams(params.toString())
      if (value.trim()) next.set("q", value.trim())
      else next.delete("q")
      next.delete("page")
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname)
    }, 250)
    return () => clearTimeout(handle)
  }, [value, params, pathname, router])

  return (
    <input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      placeholder={placeholder}
      aria-label="Search"
      className={`${inputClass} max-w-sm`}
    />
  )
}

export function FilterPanel({
  show,
  options,
}: {
  show: {
    date?: boolean
    region?: boolean
    supplier?: boolean
    brand?: boolean
    model?: boolean
    lead?: boolean
    agent?: boolean
    cash?: boolean
    added?: boolean
    user?: boolean
    recordType?: boolean
  }
  options: {
    regions?: Option[]
    suppliers?: Option[]
    brands?: Option[]
    models?: ModelOption[]
    leads?: Option[]
    agents?: AgentOption[]
    users?: Option[]
    recordTypes?: Option[]
  }
}) {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => read(params))

  useEffect(() => {
    setForm(read(params))
  }, [params])

  const models = (options.models ?? []).filter((model) => {
    if (form.supplier && model.supplierId !== form.supplier) return false
    if (form.brand && model.brand !== form.brand) return false
    return true
  })
  const agents = (options.agents ?? []).filter((agent) => {
    if (form.lead && agent.leadId !== form.lead && agent.value !== form.lead) return false
    if (form.region && agent.regionId !== form.region) return false
    return true
  })

  function apply(event: FormEvent) {
    event.preventDefault()
    const next = new URLSearchParams(params.toString())
    write(next, form)
    next.delete("page")
    router.push(next.size ? `${pathname}?${next}` : pathname)
    setOpen(false)
  }

  function quick(kind: "today" | "week" | "month") {
    const today = businessToday()
    const range = kind === "today" ? { start: today, end: today } : kind === "week" ? weekRange(today) : monthRange(today)
    setForm((current) => ({ ...current, from: range.start, to: range.end }))
  }

  const chips = chipList(params, options)
  return (
    <div className="mb-4 space-y-3">
      <button type="button" className={btn.ghost} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        Filter
      </button>
      {open ? (
        <form onSubmit={apply} className="grid gap-3 rounded-3xl border border-line bg-panel p-4 md:grid-cols-3">
          {show.date ? (
            <div className="md:col-span-3 flex flex-wrap gap-2">
              <button type="button" className={btn.tiny} onClick={() => quick("today")}>Today</button>
              <button type="button" className={btn.tiny} onClick={() => quick("week")}>This week</button>
              <button type="button" className={btn.tiny} onClick={() => quick("month")}>This month</button>
              <span className="text-xs text-ink/50 self-center">Custom</span>
            </div>
          ) : null}
          {show.date ? <Label text="From"><input type="date" className={inputClass} value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} /></Label> : null}
          {show.date ? <Label text="To"><input type="date" className={inputClass} value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} /></Label> : null}
          {show.region ? <Select label="Region" value={form.region} onChange={(region) => setForm({ ...form, region })} options={options.regions ?? []} /> : null}
          {show.supplier ? <Select label="Supplier" value={form.supplier} onChange={(supplier) => setForm({ ...form, supplier, model: "" })} options={options.suppliers ?? []} /> : null}
          {show.brand ? <Select label="Phone brand" value={form.brand} onChange={(brand) => setForm({ ...form, brand, model: "" })} options={options.brands ?? []} /> : null}
          {show.model ? <Select label="Phone model" value={form.model} onChange={(model) => setForm({ ...form, model })} options={models} /> : null}
          {show.lead ? <Select label="Sales lead" value={form.lead} onChange={(lead) => setForm({ ...form, lead, agent: "" })} options={options.leads ?? []} /> : null}
          {show.agent ? <Select label="Sales agent" value={form.agent} onChange={(agent) => setForm({ ...form, agent })} options={agents} /> : null}
          {show.cash ? <Select label="Cash status" value={form.cash} onChange={(cash) => setForm({ ...form, cash })} options={[{ value: "match", label: "Match" }, { value: "diff", label: "Difference" }]} /> : null}
          {show.added ? <Label text="Added or updated from"><input type="date" className={inputClass} value={form.addedFrom} onChange={(event) => setForm({ ...form, addedFrom: event.target.value })} /></Label> : null}
          {show.added ? <Label text="Added or updated to"><input type="date" className={inputClass} value={form.addedTo} onChange={(event) => setForm({ ...form, addedTo: event.target.value })} /></Label> : null}
          {show.user ? <Select label="User" value={form.user} onChange={(user) => setForm({ ...form, user })} options={options.users ?? []} /> : null}
          {show.recordType ? <Select label="Record type" value={form.recordType} onChange={(recordType) => setForm({ ...form, recordType })} options={options.recordTypes ?? []} /> : null}
          <div className="flex items-end gap-2 md:col-span-3">
            <button className={btn.primary}>Apply</button>
            <button
              type="button"
              className={btn.ghost}
              onClick={() => {
                router.push(pathname)
                setOpen(false)
              }}
            >
              Clear all
            </button>
          </div>
        </form>
      ) : null}
      {chips.length ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button key={chip.key} type="button" className="rounded-full bg-gold-soft px-3 py-1 text-xs" onClick={() => removeChip(chip.key, params, pathname, router)}>
              {chip.label} ×
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-ink/70">{text}</span>
      {children}
    </label>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Option[] }) {
  return (
    <Label text={label}>
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </Label>
  )
}

function read(params: { get(name: string): string | null }) {
  return {
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    region: params.get("region") ?? "",
    supplier: params.get("supplier") ?? "",
    brand: params.get("brand") ?? "",
    model: params.get("model") ?? "",
    lead: params.get("lead") ?? "",
    agent: params.get("agent") ?? "",
    cash: params.get("cash") ?? "",
    addedFrom: params.get("addedFrom") ?? "",
    addedTo: params.get("addedTo") ?? "",
    user: params.get("user") ?? "",
    recordType: params.get("type") ?? "",
  }
}

function write(params: URLSearchParams, form: ReturnType<typeof read>) {
  const entries: [string, string][] = [
    ["from", form.from],
    ["to", form.to],
    ["region", form.region],
    ["supplier", form.supplier],
    ["brand", form.brand],
    ["model", form.model],
    ["lead", form.lead],
    ["agent", form.agent],
    ["cash", form.cash],
    ["addedFrom", form.addedFrom],
    ["addedTo", form.addedTo],
    ["user", form.user],
    ["type", form.recordType],
  ]
  for (const [key, value] of entries) {
    if (value) params.set(key, value)
    else params.delete(key)
  }
}

function chipList(params: { get(name: string): string | null }, options: { regions?: Option[]; suppliers?: Option[]; leads?: Option[]; agents?: AgentOption[]; users?: Option[]; recordTypes?: Option[] }) {
  const label = (list: Option[] | undefined, value: string) => list?.find((item) => item.value === value)?.label ?? value
  const chips: { key: string; label: string }[] = []
  const add = (key: string, text: string | null) => {
    if (text) chips.push({ key, label: text })
  }
  add("from", params.get("from") ? `From ${params.get("from")}` : null)
  add("to", params.get("to") ? `To ${params.get("to")}` : null)
  add("region", params.get("region") ? label(options.regions, params.get("region")!) : null)
  add("supplier", params.get("supplier") ? label(options.suppliers, params.get("supplier")!) : null)
  add("brand", params.get("brand"))
  add("model", params.get("model"))
  add("lead", params.get("lead") ? label(options.leads, params.get("lead")!) : null)
  add("agent", params.get("agent") ? label(options.agents, params.get("agent")!) : null)
  add("cash", params.get("cash") === "match" ? "Match" : params.get("cash") === "diff" ? "Difference" : null)
  add("addedFrom", params.get("addedFrom") ? `Added from ${params.get("addedFrom")}` : null)
  add("addedTo", params.get("addedTo") ? `Added to ${params.get("addedTo")}` : null)
  add("user", params.get("user") ? label(options.users, params.get("user")!) : null)
  add("type", params.get("type") ? label(options.recordTypes, params.get("type")!) : null)
  return chips
}

function removeChip(key: string, params: { toString(): string }, pathname: string, router: { push(href: string): void }) {
  const next = new URLSearchParams(params.toString())
  next.delete(key)
  next.delete("page")
  router.push(next.size ? `${pathname}?${next}` : pathname)
}

export function SortLink({ label, column }: { label: string; column: string }) {
  const params = useSearchParams()
  const pathname = usePathname()
  const active = params.get("sort") === column
  const nextDir = active && params.get("dir") === "asc" ? "desc" : "asc"
  const next = new URLSearchParams(params.toString())
  next.set("sort", column)
  next.set("dir", nextDir)
  next.delete("page")
  return (
    <Link href={`${pathname}?${next}`} className="inline-flex items-center gap-1">
      {label}
      <span aria-hidden="true">{active ? (params.get("dir") === "asc" ? "↑" : "↓") : "↕"}</span>
    </Link>
  )
}

export function Pager({ page, pages }: { page: number; pages: number }) {
  const params = useSearchParams()
  const pathname = usePathname()
  const href = (target: number) => {
    const next = new URLSearchParams(params.toString())
    next.set("page", String(target))
    return `${pathname}?${next}`
  }
  return (
    <div className="mt-4 flex items-center gap-2">
      {page <= 1 ? <span className={`${btn.ghost} opacity-40`}>Previous</span> : <Link className={btn.ghost} href={href(page - 1)}>Previous</Link>}
      <span className="text-sm">Page {page} of {pages}</span>
      {page >= pages ? <span className={`${btn.ghost} opacity-40`}>Next</span> : <Link className={btn.ghost} href={href(page + 1)}>Next</Link>}
    </div>
  )
}

export function ExportLink({ kind }: { kind: string }) {
  const params = useSearchParams()
  const next = new URLSearchParams(params.toString())
  next.set("kind", kind)
  return (
    <a className={btn.ghost} href={`/api/export?${next}`}>
      Export CSV
    </a>
  )
}
