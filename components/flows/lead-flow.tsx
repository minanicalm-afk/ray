"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { markCatalogueSeen } from "@/app/actions/catalogue"
import { saveFlowDraft, submitLead } from "@/app/actions/flows"
import { depositGap, expectedDeposits, startingCash, transactionAmount } from "@/lib/books"
import { formatDate } from "@/lib/dates"
import { kes, matchText, parseWhole, qty } from "@/lib/format"
import type { LeadSummary } from "@/lib/types"
import { Badge, Banner, btn, fieldClass } from "../ui"
import { FlowNav, Missing, RemoveRow, Steps } from "./chrome"

type Phone = { id: string; supplierId: string; supplierName: string; brand: string; model: string; deposit?: number }
type Person = { id: string; name: string; self: boolean; submitted: boolean; lines: { phoneId: string; quantity: number; label: string; supplier: string }[] }
type Sale = { key: string; phoneId: string; quantity: string }
type State = {
  openings: Record<string, string>
  confirmed: Record<string, boolean>
  prices: Record<string, string>
  broughtForward: string
  cashReceived: string
  sales: Sale[]
  payments: Record<string, string>
  closing: string
}
type CatalogueGroup = {
  supplier: string
  unseen: boolean
  phones: { id: string; brand: string; model: string; badge: "New" | "Updated" | null; when: string; by: string; unseen: boolean }[]
}

