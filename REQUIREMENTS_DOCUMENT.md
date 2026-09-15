# RFQ → Quotation Management System — Requirements Document

**System:** Industrial pulley RFQ-to-Quotation platform

---

## 1. Purpose

The system manages the complete lifecycle of a customer request for quotation (RFQ) for industrial drum/drive pulleys — from initial technical data capture through sourcing, commercial pricing, internal approval, and final quotation — as a structured, role-based workflow. It replaces a manual, spreadsheet-based process with a single system where every stage, decision, and cost figure is tracked and auditable.

---

## 2. Scope

The system covers:
- Customer, vendor, and product master data
- RFQ intake and full technical specification capture per pulley
- Component- and process-level sourcing decisions (in-house vs. outsourced)
- Commercial pricing, margin control, and multi-stage internal approval
- Quotation generation, delivery, and outcome tracking
- A reference costing engine (material rates, labour rates, component catalogs) that drives every calculated price
- A dynamic, per-order delivery schedule
- Reporting, analytics, notifications, task management, and a full audit trail
- Administration: users, roles, and system settings

---

## 3. User Roles & Permissions

| Role | Responsibility | Access |
|---|---|---|
| **Sales** | Creates RFQs, captures technical data, generates and sends quotations, records Won/Lost | RFQs, Quotations, Customers, Products (view), Pricing Tool, Bearing & Sleeve Data, Delivery Schedule |
| **Operations** | Reviews technical feasibility, delivery feasibility, and commercial acceptability | RFQs (review stage only) |
| **Sourcing** | Confirms make/buy decisions per component and process | RFQs (sourcing stage), Vendors, Products, Raw Forging Prices, Bearing & Sleeve Data, Delivery Schedule |
| **Controlling** | Builds commercial pricing and margin | RFQs (costing stage), Vendors, Products, Cost Rate Tables, Raw Forging Prices, MHR & LHR Calculator |
| **Approval Panel** | Final sign-off on price, margin, and terms | RFQs (approval stage), Pricing Tool |
| **Admin** | Full system administration | Every module, plus Users & Roles, Audit Log, Settings |

Every screen and action is restricted to the roles listed above; a user should never see navigation or data outside their role's responsibility.

---

## 4. Functional Requirements by Module

### 4.1 Authentication & Session
- Users shall log in and be assigned exactly one active role per session.
- A user shall be able to switch roles from the header without a full logout, for testing/demo and multi-hat use cases.
- The system shall remember the logged-in user's role and identity across a session.

### 4.2 Dashboards
- Each role shall land on a dashboard summarizing their own queue: pending items, overdue items, and role-specific KPIs (e.g. Sales sees pipeline funnel and customer response; Sourcing sees items pending confirmation and in-house/outsourced cost split; Controlling sees margin distribution and low-margin alerts; Approval Panel sees its approval queue with value and margin; Admin sees org-wide pipeline and team workload).
- Each dashboard shall provide one-click access to the role's next primary action (e.g. "Review", "Confirm Sourcing", "Calculate Pricing", "Approve").
- A guided tour shall be available from every dashboard, walking a new user through that role's queue and primary action.

### 4.3 RFQ Management
- The system shall maintain a searchable, filterable list of all RFQs, showing stage, customer, value, priority, and age.
- A user shall be able to create a new RFQ against an existing customer, capturing project details, commercial terms (payment terms, delivery terms, Incoterms, tax applicability, validity), and priority.
- An RFQ shall contain one or more pulley line items, each linked to a product and a fully captured Technical Data Sheet.
- The RFQ detail view shall present, in tabs: overview, items, technical data, sourcing summary, computed pricing, commercial terms, approval status, and a complete activity/audit history.
- The system shall enforce a single linear stage progression per RFQ (see Section 5), with defined return paths for send-back and rejection.

### 4.4 Technical Data Sheet Capture
- For each pulley line item, Sales shall capture: project information, body dimensions, hub specification, shaft specification, bearings/housings/sleeves, lagging, locking device, and in-house processing hours.
- Bought-out component fields (bearing, sleeve, housing, lagging, locking device) shall offer a selectable catalog of designations; selecting one shall auto-populate its price from the reference catalog.
- The system shall auto-calculate derived geometry and weight values (sheet length, shell plate weight, hub mass, shaft mass, lagging area, lagging cost, total bearing/housing cost) live as dimensions are entered, using the same formulas as the client's original engineering sheet.
- In-house processing hours (run time + setup time per operation) shall auto-calculate total hours and cost using the relevant labour rate.
- The captured Technical Data Sheet shall be viewable, read-only, by every role that reviews the RFQ afterward (Operations, Sourcing, Controlling, Approval Panel).

