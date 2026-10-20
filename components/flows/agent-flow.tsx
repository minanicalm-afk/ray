"use client"

import { useMemo, useState, useTransition } from "react"
import { saveFlowDraft, submitAgent } from "@/app/actions/flows"
import { formatDate } from "@/lib/dates"
import { parseWhole, qty } from "@/lib/format"
import type { AgentSummary } from "@/lib/types"
import { Banner, btn, fieldClass } from "../ui"
import { FlowNav, Missing, RemoveRow, Steps } from "./chrome"

type Phone = { id: string; supplierId: string; supplierName: string; brand: string; model: string }
type Line = { key: string; supplierId: string; phoneId: string; quantity: string; saved?: boolean }
type State = { lines: Line[]; supplierId: string; phoneId: string; quantity: string }

export function AgentFlow({
  date,
  agentId,
  phones,
  available,
  existing,
  draft,
  submitted,
}: {
  date: string
  agentId: string
  phones: Phone[]
  available: Record<string, number>
  existing: { phoneId: string; quantity: string }[]
  draft: { step: number; payload: unknown } | null
  submitted: boolean
}) {
  const fallback = useMemo<State>(() => ({
    lines: existing.map((line) => ({
      key: crypto.randomUUID(),
      supplierId: phones.find((phone) => phone.id === line.phoneId)?.supplierId ?? "",
      phoneId: line.phoneId,
      quantity: line.quantity,
      saved: true,
    })),
    supplierId: "",
    phoneId: "",
    quantity: "",
  }), [existing, phones])
  const [step, setStep] = useState(draft?.step ?? 0)
  const [state, setState] = useState<State>(merge(fallback, draft?.payload))
  const [reveal, setReveal] = useState(false)
  const [message, setMessage] = useState<{ type: "ok" | "err"; message: string } | null>(null)
  const [summary, setSummary] = useState<AgentSummary | null>(null)
  const [pending, start] = useTransition()
  const suppliers = [...new Map(phones.map((phone) => [phone.supplierId, phone.supplierName])).entries()]
  const models = phones.filter((phone) => phone.supplierId === state.supplierId)
  const missing = missingFor(step, state)
  const labels = ["Supplier", "Model and quantity", "Review"]

  function saveDraft() {
    start(async () => {
      const result = await saveFlowDraft("agent_sales", date, agentId, step, state)
      setMessage(result.ok ? { type: "ok", message: "Draft saved." } : { type: "err", message: result.error })
    })
  }

  function currentLine(): Line | null {
    if (!state.supplierId && !state.phoneId && !state.quantity) return null
    return { key: crypto.randomUUID(), supplierId: state.supplierId, phoneId: state.phoneId, quantity: state.quantity }
  }

  function withCurrent() {
    const line = currentLine()
    if (!line) return state.lines
    return [...state.lines, line]
  }

  function submit(lines: Line[]) {
    start(async () => {
      const result = await submitAgent(
        agentId,
        date,
        { lines: lines.filter((line) => line.phoneId).map((line) => ({ phoneId: line.phoneId, quantity: parseWhole(line.quantity) ?? 0 })) },
      )
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
        <h2 className="font-serif text-3xl text-pine">{summary.updated ? "Sales updated" : "Sales saved"}</h2>
        <p className="mt-2 text-sm">{formatDate(summary.date)} · {qty(summary.units)} phones.</p>
        <ul className="mt-3 text-sm">
          {summary.lines.map((line) => <li key={`${line.supplier}-${line.model}`}>{line.supplier} · {line.brand} {line.model} × {qty(line.quantity)}</li>)}
        </ul>
        {summary.lines.length === 0 ? <p className="text-sm">You recorded no sales for this date.</p> : null}
        <div className="mt-6 flex gap-2">
          <button type="button" className={btn.primary} onClick={() => setSummary(null)}>Start another</button>
          <a className={btn.ghost} href="/dashboard">Go to dashboard</a>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-3xl border border-line bg-panel p-4 md:p-6">
      {message ? <Banner type={message.type} message={message.message} /> : null}
      <Steps labels={labels} step={step} onStep={setStep} />
      {step === 0 ? (
        <div>
          <label className="block text-sm">Supplier
            <select className={`mt-1 ${fieldClass(reveal && !state.supplierId && state.lines.length === 0)}`} value={state.supplierId} onChange={(event) => setState({ ...state, supplierId: event.target.value, phoneId: "" })}>
              <option value="">Choose a supplier</option>
              {suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <button type="button" className={`${btn.ghost} mt-4`} onClick={() => { setState({ ...state, supplierId: "", phoneId: "", quantity: "" }); setStep(2) }}>Submit no sales</button>
        </div>
      ) : null}
      {step === 1 ? (
        <div className="space-y-3">
          <label className="block text-sm">Phone model
            <select className={`mt-1 ${fieldClass(reveal && state.quantity !== "" && !state.phoneId)}`} value={state.phoneId} onChange={(event) => setState({ ...state, phoneId: event.target.value })}>
              <option value="">Choose a model</option>
              {models.map((phone) => <option key={phone.id} value={phone.id}>{phone.brand} {phone.model}</option>)}
            </select>
          </label>
          <label className="block text-sm">Quantity sold
            <input inputMode="numeric" className={`mt-1 ${fieldClass(reveal && state.phoneId !== "" && (parseWhole(state.quantity) ?? 0) <= 0)}`} value={state.quantity} onBlur={() => setReveal(true)} onChange={(event) => setState({ ...state, quantity: event.target.value })} />
          </label>
          {state.phoneId ? <p className="text-sm">{qty(Math.max(left(state.phoneId, state.lines, available), 0))} available</p> : null}
          <button type="button" className={btn.ghost} onClick={() => {
            setReveal(true)
            if (!complete(state) || duplicate(state)) return
            setState({ lines: withCurrent(), supplierId: "", phoneId: "", quantity: "" })
            setStep(0)
            setReveal(false)
          }}>Add another</button>
          <LineList lines={state.lines} phones={phones} onRemove={(key) => setState({ ...state, lines: state.lines.filter((line) => line.key !== key) })} />
        </div>
      ) : null}
      {step === 2 ? (
        <div>
          <h3 className="font-medium">Today’s lines</h3>
          <LineList lines={pendingLines(state)} phones={phones} onRemove={(key) => setState({ ...state, lines: state.lines.filter((line) => line.key !== key), phoneId: state.phoneId && key === "pending" ? "" : state.phoneId, quantity: key === "pending" ? "" : state.quantity })} />
          {pendingLines(state).length === 0 ? <p className="text-sm text-ink/70">No sales will be recorded.</p> : null}
          <button type="button" className={`${btn.tiny} mt-3`} onClick={() => setStep(0)}>Edit</button>
        </div>
      ) : null}
      <Missing items={reveal ? missing : []} />
      <FlowNav
        step={step}
        last={step === 2}
        canNext={step === 0 ? Boolean(state.supplierId) : step === 1 ? state.lines.length > 0 || complete(state) : true}
        pending={pending}
        submitLabel={submitted ? "Update submission" : "Submit"}
        onBack={() => setStep((value) => Math.max(0, value - 1))}
        onNext={() => {
          setReveal(true)
          if (step === 0 && state.supplierId) {
            setReveal(false)
            setStep(1)
          }
          if (step === 1) {
            if (state.phoneId || state.quantity) {
              if (!complete(state) || duplicate(state)) return
              setState({ lines: withCurrent(), supplierId: "", phoneId: "", quantity: "" })
            } else if (state.lines.length === 0) return
            setReveal(false)
            setStep(2)
          }
        }}
        onDraft={saveDraft}
        onSubmit={() => {
          if ((state.phoneId || state.quantity || state.supplierId) && !complete(state) && step === 2) {
            setMessage({ type: "err", message: "Finish the model and quantity, or clear that line before submitting." })
            return
          }
          if (duplicate(state)) {
            setMessage({ type: "err", message: "That phone is already on the list." })
            return
          }
          const pending = currentLine()
          submit(pending && complete(state) ? [...state.lines, pending] : state.lines)
        }}
        />
    </section>
  )
}

function pendingLines(state: State) {
  const line = state.phoneId ? [{ key: "pending", supplierId: state.supplierId, phoneId: state.phoneId, quantity: state.quantity }] : []
  return [...state.lines, ...line]
}

function complete(state: State) {
  return Boolean(state.supplierId && state.phoneId && (parseWhole(state.quantity) ?? 0) > 0)
}

function duplicate(state: State) {
  return state.lines.some((line) => line.phoneId === state.phoneId)
}

function left(phoneId: string, lines: Line[], available: Record<string, number>) {
  const used = lines.filter((line) => line.phoneId === phoneId).reduce((sum, line) => sum + (parseWhole(line.quantity) ?? 0), 0)
  return (available[phoneId] ?? 0) - used
}

function merge(fallback: State, payload: unknown): State {
  if (!payload || typeof payload !== "object") return fallback
  const raw = payload as Partial<State>
  return { ...fallback, ...raw, lines: Array.isArray(raw.lines) ? raw.lines : fallback.lines }
}

function missingFor(step: number, state: State) {
  if (step === 0) return state.supplierId || state.lines.length ? [] : ["a supplier, or submit no sales"]
  if (step === 1) {
    const items: string[] = []
    if ((state.phoneId || state.quantity) && !complete(state)) items.push("a model and quantity")
    if (duplicate(state)) items.push("each phone only once")
    if (!state.lines.length && !complete(state)) items.push("at least one line, or go back and submit no sales")
    return items
  }
  return []
}

function LineList({ lines, phones, onRemove }: { lines: Line[]; phones: Phone[]; onRemove: (key: string) => void }) {
  if (!lines.length) return null
  return (
    <ul className="space-y-2 text-sm">
      {lines.map((line) => {
        const phone = phones.find((item) => item.id === line.phoneId)
        return (
          <li key={line.key} className="flex items-center justify-between rounded-2xl border border-line px-3 py-2">
            <span>{phone ? `${phone.supplierName} · ${phone.brand} ${phone.model}` : "Phone"} × {line.quantity}</span>
            <RemoveRow onClick={() => onRemove(line.key)} />
          </li>
        )
      })}
    </ul>
  )
}
