"use client"

import { useMemo, useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { saveFlowDraft, submitAdmin } from "@/app/actions/flows"
import { formatDate } from "@/lib/dates"
import { kes, parseWhole, qty } from "@/lib/format"
import type { AdminSummary } from "@/lib/types"
import { Banner, btn, fieldClass } from "../ui"
import { Missing, RemoveRow, Steps } from "./chrome"

type Phone = { id: string; supplierId: string; supplierName: string; brand: string; model: string; deposit: number; active: boolean }
type Region = { id: string; name: string }
type Agent = { id: string; name: string; role: string; regionId: string; regionName: string }
type Line = { key: string; supplierId: string; brand: string; phoneId: string; quantities: Record<string, string> }
type State = { lines: Line[]; cash: Record<string, string> }
type Existing = {
  allocations: { phoneId: string; regionId: string; quantity: string }[]
  sends: { agentId: string; amount: string }[]
}

const labels = ["Supplier", "Phone type", "Model", "Region", "Cash"]

export function AdminFlow({
  date,
  phones,
  suppliers,
  regions,
  agents,
  existing,
  draft,
  submitted,
}: {
  date: string
  phones: Phone[]
  suppliers: { id: string; name: string; active: boolean }[]
  regions: Region[]
  agents: Agent[]
  existing: Existing
  draft: { step: number; payload: unknown } | null
  submitted: boolean
}) {
  const router = useRouter()
  const fallback = useMemo(() => blank(agents, existing), [agents, existing])
  const kept = usableDraft(draft?.payload)
  const [step, setStep] = useState(kept ? Math.min(draft?.step ?? 0, labels.length - 1) : 0)
  const [state, setState] = useState<State>(() => merge(fallback, kept ? draft?.payload : null, phones, agents))
  const [reveal, setReveal] = useState(false)
  const [message, setMessage] = useState<{ type: "ok" | "err"; message: string } | null>(null)
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [pending, start] = useTransition()
  const missing = missingFor(step, state, regions)
  const catalogue = suppliers.filter((supplier) => supplier.active)
  const stockPhones = phones.filter((phone) => phone.active && catalogue.some((supplier) => supplier.id === phone.supplierId))

  function go(next: number) {
    if (next > step) {
      setReveal(true)
      if (missing.length) return
      setReveal(false)
    }
    setStep(next)
  }

  function submit() {
    setReveal(true)
    if (missingFor(labels.length - 1, state, regions).length) return
    const primary = new Map<string, string>()
    for (const agent of agents) {
      if (agent.role === "SALES_AGENT" && !primary.has(agent.regionId)) primary.set(agent.regionId, agent.id)
    }
    const uncovered = regions.map((region) => region.id).filter((regionId) => !primary.has(regionId))
    if (uncovered.length) {
      const names = uncovered.map((regionId) => regions.find((region) => region.id === regionId)?.name ?? "A region")
      setMessage({ type: "err", message: `${names.join(", ")} has no sales agent.` })
      return
    }
    start(async () => {
      const lines = completeLines(state)
      const receipts = new Map<string, number>()
      for (const line of lines) receipts.set(line.phoneId, (receipts.get(line.phoneId) ?? 0) + line.quantity)
      const result = await submitAdmin(date, {
        receipts: [...receipts.entries()].map(([phoneId, quantity]) => ({ phoneId, quantity })),
        allocations: lines,
        sends: agents.map((agent) => ({
          agentId: agent.id,
          amount: primary.get(agent.regionId) === agent.id ? parseWhole(state.cash[agent.regionId] ?? "") ?? -1 : 0,
        })),
      })
      if (!result.ok) {
        setMessage({ type: "err", message: result.error })
        return
      }
      setSummary(result.summary)
    })
  }

  if (summary) {
    const cards = regions.flatMap((region) => {
      const stock = summary.allocations.filter((row) => row.region === region.name)
      const cash = summary.sends.filter((row) => row.region === region.name).reduce((sum, row) => sum + row.amount, 0)
      if (stock.length === 0 && cash === 0) return []
      return [{ name: region.name, stock, cash }]
    })
    return (
      <section className="space-y-4">
        <div>
          <h2 className="font-serif text-3xl text-pine">{summary.updated ? "Daily setup updated" : "Daily setup saved"}</h2>
          <p className="mt-2 text-sm text-ink/60">{formatDate(summary.date)} is in stock, cash, and the audit log.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {cards.map((card) => (
            <article key={card.name} className="rounded-3xl border border-line bg-panel p-5">
              <h3 className="font-serif text-3xl text-pine">{card.name}</h3>
              <div className="mt-4 grid gap-3">
                {card.stock.map((row) => (
                  <div key={row.phone} className="rounded-2xl bg-mist/70 p-4">
                    <p className="text-xs uppercase tracking-wide text-ink/50">Stock</p>
                    <p className="mt-1 font-serif text-2xl">{row.phone}</p>
                    <p className="num mt-2 text-3xl">{qty(row.quantity)}</p>
                  </div>
                ))}
                <div className="rounded-2xl bg-mist/70 p-4">
                  <p className="text-xs uppercase tracking-wide text-ink/50">Cash sent</p>
                  <p className="num mt-2 text-3xl">{kes(card.cash)}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn.primary} onClick={() => setSummary(null)}>Start another</button>
          <a className={btn.ghost} href="/dashboard">Go to dashboard</a>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      {kept ? <Banner type="ok" message="A draft for this date was restored." /> : null}
      {submitted && !draft ? <Banner type="ok" message="This date was already submitted. Submitting again updates it." /> : null}
      {message ? <Banner type={message.type} message={message.message} /> : null}
      <Steps labels={labels} step={step} onStep={go} />
      <div className="space-y-4">
        <section className="rounded-3xl border border-line bg-panel p-5 md:p-8">
          <h2 className="font-serif text-3xl text-pine">{labels[step]}</h2>
          <p className="mt-1 text-sm text-ink/60">{hint(step)}</p>
          {step < 4 ? (
            <div className="mt-6 space-y-4">
              {state.lines.map((line, index) => (
                <div key={line.key} className="grid items-end gap-3 rounded-2xl bg-mist/60 p-4 md:grid-cols-[1fr_auto]">
                  <div className={`grid gap-3 ${step >= 3 ? "md:grid-cols-2" : "max-w-xl"}`}>
                    <Select label="Supplier" value={line.supplierId} invalid={reveal && !line.supplierId} onChange={(supplierId) => updateLine(index, { supplierId, brand: "", phoneId: "" })}>
                      {catalogue.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                    </Select>
                    {step >= 1 ? (
                      <Select label="Phone type" value={line.brand} invalid={reveal && !line.brand} onChange={(brand) => updateLine(index, { brand, phoneId: "" })}>
                        {brands(stockPhones, line.supplierId).map((brand) => <option key={brand} value={brand}>{brand}</option>)}
                      </Select>
                    ) : null}
                    {step >= 2 ? (
                      <Select label="Phone model" value={line.phoneId} invalid={reveal && !line.phoneId} onChange={(phoneId) => updateLine(index, { phoneId })}>
                        {stockPhones.filter((phone) => phone.supplierId === line.supplierId && phone.brand === line.brand).map((phone) => <option key={phone.id} value={phone.id}>{phone.model}</option>)}
                      </Select>
                    ) : null}
                    {step >= 3 ? regions.map((region) => (
                      <label key={region.id} className="block text-sm">{region.name}
                        <input inputMode="numeric" aria-label={`${region.name} quantity`} placeholder="Quantity" className={`mt-1 ${fieldClass(reveal && parseWhole(line.quantities[region.id] ?? "") === null)}`} value={line.quantities[region.id] ?? ""} onBlur={() => setReveal(true)} onChange={(event) => updateLine(index, { quantities: { ...line.quantities, [region.id]: event.target.value } })} />
                      </label>
                    )) : null}
                  </div>
                  {state.lines.length > 1 ? <RemoveRow onClick={() => setState({ ...state, lines: state.lines.filter((item) => item.key !== line.key) })} /> : null}
                </div>
              ))}
              <button type="button" className={btn.ghost} onClick={() => setState({ ...state, lines: [...state.lines, emptyLine()] })}>Add another</button>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {regions.map((region) => (
                <label key={region.id} className="block rounded-2xl bg-mist/60 p-4 text-sm">
                  <span className="font-serif text-xl text-pine">{region.name}</span>
                  <span className="mt-3 block">Cash sent, KES</span>
                  <input inputMode="numeric" className={`mt-1 ${fieldClass(reveal && parseWhole(state.cash[region.id] ?? "") === null)}`} value={state.cash[region.id] ?? ""} placeholder="Amount sent" onBlur={() => setReveal(true)} onChange={(event) => setState({ ...state, cash: { ...state.cash, [region.id]: event.target.value } })} />
                </label>
              ))}
            </div>
          )}
          <div className="mt-5">
            <Missing items={reveal ? missing : []} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn.ghost} onClick={() => go(step - 1)} disabled={step === 0 || pending}>Back</button>
              {step < 4 ? (
                <button type="button" className={btn.primary} onClick={() => go(step + 1)} disabled={pending}>Next</button>
              ) : (
                <button type="button" className={btn.primary} disabled={pending} onClick={submit}>{pending ? "Saving…" : submitted ? "Update submission" : "Submit"}</button>
              )}
            </div>
          </div>
        </section>
        <section className="rounded-3xl border border-line bg-panel p-5">
          <h2 className="font-serif text-2xl text-pine">In the catalogue</h2>
          <p className="mt-1 text-sm text-ink/60">Active suppliers only. Each phone shows its type, model, and the deposit used when it is sold.</p>
          {catalogue.length === 0 ? <p className="mt-4 text-sm">No active suppliers yet.</p> : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {catalogue.map((supplier) => {
                const models = stockPhones.filter((phone) => phone.supplierId === supplier.id)
                return (
                  <article key={supplier.id} className="rounded-2xl bg-mist/60 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-serif text-xl text-pine">{supplier.name}</h3>
                      <button type="button" className={btn.tiny} onClick={() => start(async () => { await saveFlowDraft("admin_setup", date, "admin", step, state); router.push(`/suppliers/${supplier.id}`) })}>Edit</button>
                    </div>
                    {models.length === 0 ? <p className="mt-2 text-sm text-ink/60">No active phones.</p> : (
                      <ul className="mt-2 space-y-2 text-sm">
                        {models.map((phone) => (
                          <li key={phone.id} className="flex items-baseline justify-between gap-3 border-t border-line/70 pt-2">
                            <span>{phone.brand} {phone.model}</span>
                            <span className="num text-ink/70">{kes(phone.deposit)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )

  function updateLine(index: number, patch: Partial<Line>) {
    setState({ ...state, lines: state.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)) })
  }
}

function Select({ label, value, invalid, onChange, children }: { label: string; value: string; invalid: boolean; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="block text-sm">{label}
      <select aria-label={label} className={`mt-1 ${fieldClass(invalid)}`} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{label}</option>
        {children}
      </select>
    </label>
  )
}

function emptyLine(): Line {
  return { key: crypto.randomUUID(), supplierId: "", brand: "", phoneId: "", quantities: {} }
}

function blank(agents: Agent[], existing: Existing): State {
  const cash: Record<string, string> = {}
  for (const agent of agents) {
    const parsed = parseWhole(existing.sends.find((row) => row.agentId === agent.id)?.amount ?? "")
    if (parsed === null) continue
    cash[agent.regionId] = String((parseWhole(cash[agent.regionId] ?? "") ?? 0) + parsed)
  }
  return { lines: [emptyLine()], cash }
}

function hasQuantities(line: unknown): line is Partial<Line> {
  return line !== null && typeof line === "object" && "quantities" in line
}

function usableDraft(payload: unknown) {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { lines?: unknown }).lines)) return false
  return (payload as { lines: unknown[] }).lines.some((line) => hasQuantities(line))
}

function merge(fallback: State, payload: unknown, phones: Phone[], agents: Agent[]): State {
  if (!payload || typeof payload !== "object") return fallback
  const raw = payload as Partial<State> & { sends?: Record<string, string> }
  const lines = Array.isArray(raw.lines) ? raw.lines.flatMap((line) => (hasQuantities(line) ? [enrich(line, phones)] : [])) : []
  const next = { lines: lines.length ? lines : [emptyLine()], cash: { ...fallback.cash } }
  if (raw.cash && typeof raw.cash === "object") next.cash = { ...next.cash, ...raw.cash }
  if (raw.sends && typeof raw.sends === "object") {
    for (const agent of agents) {
      const parsed = parseWhole(raw.sends[agent.id] ?? "")
      if (parsed === null) continue
      next.cash[agent.regionId] = String((parseWhole(next.cash[agent.regionId] ?? "") ?? 0) + parsed)
    }
  }
  return next
}

function enrich(line: Partial<Line>, phones: Phone[]): Line {
  const phone = phones.find((item) => item.id === line.phoneId)
  return {
    key: line.key || crypto.randomUUID(),
    supplierId: line.supplierId || phone?.supplierId || "",
    brand: line.brand || phone?.brand || "",
    phoneId: line.phoneId ?? "",
    quantities: line.quantities ?? {},
  }
}

function started(line: Line) {
  return Boolean(line.supplierId || line.brand || line.phoneId || Object.values(line.quantities).some((value) => value.trim()))
}

function rowsFor(state: State) {
  const filled = state.lines.filter(started)
  return filled.length ? filled : state.lines.slice(0, 1)
}

function completeLines(state: State) {
  return state.lines.flatMap((line) => Object.entries(line.quantities).flatMap(([regionId, raw]) => {
    const quantity = parseWhole(raw)
    if (!line.phoneId || quantity === null || quantity <= 0) return []
    return [{ phoneId: line.phoneId, regionId, quantity }]
  }))
}

function missingFor(step: number, state: State, regions: Region[]) {
  const rows = rowsFor(state)
  if (step === 0) return rows.some((line) => !line.supplierId) ? ["a supplier"] : []
  if (step === 1) return rows.some((line) => !line.supplierId || !line.brand) ? ["a phone type"] : []
  if (step === 2) return rows.some((line) => !line.phoneId) ? ["a model"] : []
  if (step === 3) {
    const items: string[] = []
    if (rows.some((line) => regions.some((region) => parseWhole(line.quantities[region.id] ?? "") === null))) items.push("a quantity for each region")
    const seen = new Set<string>()
    for (const line of rows) {
      if (!line.phoneId) continue
      if (seen.has(line.phoneId)) items.push("each model only once")
      seen.add(line.phoneId)
    }
    return [...new Set(items)]
  }
  return regions
    .filter((region) => parseWhole(state.cash[region.id] ?? "") === null)
    .map((region) => `cash sent to ${region.name}`)
}

function brands(phones: Phone[], supplierId: string) {
  return [...new Set(phones.filter((phone) => phone.supplierId === supplierId).map((phone) => phone.brand))]
}

function hint(step: number) {
  if (step === 0) return "Choose one supplier. Add another only when a second phone is going out today."
  if (step === 1) return "Choose the phone type for that supplier."
  if (step === 2) return "Choose the model. The deposit for that phone is the one in the catalogue."
  if (step === 3) return "Both regions are listed. Enter the quantity for each one. Use 0 when a region receives none."
  return "Enter the cash sent to each region. Add 0 when nothing was sent."
}