### 4.5 Operations Review
- Operations shall record three independent checks per RFQ: technical feasibility, delivery feasibility, and commercial acceptability, plus free-text notes.
- Operations shall view the full Technical Data Sheet for every item before deciding.
- Operations shall approve (advancing the RFQ to Sourcing), send it back to Sales with a mandatory comment, or reject it with a mandatory reason and comment.

### 4.6 Sourcing (Component & Process Level)
- Sourcing shall review, per pulley item, two distinct groups:
  - **Bought-out components** (bearings, adapter sleeve, housing, lagging, locking device) — shown with their catalog designation and price; these are always purchased and are not subject to an in-house/outsource decision.
  - **Manufacturing processes** (rolling/bending shell, welding, stress relief annealing, turning/machining body, lagging application, static balancing, painting/blasting) — each independently set to In-house, Outsource, or Logistics, with cost recalculating immediately on change.
- Sourcing shall optionally tag an outsourced process with a vendor name for internal reference.
- Sourcing shall explicitly confirm each item once its sourcing review is complete; the RFQ shall not be permitted to advance to Controlling until every item is confirmed.
- Sourcing shall be able to attach a general comment to the RFQ, and shall retain the ability to send the RFQ back or reject it, each with a mandatory comment.

### 4.7 Commercial Pricing (Controlling)
- The system shall compute each item's base cost automatically from its confirmed sourcing decisions: raw material + bought-out parts + in-house labour + outsourced processing + packing/logistics.
- Controlling shall apply, per item: freight, duties, other charges, discount, margin %, and tax %, with adjusted cost, selling price, and final price recalculating live.
- The system shall compare the achieved margin against the RFQ's target margin and visibly flag when it falls short.
- Controlling shall be required to explicitly confirm intent before submitting an RFQ for approval when margin is below target.
- Controlling shall be able to save a calculation in progress, send the RFQ back with a mandatory comment, or submit it for approval.

### 4.8 Approval Workflow
- The Approval Panel shall review, per RFQ: overall cost/selling price/margin/tax summary, per-item pricing, the confirmed sourcing breakdown per item, commercial terms, and full history.
- The Approval Panel shall approve (advancing the RFQ to Approved), send it back to Controlling, Sourcing, or Sales, or reject it — each of the latter two requiring a mandatory comment.
- An approval comment shall be optional on approval and mandatory on any negative decision.

### 4.9 Quotation Management
- Once an RFQ is approved, Sales shall generate a formal quotation from it in a single action, carrying forward customer, pricing, and terms data.
- The system shall present a printable/shareable quotation preview.
- Sales shall mark a quotation as Sent, and subsequently record the customer's decision as Won or Lost; a Lost outcome shall require a reason (e.g. price, delivery, competitor, technical).
- The system shall maintain a list of all quotations with status, value, and margin, filterable and searchable.

### 4.10 Costing Reference Engine
The system shall maintain the following as structured, centrally-owned reference data, and every cost calculation in the application shall read from it rather than from any hardcoded or duplicated value:
- **Cost Rate Tables** — exchange rate, GST rate, OEM discount, markup factor, labour rate (₹/hour) per work center, weld consumables, and grease cost.
- **Raw Forging Prices** — shaft and shell/hub raw material rates, including size-band reference data.
- **Bearing & Sleeve Data** — searchable catalogs of bearings, adapter sleeves, and bearing housings, each with designation, matching part, and price.
- **MHR & LHR Calculator** — the full machine-hour-rate and labour-hour-rate build-up (capacity, depreciation, power, maintenance, floor cost, wages) that produces each work center's labour rate.
- **Pricing Tool** — a live, per-item view of the complete cost buildup (raw materials, ancillary parts, in-house processing, outsourced processing, packing/shipment) and the resulting list price, net price, price including tax, and margin, for any RFQ.
- Reference data shall be maintainable (create, update) by the role that owns it, with every change attributable to a user and timestamp.

### 4.11 Dynamic Delivery Schedule
- The system shall compute an expected delivery/dispatch timeline automatically for each RFQ item, built from a defined sequence of production and procurement activities.
- The timeline shall be derived from that item's actual confirmed sourcing decisions (which processes are in-house vs. outsourced) rather than a generic default — a process outsourced for one order and done in-house for another shall produce different computed timelines.
- The timeline shall recalculate automatically whenever a sourcing decision for that item changes, without manual rework.
- Lead time for size-sensitive activities (raw material procurement, bearing/housing procurement, shaft machining) shall be configurable by pulley size band, so that larger and smaller pulleys can be given different, realistic lead times rather than one fixed figure for every size.
- The system shall show the computed expected dispatch date against the customer's required delivery date, and flag the order as at-risk when the computed date would miss it.
- For an RFQ containing multiple pulley items, the system shall support reporting a delivery timeline per item, so that a multi-item order's true critical path (the slowest item) is visible, alongside each item's individual readiness.
- The computed delivery timeline for an approved RFQ shall carry forward onto its generated quotation, so the date presented to the customer always reflects the calculated result for that specific, confirmed order.

