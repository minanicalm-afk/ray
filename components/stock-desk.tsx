"use client"

import { useMemo, useState, useTransition } from "react"
import { allocateStock, receiveStock } from "@/app/actions/stock"
import { parseWhole, qty } from "@/lib/format"
import { Banner, btn, fieldClass } from "./ui"

type Phone = { id: string; supplierId: string; supplierName: string; brand: string; model: string }
type Region = { id: string; name: string }

export function StockDesk({
  date,
  phones,
  regions,
  allocated,
  centre,
}: {
  date: string
  phones: Phone[]
  regions: Region[]
  allocated: Record<string, number>
  centre: Record<string, number>
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ReceiveCard date={date} phones={phones} />
      <AllocateCard date={date} phones={phones} regions={regions} allocated={allocated} centre={centre} />
    </div>
  )
}

function ReceiveCard({ date, phones }: { date: string; phones: Phone[] }) {
  const [phoneId, setPhoneId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [reveal, setReveal] = useState(false)
  const [message, setMessage] = useState<{ type: "ok" | "err"; message: string } | null>(null)
  const [pending, start] = useTransition()
  const phone = phones.find((item) => item.id === phoneId)

  return (
    <section className="rounded-3xl border border-line bg-panel p-5">
      <h2 className="font-serif text-2xl text-pine">Stock received</h2>
      <p className="mt-1 text-sm text-ink/60">Record phones that arrived from a supplier. This adds to the centre, before they are allocated.</p>
      {message ? <div className="mt-4"><Banner type={message.type} message={message.message} /></div> : null}
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          setReveal(true)
          const amount = parseWhole(quantity)
          if (!phoneId || amount === null || amount <= 0) return
          start(async () => {
            const result = await receiveStock(date, phoneId, amount)
            if (!result.ok) {
              setMessage({ type: "err", message: result.error })
              return
            }
            setQuantity("")
            setMessage({ type: "ok", message: `${amount} ${phone ? `${phone.brand} ${phone.model}` : "phones"} received.` })
          })
        }}
      >
        <PhoneFields phones={phones} phoneId={phoneId} invalid={reveal && !phoneId} onChange={setPhoneId} />
        <label className="block text-sm">Quantity
          <input inputMode="numeric" className={`mt-1 ${fieldClass(reveal && (parseWhole(quantity) ?? 0) <= 0)}`} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </label>
        <button className={btn.primary} disabled={pending}>Record received</button>
      </form>
    </section>
  )
}

function AllocateCard({
  date,
  phones,
  regions,
  allocated,
  centre,
}: {
  date: string
  phones: Phone[]
  regions: Region[]
  allocated: Record<string, number>
  centre: Record<string, number>
}) {
  const [phoneId, setPhoneId] = useState("")
  const [regionId, setRegionId] = useState(regions[0]?.id ?? "")
  const [quantity, setQuantity] = useState("")
  const [reveal, setReveal] = useState(false)
  const [message, setMessage] = useState<{ type: "ok" | "err"; message: string } | null>(null)
  const [pending, start] = useTransition()
  const key = `${phoneId}:${regionId}`
  const current = allocated[key] ?? 0
  const available = (centre[phoneId] ?? 0) + current
  const phone = phones.find((item) => item.id === phoneId)
  const region = regions.find((item) => item.id === regionId)

  const hint = useMemo(() => {
    if (!phoneId || !regionId) return "Choose a phone and a region."
    return `${region?.name ?? "Region"} has ${qty(current)} today. ${qty(available)} can be allocated.`
  }, [phoneId, regionId, region?.name, current, available])

  return (
    <section className="rounded-3xl border border-line bg-panel p-5">
      <h2 className="font-serif text-2xl text-pine">Allocation</h2>
      <p className="mt-1 text-sm text-ink/60">Set how many of a model go to a region today. This replaces that region’s quantity for the day.</p>
      {message ? <div className="mt-4"><Banner type={message.type} message={message.message} /></div> : null}
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          setReveal(true)
          const amount = parseWhole(quantity)
          if (!phoneId || !regionId || amount === null) return
          start(async () => {
            const result = await allocateStock(date, phoneId, regionId, amount)
            if (!result.ok) {
              setMessage({ type: "err", message: result.error })
              return
            }
            setQuantity("")
            setMessage({ type: "ok", message: `${region?.name ?? "Region"} now has ${qty(amount)} ${phone ? `${phone.brand} ${phone.model}` : ""}.` })
          })
        }}
      >
        <PhoneFields phones={phones} phoneId={phoneId} invalid={reveal && !phoneId} onChange={setPhoneId} />
        <label className="block text-sm">Region
          <select className={`mt-1 ${fieldClass(reveal && !regionId)}`} value={regionId} onChange={(event) => setRegionId(event.target.value)}>
            <option value="">Region</option>
            {regions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="block text-sm">Quantity
          <input inputMode="numeric" className={`mt-1 ${fieldClass(reveal && parseWhole(quantity) === null)}`} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </label>
        <p className="text-xs text-ink/60">{hint}</p>
        <button className={btn.primary} disabled={pending}>Update allocation</button>
      </form>
    </section>
  )
}

function PhoneFields({ phones, phoneId, invalid, onChange }: { phones: Phone[]; phoneId: string; invalid: boolean; onChange: (phoneId: string) => void }) {
  const selected = phones.find((phone) => phone.id === phoneId)
  const [supplierId, setSupplierId] = useState(selected?.supplierId ?? "")
  const [brand, setBrand] = useState(selected?.brand ?? "")
  const suppliers = [...new Map(phones.map((phone) => [phone.supplierId, phone.supplierName])).entries()]
  const brands = [...new Set(phones.filter((phone) => phone.supplierId === supplierId).map((phone) => phone.brand))]
  const models = phones.filter((phone) => phone.supplierId === supplierId && phone.brand === brand)
  return (
    <div className="grid gap-3">
      <label className="block text-sm">Supplier
        <select className={`mt-1 ${fieldClass(invalid && !supplierId)}`} value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setBrand(""); onChange("") }}>
          <option value="">Supplier</option>
          {suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <label className="block text-sm">Phone type
        <select className={`mt-1 ${fieldClass(invalid && !brand)}`} value={brand} onChange={(event) => { setBrand(event.target.value); onChange("") }}>
          <option value="">Phone type</option>
          {brands.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="block text-sm">Phone model
        <select className={`mt-1 ${fieldClass(invalid && !phoneId)}`} value={phoneId} onChange={(event) => onChange(event.target.value)}>
          <option value="">Phone model</option>
          {models.map((phone) => <option key={phone.id} value={phone.id}>{phone.model}</option>)}
        </select>
      </label>
    </div>
  )
}
