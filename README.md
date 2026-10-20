# Ray

Phone sales and distribution dashboard. Admins, sales leads and sales agents share one set of books for suppliers, stock, daily deposit prices, units sold, and the cash leads use to pay customer deposits.

The catalogue starts empty. Regions begin as Mombasa and Nyandarua. Amounts are whole Kenyan shillings. Business dates use Africa/Nairobi.

## Roles

- **Admin** adds suppliers and phones, receives central stock, allocates it to regions, logs cash sent to each sales lead, and manages users. The admin can see every region and the audit log.
- **Sales lead** runs one region: confirms stock, sets the day’s price per phone, records cash received, records personal sales, pays each agent’s deposits, and enters one closing balance.
- **Sales agent** records only how many phones they sold. Agents do not see cash, prices, deposits or balances.

Each role updates its day through one guided flow. Drafts resume on any device. Nothing is committed to stock, cash or reports until Submit.

## Assumptions in this build

- Prices are set per phone model per day. A lead can apply one price to every model from a supplier, then change a model.
- Sales leads see the full active catalogue, not only phones allocated to their region.
- Only an admin can add or edit suppliers and phones.
- A lead records the amount paid for each agent. The system compares it with that agent’s expected deposits.
- The lead’s recorded cash received drives the books. The admin’s logged amount is only the match check.

## Setup

```bash
npm install
npm test
npm run dev
```

Open http://localhost:3000. The demo password for every account is `Ray-demo-2026`.

| Role | Email |
| --- | --- |
| Admin | admin@ray.test |
| Mombasa lead | mombasa.lead@ray.test |
| Nyandarua lead | nyandarua.lead@ray.test |
| Mombasa agent | mombasa.agent@ray.test |
| Mombasa agent two | mombasa.agent2@ray.test |
| Nyandarua agent | nyandarua.agent@ray.test |

Data is stored in `data/ray.db`. Delete that file to start again.
# ray