export function LeadFlow({
  date,
  regionId,
  regionName,
  phones,
  stockPhones,
  received,
  suggested,
  soldByOthers,
  people,
  carried,
  sent,
  existing,
  draft,
  submitted,
  catalogue,
}: {
  date: string
  regionId: string
  regionName: string
  phones: Phone[]
  stockPhones: Phone[]
  received: Record<string, number>
  suggested: Record<string, number | null>
  soldByOthers: Record<string, number>
  people: Person[]
  carried: { amount: number; from: string } | null
  sent: number | null
  existing: {
    openings: { phoneId: string; quantity: string; confirmed: boolean }[]
    prices: { phoneId: string; price: string }[]
    broughtForward: string
    cashReceived: string
    closing: string
    sales: { phoneId: string; quantity: string }[]
    payments: { agentId: string; amount: string }[]
  }
  draft: { step: number; payload: unknown } | null
  submitted: boolean
  catalogue: CatalogueGroup[]
}) {
  const router = useRouter()
  const fallback = useMemo(() => blank(stockPhones, phones, people, existing, carried), [stockPhones, phones, people, existing, carried])
  const [step, setStep] = useState(draft?.step ?? 0)
  const [state, setState] = useState<State>(merge(fallback, draft?.payload, carried))
  const [apply, setApply] = useState<Record<string, string>>({})
  const [reveal, setReveal] = useState(false)
  const [message, setMessage] = useState<{ type: "ok" | "err"; message: string } | null>(null)
  const [summary, setSummary] = useState<LeadSummary | null>(null)
  const [pending, start] = useTransition()
  const labels = ["Catalogue", "Stock", "Prices", "Cash", "Sales", "Deposits", "Review"]
  const brought = carried ? carried.amount : parseWhole(state.broughtForward)
  const receivedCash = parseWhole(state.cashReceived)
  const closing = parseWhole(state.closing)
  const starting = brought !== null && receivedCash !== null ? startingCash(brought, receivedCash) : null
  const transaction = starting !== null && closing !== null ? transactionAmount(starting, closing) : null
  const missing = missingFor(step, state, stockPhones, phones, people, received, carried)
  const unseen = catalogue.some((group) => group.unseen || group.phones.some((phone) => phone.unseen))

  function saveDraft() {
    start(async () => {
      const result = await saveFlowDraft("lead_closeout", date, regionId, step, state)
      setMessage(result.ok ? { type: "ok", message: "Draft saved." } : { type: "err", message: result.error })
    })
  }

  function submit() {
    start(async () => {
      const result = await submitLead(regionId, date, {
        openings: stockPhones.map((phone) => ({
          phoneId: phone.id,
          quantity: parseWhole(state.openings[phone.id] ?? "") ?? -1,
          confirmed: (received[phone.id] ?? 0) > 0 ? Boolean(state.confirmed[phone.id]) : true,
        })),
        prices: phones.map((phone) => ({ phoneId: phone.id, price: parseWhole(state.prices[phone.id] ?? "") ?? -1 })),
        broughtForward: brought ?? -1,
        cashReceived: receivedCash ?? -1,
        sales: state.sales.filter((line) => line.phoneId).map((line) => ({ phoneId: line.phoneId, quantity: parseWhole(line.quantity) ?? 0 })),
        payments: people.map((person) => ({ agentId: person.id, amount: parseWhole(state.payments[person.id] ?? "") ?? -1 })),
        closingBalance: closing ?? -1,
      })
      if (!result.ok) {
        setMessage({ type: "err", message: result.error })
        return
      }
      setSummary(result.summary)
    })
  }

  if (summary) {
    return (
      <section className="rounded-3xl border border-line bg-panel p-6">
        <h2 className="font-serif text-3xl text-pine">{summary.updated ? "Close-out updated" : "Close-out saved"}</h2>
        <p className="mt-2 text-sm">{summary.region} · {formatDate(summary.date)}. Starting cash {kes(summary.startingCash)}. Transaction {kes(summary.transaction)}. Expected deposits {kes(summary.expected)}.</p>
        <p className="mt-1 text-sm">Cash check: {summary.match}. Closing balance {kes(summary.closingBalance)} carries forward.</p>
        <ul className="mt-4 space-y-1 text-sm">
          {summary.payments.map((payment) => (
            <li key={payment.name}>{payment.name}: paid {kes(payment.paid)} · expected {kes(payment.expected)}{payment.difference === 0 ? "" : ` · difference ${kes(payment.difference)}`}</li>
          ))}
        </ul>
        <div className="mt-6 flex gap-2">
          <button type="button" className={btn.primary} onClick={() => setSummary(null)}>Start another</button>
          <a className={btn.ghost} href="/dashboard">Go to dashboard</a>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-3xl border border-line bg-panel p-4 md:p-6">
      {draft ? <Banner type="ok" message="A draft for this date was restored." /> : null}
      {message ? <Banner type={message.type} message={message.message} /> : null}
      <p className="mb-3 text-sm text-ink/60">{regionName}</p>
      <Steps labels={labels} step={step} onStep={setStep} />
      {step === 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">{unseen ? "These phones were added or updated since you last marked the catalogue as seen." : "No unseen catalogue changes."}</p>
            <button type="button" className={btn.ghost} disabled={pending} onClick={() => start(async () => { const result = await markCatalogueSeen(); setMessage(result.ok ? { type: "ok", message: "Catalogue marked as seen." } : { type: "err", message: result.error }); router.refresh() })}>Mark as seen</button>
          </div>
          {catalogue.length === 0 ? <p className="text-sm">The admin has not added any active phones yet.</p> : catalogue.map((group) => (
            <div key={group.supplier}>
              <h3 className="font-medium">{group.supplier}</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {group.phones.map((phone) => (
                  <li key={phone.id} className="flex flex-wrap items-center gap-2">
                    <span>{phone.brand} {phone.model}</span>
                    {phone.badge ? <Badge kind={phone.badge} /> : null}
                    <span className="text-ink/50">{phone.when} · {phone.by}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      {step === 1 ? (
        <div className="space-y-3">
          <button type="button" className={btn.ghost} onClick={() => {
            const openings = { ...state.openings }
            const confirmed = { ...state.confirmed }
            for (const phone of stockPhones) {
              if (suggested[phone.id] !== null && suggested[phone.id] !== undefined) openings[phone.id] = String(Math.max(0, suggested[phone.id] as number))
              if ((received[phone.id] ?? 0) > 0) confirmed[phone.id] = true
            }
            setState({ ...state, openings, confirmed })
          }}>Use suggested and confirm all</button>
          {stockPhones.length === 0 ? <p className="text-sm">No active phones to count.</p> : stockPhones.map((phone) => (
            <div key={phone.id} className="grid gap-2 rounded-2xl border border-line p-3 md:grid-cols-[1.4fr_90px_90px_1fr_auto]">
              <p className="text-sm">{phone.supplierName} · {phone.brand} {phone.model}<br /><span className="text-ink/50">Received today {qty(received[phone.id] ?? 0)} · Suggested {suggested[phone.id] ?? "—"}</span></p>
              <p className="num text-sm">{qty(received[phone.id] ?? 0)}</p>
              {(received[phone.id] ?? 0) > 0 ? (
                <label className="text-sm"><input type="checkbox" checked={Boolean(state.confirmed[phone.id])} onChange={(event) => setState({ ...state, confirmed: { ...state.confirmed, [phone.id]: event.target.checked } })} /> Confirm</label>
              ) : <span />}
              <input aria-label={`Opening stock for ${phone.brand} ${phone.model}`} inputMode="numeric" className={fieldClass(reveal && parseWhole(state.openings[phone.id] ?? "") === null)} value={state.openings[phone.id] ?? ""} onBlur={() => setReveal(true)} onChange={(event) => setState({ ...state, openings: { ...state.openings, [phone.id]: event.target.value } })} />
            </div>
          ))}
        </div>
      ) : null}
      {step === 2 ? (
        <div className="space-y-5">
          <p className="text-sm text-ink/70">Each amount starts from the deposit set on that phone. Expected deposits for the day’s sales use it.</p>
          {groupBySupplier(phones).map((group) => (
            <div key={group.id}>
              <div className="mb-2 flex flex-wrap items-end gap-2">
                <label className="text-sm">Price for {group.name}
                  <input inputMode="numeric" className={`mt-1 ${fieldClass(false)}`} value={apply[group.id] ?? ""} onChange={(event) => setApply({ ...apply, [group.id]: event.target.value })} />
                </label>
                <button type="button" className={btn.ghost} onClick={() => {
                  const price = parseWhole(apply[group.id] ?? "")
                  if (price === null) {
                    setReveal(true)
                    setMessage({ type: "err", message: `Enter one price for ${group.name} before applying it.` })
                    return
                  }
                  const prices = { ...state.prices }
                  for (const phone of group.phones) prices[phone.id] = String(price)
                  setState({ ...state, prices })
                  setMessage({ type: "ok", message: `Applied ${kes(price)} to all ${group.name} models.` })
                }}>Apply to all models of this supplier</button>
              </div>
              <div className="space-y-2">
                {group.phones.map((phone) => (
                  <label key={phone.id} className="grid gap-2 text-sm md:grid-cols-[1fr_160px]">
                    <span>{phone.brand} {phone.model}{phone.deposit ? ` · deposit ${kes(phone.deposit)}` : ""}</span>
                    <input aria-label={`Price for ${phone.brand} ${phone.model}`} inputMode="numeric" className={fieldClass(reveal && parseWhole(state.prices[phone.id] ?? "") === null)} value={state.prices[phone.id] ?? ""} onBlur={() => setReveal(true)} onChange={(event) => setState({ ...state, prices: { ...state.prices, [phone.id]: event.target.value } })} />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {step === 3 ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">Balance brought forward{carried ? ` · carried from ${formatDate(carried.from)}` : ""}
            <input inputMode="numeric" className={`mt-1 ${fieldClass(!carried && reveal && brought === null)}`} value={carried ? String(carried.amount) : state.broughtForward} readOnly={Boolean(carried)} onChange={(event) => setState({ ...state, broughtForward: event.target.value })} />
          </label>
          <p className="text-sm">Admin logged as sent<span className="num mt-2 block text-lg">{sent === null ? "Not logged" : kes(sent)}</span></p>
          <label className="text-sm">Cash you received
            <input inputMode="numeric" className={`mt-1 ${fieldClass(reveal && receivedCash === null)}`} value={state.cashReceived} onBlur={() => setReveal(true)} onChange={(event) => setState({ ...state, cashReceived: event.target.value })} />
          </label>
          <p className="text-sm">Check<span className="mt-2 block font-medium">{matchText(sent, receivedCash)}</span></p>
          <p className="text-sm">Starting cash<span className="num mt-2 block text-lg">{starting === null ? "—" : kes(starting)}</span></p>
        </div>
      ) : null}
      {step === 4 ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-medium">Your sales</h3>
            {state.sales.map((line, index) => {
              const available = line.phoneId ? availableFor(line.phoneId, line.key) : null
              return (
                <div key={line.key} className="grid gap-2 md:grid-cols-[1fr_120px_auto]">
                  <select aria-label="Phone" className={fieldClass(reveal && !line.phoneId)} value={line.phoneId} onChange={(event) => updateSale(index, { phoneId: event.target.value })}>
                    <option value="">Phone</option>
                    {phones.map((phone) => <option key={phone.id} value={phone.id}>{phone.supplierName} · {phone.brand} {phone.model}</option>)}
                  </select>
                  <input aria-label="Quantity sold" inputMode="numeric" className={fieldClass(reveal && (parseWhole(line.quantity) === null || (parseWhole(line.quantity) ?? 0) <= 0))} value={line.quantity} onBlur={() => setReveal(true)} onChange={(event) => updateSale(index, { quantity: event.target.value })} />
                  <RemoveRow onClick={() => setState({ ...state, sales: state.sales.filter((item) => item.key !== line.key) })} />
                  {available !== null ? <p className="text-xs text-ink/60 md:col-span-3">{qty(Math.max(available, 0))} available</p> : null}
                </div>
              )
            })}
            <button type="button" className={btn.ghost} onClick={() => setState({ ...state, sales: [...state.sales, { key: crypto.randomUUID(), phoneId: "", quantity: "" }] })}>Add another</button>
          </div>
          <div>
            <h3 className="font-medium">Agents</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {people.filter((person) => !person.self).map((person) => (
                <li key={person.id} className="rounded-2xl border border-line p-3">
                  <span className="mr-2">{person.name}</span>
                  <Badge kind={person.submitted ? "Submitted" : "Pending"} />
                  {person.lines.length ? <p className="mt-1">{person.lines.map((line) => `${line.supplier} ${line.label} × ${line.quantity}`).join(", ")} · Expected {kes(expectedFor(person))}</p> : <p className="mt-1 text-ink/60">{person.submitted ? "No phones sold." : "Not submitted yet."}</p>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {step === 5 ? (
        <div className="space-y-3">
          <button type="button" className={btn.ghost} onClick={() => {
            const payments = { ...state.payments }
            for (const person of people) payments[person.id] = String(expectedFor(person))
            setState({ ...state, payments })
          }}>Use expected for all</button>
          {people.map((person) => {
            const expected = expectedFor(person)
            const paid = parseWhole(state.payments[person.id] ?? "")
            const gap = paid === null ? null : paid - expected
            return (
              <label key={person.id} className={`block rounded-2xl border p-3 text-sm ${gap && gap !== 0 ? "border-gold bg-gold-soft" : "border-line"}`}>
                {person.name} · expected {kes(expected)}
                <input inputMode="numeric" className={`mt-1 ${fieldClass(reveal && paid === null)}`} value={state.payments[person.id] ?? ""} onBlur={() => setReveal(true)} onChange={(event) => setState({ ...state, payments: { ...state.payments, [person.id]: event.target.value } })} />
                {gap !== null && gap !== 0 ? <span className="mt-1 block">Difference {kes(gap)}</span> : null}
              </label>
            )
          })}
          <label className="block text-sm">Closing balance
            <input inputMode="numeric" className={`mt-1 ${fieldClass(reveal && closing === null)}`} value={state.closing} onBlur={() => setReveal(true)} onChange={(event) => setState({ ...state, closing: event.target.value })} />
          </label>
          <p className="text-sm">Transaction <span className="num">{transaction === null ? "—" : kes(transaction)}</span></p>
          <p className="text-sm">Expected deposits <span className="num">{kes(totalExpected())}</span>{transaction !== null ? ` · difference ${kes(depositGap(transaction, totalExpected()))}` : ""}</p>
        </div>
      ) : null}
      {step === 6 ? (
        <div className="space-y-3 text-sm">
          <Row label="Stock" onEdit={() => setStep(1)} text={stockPhones.map((phone) => `${phone.brand} ${phone.model} opening ${state.openings[phone.id] || "—"}`).join("; ") || "No phones."} />
          <Row label="Prices" onEdit={() => setStep(2)} text={phones.map((phone) => `${phone.model} ${state.prices[phone.id] ? kes(parseWhole(state.prices[phone.id]) ?? 0) : "—"}`).join("; ") || "No phones."} />
          <Row label="Cash" onEdit={() => setStep(3)} text={`Brought forward ${brought === null ? "—" : kes(brought)}. Received ${receivedCash === null ? "—" : kes(receivedCash)}. ${matchText(sent, receivedCash)}. Starting ${starting === null ? "—" : kes(starting)}.`} />
          <Row label="Your sales" onEdit={() => setStep(4)} text={state.sales.filter((line) => line.phoneId).map((line) => `${phoneName(line.phoneId)} × ${line.quantity}`).join("; ") || "No personal sales."} />
          <Row label="Deposits and closing" onEdit={() => setStep(5)} text={people.map((person) => `${person.name} ${state.payments[person.id] || "—"}`).join("; ") + (closing === null ? "" : `. Closing ${kes(closing)}. Transaction ${transaction === null ? "—" : kes(transaction)}.`) } />
        </div>
      ) : null}
      <Missing items={reveal ? missing : []} />
      <FlowNav
        step={step}
        last={step === 6}
        canNext={missing.length === 0}
        pending={pending}
        submitLabel={submitted ? "Update submission" : "Submit"}
        onBack={() => setStep((value) => Math.max(0, value - 1))}
        onNext={() => {
          setReveal(true)
          if (!missing.length) {
            setReveal(false)
            setStep((value) => value + 1)
          }
        }}
        onDraft={saveDraft}
        onSubmit={submit}
      />
    </section>
  )

  function updateSale(index: number, patch: Partial<Sale>) {
    setState({ ...state, sales: state.sales.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)) })
  }

  function priceOf(phoneId: string) {
    return parseWhole(state.prices[phoneId] ?? "")
  }

  function expectedFor(person: Person) {
    if (person.self) {
      return expectedDeposits(state.sales.filter((line) => line.phoneId && parseWhole(line.quantity)).map((line) => ({ quantity: parseWhole(line.quantity) ?? 0, price: priceOf(line.phoneId) ?? 0 })))
    }
    return expectedDeposits(person.lines.map((line) => ({ quantity: line.quantity, price: priceOf(line.phoneId) ?? 0 })))
  }

  function totalExpected() {
    return people.reduce((sum, person) => sum + expectedFor(person), 0)
  }

  function availableFor(phoneId: string, key: string) {
    const opening = parseWhole(state.openings[phoneId] ?? "") ?? 0
    const mine = state.sales.filter((line) => line.phoneId === phoneId && line.key !== key).reduce((sum, line) => sum + (parseWhole(line.quantity) ?? 0), 0)
    return opening + (received[phoneId] ?? 0) - (soldByOthers[phoneId] ?? 0) - mine
  }

  function phoneName(phoneId: string) {
    const phone = phones.find((item) => item.id === phoneId) ?? stockPhones.find((item) => item.id === phoneId)
    return phone ? `${phone.brand} ${phone.model}` : "Phone"
  }
}

function blank(
  stockPhones: Phone[],
  phones: Phone[],
  people: Person[],
  existing: {
    openings: { phoneId: string; quantity: string; confirmed: boolean }[]
    prices: { phoneId: string; price: string }[]
    broughtForward: string
    cashReceived: string
    closing: string
    sales: { phoneId: string; quantity: string }[]
    payments: { agentId: string; amount: string }[]
  },
  carried: { amount: number } | null,
): State {
  return {
    openings: Object.fromEntries(stockPhones.map((phone) => [phone.id, existing.openings.find((row) => row.phoneId === phone.id)?.quantity ?? ""])),
    confirmed: Object.fromEntries(stockPhones.map((phone) => [phone.id, existing.openings.find((row) => row.phoneId === phone.id)?.confirmed ?? false])),
    prices: Object.fromEntries(phones.map((phone) => {
      const saved = existing.prices.find((row) => row.phoneId === phone.id)?.price
      if (saved) return [phone.id, saved]
      return [phone.id, phone.deposit ? String(phone.deposit) : ""]
    })),
    broughtForward: carried ? String(carried.amount) : existing.broughtForward,
    cashReceived: existing.cashReceived,
    sales: existing.sales.map((row) => ({ key: crypto.randomUUID(), ...row })),
    payments: Object.fromEntries(people.map((person) => [person.id, existing.payments.find((row) => row.agentId === person.id)?.amount ?? ""])),
    closing: existing.closing,
  }
}

function merge(fallback: State, payload: unknown, carried: { amount: number } | null): State {
  if (!payload || typeof payload !== "object") return fallback
  const raw = payload as Partial<State>
  return {
    ...fallback,
    ...raw,
    openings: { ...fallback.openings, ...raw.openings },
    confirmed: { ...fallback.confirmed, ...raw.confirmed },
    prices: { ...fallback.prices, ...raw.prices },
    payments: { ...fallback.payments, ...raw.payments },
    sales: Array.isArray(raw.sales) ? raw.sales : fallback.sales,
    broughtForward: carried ? String(carried.amount) : raw.broughtForward ?? fallback.broughtForward,
  }
}

function missingFor(step: number, state: State, stockPhones: Phone[], phones: Phone[], people: Person[], received: Record<string, number>, carried: { amount: number } | null) {
  if (step === 1) {
    const items: string[] = []
    for (const phone of stockPhones) {
      if (parseWhole(state.openings[phone.id] ?? "") === null) items.push(`opening stock for ${phone.brand} ${phone.model}`)
      if ((received[phone.id] ?? 0) > 0 && !state.confirmed[phone.id]) items.push(`confirmation for ${phone.brand} ${phone.model}`)
    }
    return items
  }
  if (step === 2) return phones.filter((phone) => parseWhole(state.prices[phone.id] ?? "") === null).map((phone) => `price for ${phone.brand} ${phone.model}`)
  if (step === 3) {
    const items: string[] = []
    if (!carried && parseWhole(state.broughtForward) === null) items.push("balance brought forward")
    if (parseWhole(state.cashReceived) === null) items.push("cash received")
    return items
  }
  if (step === 4) {
    const items: string[] = []
    if (state.sales.some((line) => !line.phoneId || (parseWhole(line.quantity) ?? 0) <= 0)) items.push("a phone and quantity on every sale")
    if (state.sales.some((line, index) => line.phoneId && state.sales.findIndex((other) => other.phoneId === line.phoneId) !== index)) items.push("each phone only once")
    return items
  }
  if (step === 5) {
    const items = people.filter((person) => parseWhole(state.payments[person.id] ?? "") === null).map((person) => `amount paid for ${person.name}`)
    if (parseWhole(state.closing) === null) items.push("closing balance")
    return items
  }
  return []
}

function groupBySupplier(phones: Phone[]) {
  const groups = new Map<string, { id: string; name: string; phones: Phone[] }>()
  for (const phone of phones) {
    const group = groups.get(phone.supplierId) ?? { id: phone.supplierId, name: phone.supplierName, phones: [] }
    group.phones.push(phone)
    groups.set(phone.supplierId, group)
  }
  return [...groups.values()]
}

function Row({ label, text, onEdit }: { label: string; text: string; onEdit: () => void }) {
  return (
    <div>
      <div className="flex justify-between"><h3 className="font-medium">{label}</h3><button type="button" className={btn.tiny} onClick={onEdit}>Edit</button></div>
      <p>{text}</p>
    </div>
  )
}
