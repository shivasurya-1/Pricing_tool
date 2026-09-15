# Step-by-Step Workflow — What to Open, In Order

Live app: **https://rfq-quotation-prototype.vercel.app**

This is a click-by-click runbook: open this page, click this button, this happens next. Follow it top to bottom to walk one RFQ all the way from a customer enquiry to a signed quotation. For the "who does what" overview instead, see `PROTOTYPE_GUIDE.md`.

**Before you start:** everything is mock data in your browser's local storage. Nothing you click here affects anyone else, and you can always reset with **Admin → Settings → Reset Demo Data**.

---

## Step 0 — Log in

1. Open the live app URL. You land on the **Sign in** page.
2. Ignore the email/password form (any prototype credentials work) — scroll to **Demo Role Login** and click **Sales**.
3. You land on the **Sales Dashboard**.

You don't need to log out to change roles later — there's a role switcher under your name in the top-right header (click your name → **Switch role**). Steps below tell you exactly when to use it.

---

## Part 0 — Master Data (set up once, before your first RFQ)

The demo already seeds this data, so you can skip straight to Part 1 for a normal walkthrough. Do this part first only if you want to demo adding a brand-new customer or vendor before running an RFQ for them — RFQ creation and Sourcing both pick from these lists, they don't let you type a new one inline.

Sidebar → **Master Data**. Three screens, each visible only to the roles that actually touch it:

| Screen | Route | Who sees it | What you can do |
|---|---|---|---|
| Customers | `/customers` | Sales, Admin | Click **Add Customer**, fill name/contact/email/phone/city/GST/payment terms, save. Needed before Part 1 — the Create RFQ page's Customer dropdown only lists what's here |
| Vendors | `/vendors` | Sourcing, Controlling, Admin | Click **Add Vendor**, fill name/category/contact/payment terms, save. Optional — only used in Part 3 to tag which vendor an *outsourced* process went to |
| Products / Materials | `/products` | Sales, Sourcing, Controlling, Admin | **View-only** — the fixed pulley catalog Technical Data Sheet and pricing are built around. Click a row to see its spec sheet in a drawer. There's no Add here; new pulley models aren't part of this prototype's scope |

**In short:** if the customer you need already exists, skip this part entirely and start at Part 1.

---

## Part 1 — Sales creates the RFQ

**Role: Sales.**

| Step | Page | Action |
|---|---|---|
| 1 | Sidebar → **RFQs** | Click **Create RFQ** (top right) |
| 2 | **Create RFQ** page | Pick a **Customer** from the dropdown — this auto-fills contact person, email, phone, payment terms, and location |
| 3 | Same page | Fill **Project Name**, **Required Delivery Date**, and **Priority**. Leave the commercial fields (payment/delivery terms, Incoterms) on their defaults unless the customer specified otherwise |
| 4 | Same page, **Items** section | Click **Add Pulley** |
| 5 | Product picker (modal) | Select the pulley product the customer wants, then click **Next: Fill Technical Data** |
| 6 | **Technical Data Sheet** drawer opens automatically | Fill in what the customer gave you: body dimensions, hub, shaft, bearings/housings/sleeves, lagging, locking device. Leave **Section 8 (Sourcing Selection)** and **Section 9 (In-House Hours)** for now — Sourcing fills those in later. Click **Done** when finished |
| 7 | Back on Create RFQ | The item row now shows a **Captured** badge. Repeat steps 4–6 for every pulley in this quote |
| 8 | Bottom of page | Click **Submit RFQ** |

**Result:** the RFQ is created and lands in **Operations Review**. You're dropped on its detail page — note the RFQ number (e.g. `RFQ-2026-00125`).

---

## Part 2 — Operations checks feasibility

**Switch role:** click your name (top right) → **Switch role** → **Operations**.

| Step | Page | Action |
|---|---|---|
| 1 | Sidebar → **RFQs** | Find the RFQ (it shows stage **Operations Review**) and click into it, or go straight to **My Tasks** and click it there |
| 2 | RFQ detail page | Click **Review** / open the Operations Review screen for this RFQ |
| 3 | **Operations Review** page, Items table | Click **View Spec** on any item to check the full Technical Data Sheet the customer gave Sales, before deciding |
| 4 | Right-hand panel | Pick one option in each of the three checks: **Technical feasibility**, **Delivery**, **Commercial review** |
| 5 | Same panel | Click **Approve & Continue** |

**If something's wrong:** use **Send Back** (returns it to Sales with a required comment) or **Reject** (ends the RFQ, also with a required reason) instead of approving.

**Result:** the RFQ moves to **Sourcing**.

---

## Part 3 — Sourcing reviews components and processes

**Switch role:** **Sourcing**.

This is the most detailed screen — sourcing here works **per component and per process**, not one vendor for the whole pulley.

| Step | Page | Action |
|---|---|---|
| 1 | Sidebar → **Sourcing** (or **RFQs**, filter by stage) | Open the RFQ |
| 2 | **Sourcing** page, per item | Review the **Bought-Out Components** table — bearings, adapter sleeve, housing, lagging, locking device — these are always purchased, and their price already comes from the catalog the customer's spec pointed to |
| 3 | Same item, below | Review the **In-House / Outsource Processes** table — 7 rows: Rolling/Bending Shell, Welding, Stress Relief Annealing, Turning/Machining, Lagging Application, Static Balancing, Painting/Blasting |
| 4 | Per process row | Click **In-house**, **Outsource**, or **Logistics** to set (or change) how that process is sourced. The **Cost** column recalculates live as you toggle it |
| 5 | If you set a process to **Outsource** | Pick a vendor from the dropdown in that row (optional — informational tag only) |
| 6 | Once you're satisfied with every row | Click **Confirm Sourcing for this Item** (bottom of that item's card) |
| 7 | Repeat steps 2–6 | For every item in the RFQ |
| 8 | Bottom of page | Add a sourcing comment if useful, then click **Submit to Controlling** (disabled until every item is confirmed) |

