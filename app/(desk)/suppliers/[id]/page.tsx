import { notFound, redirect } from "next/navigation"
import { deactivateSupplierAction, reactivateSupplierAction } from "@/app/actions/catalogue"
import { ConfirmButton } from "@/components/confirm-button"
import { SupplierEditor } from "@/components/supplier-editor"
import { PageHeader } from "@/components/ui"
import { getSupplier, phonesForSupplier } from "@/lib/queries"
import { requireUser } from "@/lib/session"

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (user.role !== "ADMIN") redirect("/suppliers")
  const { id } = await params
  const supplier = getSupplier(id)
  if (!supplier) notFound()
  const phones = phonesForSupplier(id)
  return (
    <>
      <PageHeader
        title={supplier.name}
        text="Saving updates the catalogue and writes to the audit log."
        action={supplier.active ? <ConfirmButton action={deactivateSupplierAction} message={`Deactivate ${supplier.name}?`} fields={{ id: supplier.id }}>Deactivate</ConfirmButton> : <ConfirmButton action={reactivateSupplierAction} tone="ghost" message={`Reactivate ${supplier.name}?`} fields={{ id: supplier.id }}>Reactivate</ConfirmButton>}
      />
      <SupplierEditor supplierId={supplier.id} name={supplier.name} active={supplier.active} phones={phones.map((phone) => ({ id: phone.id, brand: phone.brand, model: phone.model, deposit: phone.deposit, active: phone.active }))} />
    </>
  )
}
