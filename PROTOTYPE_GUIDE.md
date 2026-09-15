# RFQ → Quotation Prototype — Field Guide

Live app: **https://rfq-quotation-prototype.vercel.app**

A frontend-only walkthrough of the enterprise pulley quoting system — who does what, how a request for quote moves from a customer call to a signed quotation, and where the detailed costing tools plug in. No backend, mock data throughout, built to be walked end to end.

- Roles: **6**
- Pipeline stages: **9**
- Costing screens: **7**
- Demo RFQ: `RFQ-2026-00124`

---

## The six roles

The login screen has a demo button per role — click one to enter as that person. A role switcher lives under your name in the header, so you can hop between roles without logging out. Each role sees its own dashboard, its own sidebar, and only the actions that belong to it.

### Sales — Ananya Sharma
- Creates the RFQ, picks the pulley product, fills its Technical Data Sheet
- Submits for Operations review, tracks it through the pipeline
- Generates the quotation once approved, sends it, records Won / Lost

**Dashboard:** pipeline funnel, my action items, customer response chart

### Operations — Rakesh Menon
- Checks technical feasibility, delivery, and commercial acceptability
- Approve & Continue, Send Back, or Reject — with mandatory comments on the last two

**Dashboard:** pending / overdue reviews, approval ratio

### Sourcing — Divya Prasad
- Compares vendor quotes — and in-house lines, where the pulley is eligible — per item
- Selects the best source by price, lead time, or recommendation; submits to Controlling

**Dashboard:** sourcing queue, average price by source, savings achieved

### Controlling — Vikram Desai
- Builds commercial pricing — freight, duties, discount, margin, tax — per item
- Flags low-margin quotes before they reach Approval; submits for sign-off

**Dashboard:** pending costing, margin distribution, low-margin alerts

### Approval Panel — Sunita Rao
- Reviews the complete picture — cost, selling price, margin, terms
- Approve, Reject, or Send Back to Controlling / Sourcing / Sales — comment required on any negative call

**Dashboard:** approval queue with value and margin per RFQ

### Admin — Admin User
- Sees the org-wide pipeline and every team's current workload
- Manages Users & Roles, Audit Log, Settings — including Reset Demo Data

**Dashboard:** total RFQs, win rate, pipeline value, team workload

---

## The lifecycle

Every RFQ walks the same nine stages in order. The role name next to each stage is whoever needs to act before it can move on — that's also whose task list it shows up on.

| # | Stage | Owner | What happens |
|---|---|---|---|
| 1 | Draft | Sales | Pick a pulley product, fill its Technical Data Sheet from the customer, add as many pulleys as the quote needs |
| 2 | Operations Review | Operations | Feasibility, delivery, and commercial checks. Approve to move on, or send it back with a reason |
| 3 | Sourcing | Sourcing | Compare vendors (and in-house, where eligible) per item, pick the best source, submit to Controlling |
| 4 | Controlling | Controlling | Build the commercial price: freight, duties, discount, margin, tax. Submit once margin clears target |
| 5 | Approval Pending | Approval Panel | Final sign-off on cost, price, margin and terms |
| 6 | Approved | Sales | Back with Sales. One click generates the customer-facing quotation |
| 7 | Quotation Generated → Sent | Sales | Preview the printable quotation, mark it sent to the customer |
| 8 | Won / Lost | Sales | Record the customer's decision — a loss requires a reason (price, delivery, competitor, technical…) |

**Return paths:** Operations, Sourcing, Controlling and Approval can each Send Back to an earlier stage, or Reject outright — both require a comment, and both land on Sales' task list with the reason attached.

---

## The costing tool suite

Sidebar → **Costing Tool**. Seven screens, each a faithful rebuild of one tab from the client's actual pricing workbook — same fields, same formulas, verified against the source numbers. They sit alongside the RFQ workflow rather than inside it for now.

| Screen | Route | What it does |
|---|---|---|
| Technical Data Sheet | `/tech-data` | Full customer spec capture — body, hub, shaft, bearings, lagging, locking device, sourcing per process, in-house hours. Also opens directly from RFQ item creation |
| Pricing Tool | `/pricing-tool` | Computed cost buildup (Sections A–F) for any RFQ's items, live from their Technical Data |
| Cost Rate Tables | `/cost-rate-tables` | The master rate card — exchange rate, GST, material ₹/kg, labour ₹/hr, lagging prices, logistics rates |
| Raw Forging Prices | `/raw-forging-prices` | Shaft and shell raw material rates by size band, with the in-house / outsourced split |
| Bearing & Sleeve Data | `/bearing-sleeve-data` | Searchable catalogs — 96 bearings, 81 adapter sleeves, 73 housings — powering the Technical Data Sheet's selectors |
| Delivery Schedule | `/delivery-schedule` | 27 production activities across six phases; change a sourcing choice and the critical-path lead time recalculates live |
| MHR & LHR Calculator | `/mhr-lhr-calculator` | The machine-hour / labour-hour economics — depreciation, power, maintenance, wages — behind every labour rate above |

---

## Go through it yourself

Three ways in, roughly in order of how deep you want to go:

1. **Walk the demo RFQ** — Log in as Sales, switch roles as you go, and push `RFQ-2026-00124` all the way from Operations Review to Won using the role switcher under your name.
2. **Start a fresh one** — Log in as Sales, hit Add Pulley, pick a product and fill its Technical Data Sheet, then submit — watch it pick up real numbers in Pricing Tool once it's costed.
3. **Take the guided tour** — Click Start Tour in the header on any role's dashboard for a short spotlight walkthrough of that role's queue and primary action.

**Tip:** Everything lives in your browser's local storage — nothing you do here affects anyone else. If a session gets tangled, Admin → Settings → Reset Demo Data puts it back exactly as seeded.