**Result:** the RFQ moves to **Controlling**, carrying the real per-component/per-process cost forward.

---

## Part 4 — Controlling builds the commercial price

**Switch role:** **Controlling**.

| Step | Page | Action |
|---|---|---|
| 1 | Sidebar → **Pricing / Costing** | Open the RFQ |
| 2 | **Commercial Pricing** page, Cost Breakdown table | **Base Cost** per item is already filled in (from Sourcing's confirmed components/processes) — click the product name to **View Spec** if you want to double-check it |
| 3 | Same row | Edit **Freight**, **Duties**, **Other**, **Discount**, **Margin %**, and **Tax %** as needed. Adjusted Cost, Selling Price, and Final Price recalculate live |
| 4 | Bottom summary card | Check the overall **Margin %** against the target shown — a warning banner appears if it's below target |
| 5 | Same card | Click **Save Calculation** any time, or **Submit for Approval** when done |
| 6 | If margin is below target | A confirm dialog appears — click **Submit Anyway** to proceed regardless |

**Result:** the RFQ moves to **Approval Pending**.

---

## Part 5 — Approval Panel signs off

**Switch role:** **Approval Panel**.

| Step | Page | Action |
|---|---|---|
| 1 | Sidebar → **Approvals** | Open the RFQ |
| 2 | **Final Approval** page | Check the top KPI row: Cost, Selling Price, Margin, Tax, Grand Total |
| 3 | **Items** tab | Click **View Spec** per row for the full technical data if needed |
| 4 | **Sourcing** tab | Review the confirmed component/process breakdown per item — same view Sourcing built |
| 5 | Right-hand **Decision** panel | Add a comment (optional to approve, required to send back/reject), then click **Approve** |

**Result:** the RFQ moves to **Approved** and returns to Sales' task list.

---

## Part 6 — Sales generates and sends the quotation

**Switch role:** **Sales**.

| Step | Page | Action |
|---|---|---|
| 1 | Sidebar → **RFQs** | Open the RFQ — it now shows stage **Approved** |
| 2 | RFQ detail page | Click **Generate Quotation** |
| 3 | **Quotation detail** page (opens automatically) | Review the printable quotation preview |
| 4 | Same page | Click **Mark as Sent** once it's gone out to the customer |
| 5 | Same page, once the customer responds | Click **Won** (or **Lost**, which requires a reason: price, delivery, competitor, technical…) |

**Result:** the quotation is closed out. That's the full lifecycle, start to finish.

---

## Reference: the Costing Tool screens

These sit in the sidebar under **Costing Tool** and aren't steps in the pipeline above — they're the underlying rate tables and calculators the numbers on every screen above are computed from. Open them any time to see where a number came from. Visibility is role-scoped, so not every role sees every screen.

| Screen | Route | Open it to see... |
|---|---|---|
| Pricing Tool | `/pricing-tool` | The full Section A–F cost buildup for any RFQ's items, computed live from their Technical Data |
| Cost Rate Tables | `/cost-rate-tables` | The master rate card — exchange rate, GST, material ₹/kg, labour ₹/hr, logistics rates |
| Raw Forging Prices | `/raw-forging-prices` | Shaft and shell raw material rates by size band |
| Bearing & Sleeve Data | `/bearing-sleeve-data` | The searchable catalogs (96 bearings, 81 sleeves, 73 housings) that feed the Technical Data Sheet's dropdowns |
| Delivery Schedule | `/delivery-schedule` | The 27-activity production schedule and critical-path lead time |
| MHR & LHR Calculator | `/mhr-lhr-calculator` | The machine-hour/labour-hour economics behind every labour rate |

**Who fills these in — and why they're view-only for now:** every one of these numbers feeds the pipeline directly — the Technical Data Sheet's bearing/sleeve/housing/lagging/locking-device dropdowns pull from these catalogs, and Controlling's base cost in Part 4 comes straight out of the labour rates, material rates, exchange rate, GST, and markup shown on Cost Rate Tables. So this *is* the master data the whole quoting engine runs on — it's just not editable yet. Right now it's a faithful, fixed replica of the client's Excel workbook, with no Add/Edit/Save on any of these five screens (Delivery Schedule's per-activity toggles are a live what-if simulator, not a saved edit — they reset on refresh). That's deliberate: real editing needs an approval/audit trail, which is scoped for the backend phase, after client sign-off on this frontend.

Once that's built, ownership would logically split by who already owns the adjacent decision: **Cost Rate Tables & MHR/LHR Calculator** (labour rates, GST, markup) → Controlling/Admin, since Controlling owns commercial pricing today. **Raw Forging Prices & Bearing/Sleeve Data** (procurement catalogs) → Sourcing/Controlling. **Delivery Schedule's base activity durations** → Operations/Admin.

---

## Shortcuts

- **Skip the manual walkthrough:** log in as Sales, open `RFQ-2026-00124` (the seeded demo RFQ), and switch roles as you go — it's already partway through the pipeline.
- **Guided tour:** click **Start Tour** in the header on any role's dashboard for a short spotlight tour of that role's own queue and primary action button.
- **Something looks stuck or broken:** Admin → **Settings** → **Reset Demo Data**.
