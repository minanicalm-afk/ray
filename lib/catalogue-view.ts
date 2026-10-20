import { phoneBadge, unseenSinceVisit } from "./catalogue"
import { formatStamp } from "./dates"
import { listPhones, listSuppliers, seenMap } from "./queries"

export function catalogueView(userId: string, includeInactive: boolean, today: string) {
  const seen = seenMap(userId)
  const phones = listPhones().filter((phone) => includeInactive || (phone.active && phone.supplierActive))
  const suppliers = listSuppliers().filter((supplier) => includeInactive || supplier.active)
  return suppliers
    .map((supplier) => ({
      supplierId: supplier.id,
      supplier: supplier.name,
      active: supplier.active,
      unseen: unseenSinceVisit(supplier.updatedAt, seen.get(`supplier:${supplier.id}`) ?? null),
      phones: phones
        .filter((phone) => phone.supplierId === supplier.id)
        .map((phone) => ({
          ...phone,
          badge: phoneBadge(phone, seen.get(`phone:${phone.id}`) ?? null, today),
          unseen: unseenSinceVisit(phone.updatedAt, seen.get(`phone:${phone.id}`) ?? null),
          when: phone.updatedAt > phone.createdAt ? `Updated ${formatStamp(phone.updatedAt)}` : `Added ${formatStamp(phone.createdAt)}`,
          by: phone.updatedAt > phone.createdAt ? phone.updatedByName : phone.createdByName,
        })),
    }))
    .filter((group) => includeInactive || group.phones.length > 0)
}
