"use client"

import { useState, useTransition } from "react"
import { addSupplierPhone, deactivatePhoneAction, editPhone, reactivatePhoneAction, renameSupplier } from "@/app/actions/catalogue"
import { parseWhole } from "@/lib/format"
import { ConfirmButton } from "./confirm-button"
import { Banner, btn, fieldClass } from "./ui"

type Phone = { id: string; brand: string; model: string; deposit: number; active: boolean }

export function SupplierEditor({ supplierId, name, active, phones }: { supplierId: string; name: string; active: boolean; phones: Phone[] }) {
  const [supplierName, setSupplierName] = useState(name)
  const [rows, setRows] = useState(phones.map((phone) => ({ ...phone, deposit: String(phone.deposit) })))
  const [added, setAdded] = useState<{ key: string; brand: string; model: string; deposit: string }[]>([])
  const [message, setMessage] = useState<{ type: "ok" | "err"; message: string } | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="space-y-4">
      {message ? <Banner type={message.type} message={message.message} /> : null}
      <section className="rounded-3xl border border-line bg-panel p-5">
        <h2 className="font-serif text-2xl text-pine">Supplier</h2>
        <p className="mt-1 text-sm text-ink/60">{active ? "This name is what appears on stock, sales, and daily setup." : "Inactive. Hidden from new stock and sales. History stays."}</p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            start(async () => {
              const result = await renameSupplier(supplierId, supplierName)
              setMessage(result.ok ? { type: "ok", message: "Supplier name saved." } : { type: "err", message: result.error })
            })
          }}
        >
          <label className="min-w-64 flex-1 text-sm">Name
            <input className={`mt-1 ${fieldClass(false)}`} value={supplierName} onChange={(event) => setSupplierName(event.target.value)} />
          </label>
          <button className={btn.primary} disabled={pending || !active}>Save name</button>
        </form>
      </section>
      <section className="rounded-3xl border border-line bg-panel p-5">
        <h2 className="font-serif text-2xl text-pine">Phones</h2>
        <p className="mt-1 text-sm text-ink/60">Phone type, model, and the deposit used when that phone is sold.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {rows.map((phone, index) => (
            <div key={phone.id} className="rounded-2xl bg-mist/70 p-4">
              <div className="grid gap-3">
                <label className="block text-sm">Phone type
                  <input aria-label="Phone type" className={`mt-1 ${fieldClass(false)}`} value={phone.brand} onChange={(event) => setRows(rows.map((row, rowIndex) => rowIndex === index ? { ...row, brand: event.target.value } : row))} />
                </label>
                <label className="block text-sm">Phone model
                  <input aria-label="Phone model" className={`mt-1 ${fieldClass(false)}`} value={phone.model} onChange={(event) => setRows(rows.map((row, rowIndex) => rowIndex === index ? { ...row, model: event.target.value } : row))} />
                </label>
                <label className="block text-sm">Deposit, KES
                  <input aria-label="Deposit amount" inputMode="numeric" className={`mt-1 ${fieldClass(false)}`} value={phone.deposit} onChange={(event) => setRows(rows.map((row, rowIndex) => rowIndex === index ? { ...row, deposit: event.target.value } : row))} />
                </label>
              </div>
              <p className="mt-3 text-xs text-ink/60">{phone.active ? "Active. Available for new stock and sales." : "Inactive. Hidden from new entries. History stays."}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={btn.primary} disabled={pending} onClick={() => start(async () => {
                  const deposit = parseWhole(phone.deposit)
                  if (deposit === null) {
                    setMessage({ type: "err", message: "Enter a whole-shilling deposit amount." })
                    return
                  }
                  const result = await editPhone(phone.id, phone.brand, phone.model, deposit)
                  setMessage(result.ok ? { type: "ok", message: "Phone saved." } : { type: "err", message: result.error })
                })}>Save</button>
                {phone.active ? (
                  <ConfirmButton action={deactivatePhoneAction} message={`Deactivate ${phone.brand} ${phone.model}? It will disappear from new entries. History stays.`} fields={{ id: phone.id, supplierId }}>Deactivate</ConfirmButton>
                ) : (
                  <ConfirmButton action={reactivatePhoneAction} tone="ghost" message={`Reactivate ${phone.brand} ${phone.model}?`} fields={{ id: phone.id, supplierId }}>Reactivate</ConfirmButton>
                )}
              </div>
            </div>
          ))}
          {added.map((phone) => (
            <div key={phone.key} className="rounded-2xl bg-mist/70 p-4">
              <div className="grid gap-3">
                <label className="block text-sm">Phone type
                  <input aria-label="Phone type" placeholder="Samsung" className={`mt-1 ${fieldClass(false)}`} value={phone.brand} onChange={(event) => setAdded(added.map((row) => row.key === phone.key ? { ...row, brand: event.target.value } : row))} />
                </label>
                <label className="block text-sm">Phone model
                  <input aria-label="Phone model" placeholder="Galaxy A15" className={`mt-1 ${fieldClass(false)}`} value={phone.model} onChange={(event) => setAdded(added.map((row) => row.key === phone.key ? { ...row, model: event.target.value } : row))} />
                </label>
                <label className="block text-sm">Deposit, KES
                  <input aria-label="Deposit amount" inputMode="numeric" placeholder="3900" className={`mt-1 ${fieldClass(false)}`} value={phone.deposit} onChange={(event) => setAdded(added.map((row) => row.key === phone.key ? { ...row, deposit: event.target.value } : row))} />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={btn.primary} disabled={pending} onClick={() => start(async () => {
                  const deposit = parseWhole(phone.deposit)
                  if (deposit === null) {
                    setMessage({ type: "err", message: "Enter a whole-shilling deposit amount." })
                    return
                  }
                  const result = await addSupplierPhone(supplierId, phone.brand, phone.model, deposit)
                  if (!result.ok) {
                    setMessage({ type: "err", message: result.error })
                    return
                  }
                  setAdded(added.filter((row) => row.key !== phone.key))
                  setMessage({ type: "ok", message: "Phone added." })
                  window.location.reload()
                })}>Save phone</button>
                <button type="button" className={btn.ghost} onClick={() => setAdded(added.filter((row) => row.key !== phone.key))}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className={`${btn.ghost} mt-4`} onClick={() => setAdded([...added, { key: crypto.randomUUID(), brand: "", model: "", deposit: "" }])}>Add another phone</button>
      </section>
    </div>
  )
}
