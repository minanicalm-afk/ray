import Link from "next/link"
import { Suspense } from "react"
import { deactivateSupplierAction, reactivateSupplierAction } from "@/app/actions/catalogue"
import { ConfirmButton } from "@/components/confirm-button"
import { SearchBox } from "@/components/list-controls"
import { Badge, Empty, PageHeader, btn } from "@/components/ui"
import { catalogueView } from "@/lib/catalogue-view"
import { businessToday } from "@/lib/dates"
import { queryValue, type Query } from "@/lib/filters"
import { kes } from "@/lib/format"
import { requireUser } from "@/lib/session"

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireUser()
  if (user.role === "SALES_AGENT") return <p>Your phone choices appear when you record a sale.</p>
  const query = await searchParams
  const q = queryValue(query, "q").toLowerCase()
  const groups = catalogueView(user.id, user.role === "ADMIN", businessToday())
    .map((group) => ({
      ...group,
      phones: group.phones.filter((phone) => !q || `${group.supplier} ${phone.brand} ${phone.model}`.toLowerCase().includes(q)),
    }))
    .filter((group) => group.phones.length > 0 || (!q && group.active === false))

  return (
    <>
      <PageHeader
        title={user.role === "ADMIN" ? "Suppliers" : "Suppliers and phones"}
        text={user.role === "ADMIN" ? "Each supplier, with the phone type, model, and deposit used when that phone is sold." : "Phones added or changed in the last 7 days are marked."}
        action={user.role === "ADMIN" ? <Link className={btn.primary} href="/suppliers/new">Add Supplier</Link> : <SeenButton />}
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-serif text-2xl">Catalogue</h2>
        <Suspense><SearchBox placeholder="Search supplier or phone" /></Suspense>
      </div>
      {groups.length === 0 ? <Empty>No records match these filters</Empty> : (
        <div className="grid gap-4">
          {groups.map((group) => (
            <article key={group.supplierId} className="rounded-3xl border border-line bg-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-3xl text-pine">{group.supplier}</h3>
                  {group.active ? null : <p className="mt-1 text-sm text-ink/60">Inactive. Hidden from new stock and sales. History stays.</p>}
                </div>
                {user.role === "ADMIN" ? (
                  <div className="flex flex-wrap gap-2">
                    <Link className={btn.ghost} href={`/suppliers/${group.supplierId}`}>Update</Link>
                    {group.active ? (
                      <ConfirmButton action={deactivateSupplierAction} message={`Deactivate ${group.supplier}? New entries will hide this supplier. History stays.`} fields={{ id: group.supplierId }}>Deactivate</ConfirmButton>
                    ) : (
                      <ConfirmButton action={reactivateSupplierAction} tone="ghost" message={`Reactivate ${group.supplier}?`} fields={{ id: group.supplierId }}>Reactivate</ConfirmButton>
                    )}
                  </div>
                ) : null}
              </div>
              {group.phones.length === 0 ? <p className="mt-4 text-sm text-ink/60">No phones yet.</p> : (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {group.phones.map((phone) => (
                    <div key={phone.id} className="rounded-2xl bg-mist/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-ink/50">{phone.brand}</p>
                          <p className="font-serif text-2xl">{phone.model}</p>
                        </div>
                        <div className="flex flex-wrap justify-end gap-1">
                          {phone.badge ? <Badge kind={phone.badge} /> : null}
                          {phone.active ? null : <Badge kind="Inactive" />}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Figure label="Deposit" value={kes(phone.deposit)} hint="Used when this phone is sold" />
                        <Figure label="Catalogue" value={phone.active && group.active ? "Active" : "Inactive"} hint={`${phone.when} · ${phone.by}`} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  )
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-panel px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-ink/50">{label}</p>
      <p className="num mt-1 text-2xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink/60">{hint}</p> : null}
    </div>
  )
}

function SeenButton() {
  return (
    <form action={async () => {
      "use server"
      const { markSeen } = await import("@/lib/catalogue-write")
      const { listPhones, listSuppliers } = await import("@/lib/queries")
      const { requireUser } = await import("@/lib/session")
      const { revalidatePath } = await import("next/cache")
      const { setFlash } = await import("@/lib/flash")
      const { redirect } = await import("next/navigation")
      const user = await requireUser()
      if (user.role !== "SALES_LEAD") redirect("/suppliers")
      markSeen(user, listPhones().map((phone) => phone.id), listSuppliers().map((supplier) => supplier.id))
      revalidatePath("/", "layout")
      await setFlash("ok", "Catalogue marked as seen.")
      redirect("/suppliers")
    }}>
      <button className={btn.ghost}>Mark as seen</button>
    </form>
  )
}
