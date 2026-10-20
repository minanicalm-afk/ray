"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { saveSupplier } from "@/app/actions/catalogue"
import { discardFlowDraft, saveFlowDraft } from "@/app/actions/flows"
import { cleanText, kes, parseWhole, sameText } from "@/lib/format"
import { Banner, btn, fieldClass } from "../ui"
import { FlowNav, Missing, RemoveRow, Steps } from "./chrome"

type PhoneDraft = { key: string; brand: string; model: string; deposit: string }
type State = { name: string; phones: PhoneDraft[] }

export function SupplierWizard({
  names,
  draft,
  embedded = false,
}: {
  names: string[]
  draft: { step: number; payload: unknown } | null
  embedded?: boolean
}) {
  const router = useRouter()
  const fallback: State = { name: "", phones: [{ key: "phone-1", brand: "", model: "", deposit: "" }] }
  const [step, setStep] = useState(validStep(draft?.step))
  const [state, setState] = useState<State>(merge(fallback, draft?.payload))
  const [reveal, setReveal] = useState(false)
  const [message, setMessage] = useState<{ type: "ok" | "err"; message: string } | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const missing = missingFor(step, state, names)
  const labels = ["Supplier", "Phones", "Review"]

  function saveDraft() {
    start(async () => {
      const result = await saveFlowDraft("supplier", "catalogue", "catalogue", step, state)
      setMessage(result.ok ? { type: "ok", message: "Draft saved. You can finish it on any device." } : { type: "err", message: result.error })
    })
  }

  function submit(another: boolean) {
    setReveal(true)
    if (missingFor(2, state, names).length) {
      setStep(firstInvalid(state, names))
      return
    }
    start(async () => {
      const result = await saveSupplier({
        name: state.name,
        phones: state.phones.map((phone) => ({ brand: phone.brand, model: phone.model, deposit: parseWhole(phone.deposit) ?? -1 })),
      })
      if (!result.ok) {
        setMessage({ type: "err", message: result.error })
        return
      }
      await discardFlowDraft("supplier", "catalogue", "catalogue")
      router.refresh()
      if (another) {
        setState(fallback)
        setStep(0)
        setReveal(false)
        setDone(null)
        setMessage({ type: "ok", message: `${cleanText(state.name)} saved. Add the next supplier.` })
      } else {
        setDone(cleanText(state.name))
        setMessage(null)
      }
    })
  }

  if (done) {
    return (
      <section className="rounded-3xl border border-line bg-panel p-6">
        <h2 className="font-serif text-3xl text-pine">{done} saved</h2>
        <p className="mt-2 text-sm">The supplier and its phones are in the catalogue. Sales leads will see them as new.</p>
        <div className="mt-6 flex gap-2">
          <button type="button" className={btn.primary} onClick={() => { setDone(null); setState({ name: "", phones: [{ key: crypto.randomUUID(), brand: "", model: "", deposit: "" }] }); setStep(0) }}>
            Start another
          </button>
          <a className={btn.ghost} href="/dashboard">Go to dashboard</a>
        </div>
      </section>
    )
  }

  return (
    <section className={embedded ? "" : "rounded-3xl border border-line bg-panel p-4 md:p-6"}>
      {message ? <Banner type={message.type} message={message.message} /> : null}
      {embedded ? <p className="mb-3 text-sm font-medium text-ink/70">{labels[step]}</p> : <Steps labels={labels} step={step} onStep={(next) => next < step && setStep(next)} />}
      {step === 0 ? (
        <label className="block text-sm">
          Supplier name
          <input className={`mt-1 ${fieldClass(reveal && !cleanText(state.name))}`} value={state.name} onChange={(event) => setState({ ...state, name: event.target.value })} onBlur={() => setReveal(true)} />
        </label>
      ) : null}
      {step === 1 ? (
        <div className="space-y-3">
          {state.phones.map((phone, index) => (
            <div key={phone.key} className="grid gap-2 md:grid-cols-[1fr_1fr_160px_auto]">
              <input aria-label="Phone brand" placeholder="Phone type or brand" className={fieldClass(reveal && !cleanText(phone.brand))} value={phone.brand} onBlur={() => setReveal(true)} onChange={(event) => updatePhone(index, { brand: event.target.value })} />
              <input aria-label="Phone model" placeholder="Phone model" className={fieldClass(reveal && !cleanText(phone.model))} value={phone.model} onBlur={() => setReveal(true)} onChange={(event) => updatePhone(index, { model: event.target.value })} />
              <input aria-label="Deposit amount" placeholder="Deposit, KES" inputMode="numeric" className={fieldClass(reveal && parseWhole(phone.deposit) === null)} value={phone.deposit} onBlur={() => setReveal(true)} onChange={(event) => updatePhone(index, { deposit: event.target.value })} />
              {state.phones.length > 1 ? <RemoveRow onClick={() => setState({ ...state, phones: state.phones.filter((item) => item.key !== phone.key) })} /> : <span />}
            </div>
          ))}
          <button type="button" className={btn.ghost} onClick={() => setState({ ...state, phones: [...state.phones, { key: crypto.randomUUID(), brand: "", model: "", deposit: "" }] })}>
            Add another phone
          </button>
        </div>
      ) : null}
      {step === 2 ? (
        <div>
          <h3 className="font-serif text-2xl">{cleanText(state.name) || "Supplier"}</h3>
          <ul className="mt-3 space-y-1 text-sm">
            {state.phones.map((phone) => (
              <li key={phone.key}>{cleanText(phone.brand)} {cleanText(phone.model)} · deposit {parseWhole(phone.deposit) === null ? "—" : kes(parseWhole(phone.deposit) ?? 0)}</li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={btn.ghost} onClick={() => setStep(0)}>Edit supplier</button>
            <button type="button" className={btn.ghost} onClick={() => setStep(1)}>Edit phones</button>
            <button type="button" className={btn.gold} disabled={pending} onClick={() => submit(true)}>Save and add another supplier</button>
          </div>
        </div>
      ) : null}
      <Missing items={reveal ? missing : []} />
      <FlowNav
        step={step}
        last={step === 2}
        canNext={missing.length === 0}
        pending={pending}
        submitLabel="Save supplier"
        onBack={() => setStep((value) => Math.max(0, value - 1))}
        onNext={() => {
          setReveal(true)
          if (!missing.length) {
            setReveal(false)
            setStep((value) => value + 1)
          }
        }}
        onDraft={saveDraft}
        onSubmit={() => submit(false)}
      />
    </section>
  )

  function updatePhone(index: number, patch: Partial<PhoneDraft>) {
    setState({
      ...state,
      phones: state.phones.map((phone, phoneIndex) => (phoneIndex === index ? { ...phone, ...patch } : phone)),
    })
  }
}

function merge(fallback: State, payload: unknown): State {
  if (!payload || typeof payload !== "object") return fallback
  const raw = payload as Partial<State>
  return {
    name: typeof raw.name === "string" ? raw.name : fallback.name,
    phones: Array.isArray(raw.phones) && raw.phones.length ? raw.phones.map((phone) => ({ key: phone.key || crypto.randomUUID(), brand: phone.brand ?? "", model: phone.model ?? "", deposit: phone.deposit ?? "" })) : fallback.phones,
  }
}

function validStep(step: number | undefined) {
  return step === 1 || step === 2 ? step : 0
}

function missingFor(step: number, state: State, names: string[]): string[] {
  if (step === 0) {
    const name = cleanText(state.name)
    if (!name) return ["supplier name"]
    if (names.some((item) => sameText(item, name))) return ["a supplier name that is not already used"]
    return []
  }
  if (step === 1) {
    const items: string[] = []
    if (!state.phones.length) items.push("at least one phone")
    if (state.phones.some((phone) => !cleanText(phone.brand) || !cleanText(phone.model) || parseWhole(phone.deposit) === null)) items.push("brand, model and deposit on every row")
    const duplicate = state.phones.some((phone, index) => state.phones.findIndex((other) => sameText(other.brand, phone.brand) && sameText(other.model, phone.model)) !== index)
    if (duplicate) items.push("each brand and model only once")
    return items
  }
  return [...missingFor(0, state, names), ...missingFor(1, state, names)]
}

function firstInvalid(state: State, names: string[]) {
  if (missingFor(0, state, names).length) return 0
  return 1
}