### 4.12 Master Data
- **Customers**: maintain customer records (contact, city, tax ID, payment terms, status); required before an RFQ can be created against them.
- **Vendors**: maintain vendor records (category, contact, rating, payment terms, status), available for optional reference tagging during Sourcing.
- **Products**: maintain the catalog of pulley products and their default technical specifications, used to seed a new RFQ item's Technical Data Sheet.

### 4.13 Tasks & Notifications
- The system shall maintain a personal task list per user, populated automatically whenever an RFQ reaches a stage that role owns.
- The system shall generate a notification whenever an RFQ changes stage, is sent back, rejected, or requires attention, targeted at the responsible role.

### 4.14 Reports & Analytics
- The system shall provide standard reports (pipeline by stage, win/loss analysis, margin analysis, sourcing cost split) with both tabular and chart views.
- The system shall provide an analytics dashboard with key business metrics: total RFQ volume, win rate, pipeline value, average cycle time per stage, and in-house vs. outsourced cost trends.

### 4.15 Audit Log
- The system shall record every stage transition, approval, rejection, and send-back as an immutable audit event, capturing user, role, timestamp, previous/new stage, and comment.
- The full audit trail for an RFQ shall be viewable from its detail page; Admin shall additionally have a system-wide audit log view.

### 4.16 Administration
- Admin shall manage user accounts and role assignments.
- Admin shall manage system settings, including the ability to reset to a clean baseline state for testing/demo purposes.

---

## 5. RFQ Lifecycle

Every RFQ progresses through the following stages in order:

| # | Stage | Owner | Exit condition |
|---|---|---|---|
| 1 | Draft | Sales | Every item has a complete Technical Data Sheet |
| 2 | Operations Review | Operations | Feasibility, delivery, and commercial checks all completed |
| 3 | Sourcing | Sourcing | Every item's component/process sourcing confirmed |
| 4 | Controlling | Controlling | Commercial pricing calculated and submitted |
| 5 | Approval Pending | Approval Panel | Final approval granted |
| 6 | Approved | Sales | Quotation generated |
| 7 | Quotation Generated → Sent | Sales | Quotation marked sent to customer |
| 8 | Won / Lost | Sales | Customer decision recorded |

At Operations Review, Sourcing, Controlling, and Approval Pending, the responsible role may instead **Send Back** the RFQ to an earlier stage or **Reject** it outright; both actions require a mandatory comment and are recorded in the audit trail, and route a notification and task back to Sales.

---

## 6. Non-Functional Requirements

- **Role-based access control** on every module, screen, and action.
- **Full audit trail** of every state-changing action, with user, role, and timestamp.
- **Durable, multi-user data storage** for all RFQ, quotation, master, and reference data.
- **Traceability of every calculated figure** back to the specific reference rate, catalog entry, and formula that produced it.
- **Live recalculation**: any change to a sourcing decision, cost input, or reference rate shall immediately reflect in every dependent figure (pricing, margin, delivery timeline) without a manual refresh step.
- **Consistent role-scoped navigation**, so each role sees only the modules relevant to their responsibilities.
- **Notification and task delivery** to the correct role within the same workflow action that triggers it.

---

## 7. Core Data Entities

| Entity | Key attributes |
|---|---|
| Customer | Name, contact, city, tax ID, payment terms, status |
| Vendor | Name, category, contact, rating, payment terms, status |
| Product | Code, name, category, default technical data, sourcing type |
| RFQ | Customer, project details, commercial terms, items, stage, value, target margin |
| RFQ Item | Product, quantity, required delivery date, full Technical Data Sheet, sourcing confirmation status |
| Cost Breakdown Line | Per-item base cost, freight, duties, discount, margin, tax, final price |
| Quotation | Linked RFQ, customer, value, margin, status, validity |
| Audit Event | RFQ, user, role, action, previous/new stage, comment, timestamp |
| Notification | Message, target role, related RFQ/quotation, read status |
| Task | Title, related RFQ, owning role, due date, action required |

---

## 8. Assumptions

- All reference formulas and baseline rates are sourced from the client's own pricing workbook.
- Currency is Indian Rupees (INR) by default, with Euro (EUR) shown as a reference conversion.
- The 6-role workflow described in Section 3 reflects the client's actual internal approval process.
