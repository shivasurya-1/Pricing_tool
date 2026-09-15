# RFQ → QUOTATION MANAGEMENT SYSTEM
## Enterprise Frontend Prototype — Detailed UI/UX & Functional Requirements

---

# 1. PURPOSE

Build a **frontend-only enterprise prototype** for an RFQ (Request for Quotation) to Quotation management system.

This is a UI/UX prototype only.

### DO NOT BUILD YET
- No backend
- No API integration
- No real database
- No authentication service
- No real email integration
- No real Excel import
- No real ERP integration
- No real file storage
- No production deployment infrastructure

### DO BUILD
- Complete enterprise-grade frontend
- Realistic navigation
- Role-based screens
- Functional frontend interactions
- Mock data
- Mock workflow state
- Mock approvals/rejections
- Mock pricing calculations
- Mock notifications
- Mock reports
- Mock audit trail
- Responsive desktop-first UI
- Professional ERP/B2B appearance

The prototype should feel like a **real enterprise application**, not a collection of wireframes.

---

# 2. REFERENCE BUSINESS PROCESS

The application follows this workflow:

**Sales**
→ Create RFQ
→ **Operations**
→ Review / Feasibility
→ **Sourcing**
→ Vendor Pricing / Best Source
→ **Controlling**
→ Commercials / Final Price
→ **Approval Panel**
→ Final Approval
→ **Sales**
→ Generate & Share Quotation
→ Customer Response

The workflow must visually communicate where an RFQ currently sits.

Possible return paths:

- Operations → Sales
- Sourcing → Operations / Sales
- Controlling → Sourcing / Sales
- Approval Panel → Controlling / Sourcing / Sales

All return/reject actions must require a comment in the prototype.

---

# 3. USER ROLES

Create a frontend role switcher/demo login so the evaluator can experience each role.

## 3.1 Sales Team

Primary responsibilities:

- Receive customer RFQ
- Create RFQ
- Add customer/project information
- Add products
- Add quantities
- Add specifications
- Add delivery requirements
- Add commercial requirements
- Submit RFQ
- Track progress
- View returned RFQs
- Review final quotation
- Generate quotation
- Send quotation
- Track customer response

Sales dashboard should prioritize:
- My RFQs
- RFQs requiring action
- RFQs in progress
- Approved quotations
- Quotations sent
- Won/Lost

---

## 3.2 Operations Team

Responsibilities:

- Review incoming RFQs
- Validate technical requirements
- Check feasibility
- Check delivery/stock assumptions
- Review quantity/specifications
- Add operational notes
- Approve
- Reject
- Send back to Sales

Dashboard priorities:
- Pending reviews
- Overdue reviews
- Approved today
- Returned RFQs
- Average review TAT

---

## 3.3 Sourcing Team

Responsibilities:

- Review approved RFQs
- Identify vendors
- Compare vendor pricing
- Compare availability
- Compare lead time
- Select best source
- Enter sourcing information
- Update best price
- Add sourcing comments

Dashboard priorities:
- RFQs awaiting sourcing
- Sourcing in progress
- Vendor quotes pending
- Best price completed
- Overdue sourcing tasks

---

## 3.4 Controlling Team

Responsibilities:

- Review sourced cost
- Apply freight
- Apply taxes
- Apply duties
- Apply discounts
- Apply other charges
- Apply margin
- Calculate final selling price
- Set payment terms
- Set validity
- Submit for approval

Dashboard priorities:
- Pending commercial calculations
- Margin alerts
- High-value quotations
- Awaiting approval
- Completed today

---

## 3.5 Approval Panel

Responsibilities:

- Review complete quotation
- Review cost
- Review selling price
- Review margin
- Review taxes
- Review terms
- Approve
- Reject
- Send back

Dashboard priorities:
- Pending approvals
- High-value approvals
- Low-margin approvals
- Recently approved
- Recently rejected

---

## 3.6 Admin

Frontend prototype only.

Responsibilities:
- User management screen
- Role management screen
- Customer master
- Vendor master
- Product/material master
- Price/rate master
- Workflow configuration placeholder
- System settings placeholder

Admin should see all navigation areas.

---

# 4. APPLICATION SHELL

Create a common enterprise shell.

## Left Sidebar

Sections:

### Main
- Dashboard
- RFQs
- Quotations

### Workbench
- My Tasks
- Approvals
- Notifications

### Commercial
- Sourcing
- Pricing / Costing

### Master Data
- Customers
- Vendors
- Products / Materials
- Price / Rate Master

### Analytics
- Reports
- Analytics

### Administration
- Users & Roles
- Settings
- Audit Log

Sidebar should:
- Collapse/expand
- Highlight active page
- Show notification/task badges
- Show icons
- Support role-based visibility

---

# 5. TOP HEADER

Top bar should contain:

- Company logo/name
- Global search
- Current business unit / company selector
- Notification bell
- Help icon
- User avatar
- User name
- Role
- Profile menu
- Logout

Global search should be frontend-functional against mock data.

Example search:
- RFQ number
- Customer
- Product
- Quotation number

---

# 6. DESIGN SYSTEM

Use a professional enterprise design.

Suggested visual direction:

- White/light gray application background
- Dark navy primary text
- Blue primary action
- Green success
- Amber warning
- Red error/rejection
- Purple for sourcing/pricing where appropriate
- Teal for operations
- Orange for controlling

Do not make the application overly colorful.

Use:
- Cards
- Data tables
- Tabs
- Drawers
- Modals
- Side panels
- Step indicators
- Status badges
- Timeline components
- Toast notifications
- Empty states
- Loading skeletons
- Confirmation dialogs

Use consistent spacing, typography and button hierarchy.

---

# 7. LOGIN SCREEN

Create a polished enterprise login screen.

Left side:
- Company/product branding
- Short system description
- RFQ → Quotation process visual

Right side:
- Email/username
- Password
- Remember me
- Sign in button

For prototype:
Add a **Demo Role Login** area:

- Login as Sales
- Login as Operations
- Login as Sourcing
- Login as Controlling
- Login as Approval Panel
- Login as Admin

Clicking a demo role should enter the application with that role's navigation/dashboard.

---

# 8. DASHBOARD

Each role should have a customized dashboard.

## Common KPI Cards

- Total RFQs
- Open RFQs
- Pending Actions
- Completed RFQs
- Quotations
- Win Rate
- Average TAT
- Pipeline Value

Cards should show:
- Number
- Label
- Change vs previous period
- Small trend indicator

---

# 9. SALES DASHBOARD

Show:

### KPI row
- New RFQs
- In Progress
- Awaiting Approval
- Approved
- Quotations Sent
- Won
- Lost

### RFQ Pipeline

Visual stage funnel:

Received
→ Operations
→ Sourcing
→ Controlling
→ Approval
→ Quotation

### My Action Items

Table:

| RFQ | Customer | Stage | Age | Priority | Action |
|---|---|---|---|---|---|

### Recent RFQs

### Customer Response

Small chart:
- Won
- Lost
- Pending
- Negotiation

### Quick Actions

- + Create RFQ
- View RFQs
- View Quotations

---

# 10. OPERATIONS DASHBOARD

Show:

- Pending Review
- Due Today
- Overdue
- Approved
- Returned
- Rejected

Main table:

RFQ
Customer
Required Date
Items
Priority
Submitted
Age
Status
Action

Include a "Review Now" action.

Charts:
- Review TAT
- RFQ volume
- Approval/rejection ratio

---

# 11. SOURCING DASHBOARD

Show:

- Awaiting Sourcing
- In Progress
- Vendor Quotes Pending
- Best Price Completed
- Overdue

Vendor sourcing activity table.

Chart:
- Vendor comparison
- Savings achieved
- Average sourcing time

---

# 12. CONTROLLING DASHBOARD

Show:

- Pending Costing
- High Value
- Low Margin
- Ready for Approval
- Completed

Charts:
- Average margin
- Total quotation value
- Margin distribution

Include warning card:
"3 quotations below target margin"

---

# 13. APPROVAL DASHBOARD

Show:

- Pending Approval
- High Value
- Low Margin
- Approved
- Rejected
- Returned

Main approval queue.

Each row:
- RFQ
- Customer
- Quote Value
- Margin %
- Sales Owner
- Submitted Date
- Priority
- Action

---

# 14. RFQ LIST SCREEN

Create a sophisticated enterprise data table.

Columns:

- RFQ Number
- Customer
- Project
- Sales Person
- RFQ Date
- Required Delivery
- Number of Items
- Value
- Current Stage
- Status
- Priority
- Last Updated
- Action

Filters:
- Status
- Stage
- Customer
- Sales Person
- Date range
- Priority
- Value range

Actions:
- View
- Edit
- Duplicate
- Submit
- Withdraw
- More

Table features:
- Pagination
- Sort
- Column visibility
- Search
- Filter chips
- Export button (mock)
- Saved views (frontend only)

---

# 15. CREATE RFQ SCREEN

Use a multi-section enterprise form.

## Header

- Create RFQ
- Save Draft
- Cancel
- Submit RFQ

## Section 1 — Customer Information

Fields:
- Customer
- Customer code
- Contact person
- Email
- Phone
- Customer reference
- RFQ received date

Customer can be selected from mock master data.

---

## Section 2 — Project Information

Fields:
- Project name
- Project code
- Quote reference
- End customer
- Location
- Industry
- Required delivery date
- Priority

---

## Section 3 — Commercial Requirements

Fields:
- Currency
- Payment terms
- Delivery terms
- Quotation validity
- Incoterms
- Tax applicability
- Freight requirement
- Customer remarks

---

## Section 4 — RFQ ITEMS

Enterprise line-item table.

Columns:
- Item #
- Product Code
- Product Name
- Description
- Quantity
- Unit
- Specification
- Required Delivery
- Target Price
- Remarks

Buttons:
- Add Item
- Delete
- Duplicate
- Import Items (mock)
- Add from Product Master

When product is selected, populate mock:
- Description
- Unit
- Technical information

---

## Section 5 — Attachments

Frontend placeholder.

Allow UI interaction for:
- Add attachment
- Show file name
- Remove attachment

No actual backend storage required.

---

## Section 6 — Notes

Internal notes and customer notes.

---

# 16. RFQ DETAIL SCREEN

This is one of the most important screens.

Top header:

**RFQ-2026-00124**

Customer
Project
Value
Priority
Current Stage
Status

Actions:
- Edit
- Send Back
- Approve
- Reject
- More

---

# 17. WORKFLOW TIMELINE

Create a large visual process tracker.

Example:

### 1 Sales
Completed
Created RFQ

↓

### 2 Operations
Completed
Approved

↓

### 3 Sourcing
Current
Pricing & Vendor Selection

↓

### 4 Controlling
Pending

↓

### 5 Approval
Pending

↓

### 6 Sales
Pending

Each stage should show:
- Status
- Team
- User
- Date/time
- Duration

Clicking a stage should show its details.

---

# 18. RFQ DETAIL TABS

Tabs:

### Overview
Complete RFQ information.

### Items
Detailed item table.

### Technical
Technical specifications.

### Sourcing
Vendor and source information.

### Pricing
Cost and selling price.

### Commercials
Taxes, freight, discount, margin.

### Approval
Approval history.

### Activity
Complete audit timeline.

### Attachments
Uploaded files.

---

# 19. OPERATIONS REVIEW SCREEN

Show RFQ details on the left/main area.

Review panel on right.

### Checks

Technical feasibility:
- Feasible
- Feasible with Conditions
- Not Feasible

Delivery:
- Available
- Partial
- Need sourcing
- Not available

Commercial review:
- Acceptable
- Requires clarification

### Notes

Large internal notes field.

### Actions

Primary:
- Approve & Continue

Secondary:
- Send Back

Danger:
- Reject

Send Back/Reject opens mandatory comment modal.

---

# 20. SOURCING SCREEN

Show RFQ items.

For each item:

Product
Quantity
Required Date

Then vendor comparison.

## Vendor Comparison Table

Columns:

- Vendor
- Unit Price
- Currency
- Availability
- Lead Time
- MOQ
- Payment Terms
- Validity
- Total Cost
- Select

Allow 3–5 mock vendors per item.

Highlight:
- Lowest price
- Fastest delivery
- Recommended vendor

Selection should update the frontend state.

---

# 21. SOURCING SUMMARY

Show:

- Total sourced cost
- Selected vendor
- Potential savings
- Average lead time
- Vendor coverage

Button:

**Submit to Controlling**

---

# 22. CONTROLLING / COSTING SCREEN

Create an enterprise costing interface.

## Cost Breakdown

For each item:

- Vendor/Base Cost
- Freight
- Duties
- Other Charges
- Discount
- Adjusted Cost
- Margin %
- Margin Value
- Selling Price
- Tax
- Final Price

Use mock formulas.

Example:

Adjusted Cost =
Base Cost + Freight + Duties + Other Charges - Discount

Selling Price =
Adjusted Cost + Margin

Tax =
Selling Price × Tax %

Grand Total =
Selling Price + Tax

The exact Excel formulas will be integrated later.

---

# 23. PRICING SUMMARY

Show:

- Total Cost
- Total Selling Price
- Gross Margin
- Margin %
- Tax
- Freight
- Discount
- Grand Total

Include visual indicators:

Green:
Healthy margin

Amber:
Warning margin

Red:
Below target margin

Example target:
- Target margin: 15%
- Current margin: 12.8%
- Warning

---

# 24. CONTROLLING ACTIONS

Buttons:

- Save Calculation
- Recalculate
- Submit for Approval
- Send Back

If margin is below threshold, show confirmation/warning.

---

# 25. APPROVAL SCREEN

Create a high-quality approval experience.

Header:
- RFQ number
- Customer
- Quotation value
- Margin
- Priority

Summary cards:
- Cost
- Selling Price
- Margin
- Tax
- Grand Total

Tabs:
- RFQ Details
- Items
- Sourcing
- Commercials
- Terms
- History

Approval panel:

### Decision
- Approve
- Send Back
- Reject

Comment box.

For reject/send back:
Comment is mandatory.

Show previous approvals.

---

# 26. APPROVAL HISTORY

Timeline:

Operations
Approved
User
Date/time
Comment

Sourcing
Completed
User
Date/time

Controlling
Submitted
User
Date/time

Approval Panel
Pending

---

# 27. QUOTATION SCREEN

After final approval, show:

Quotation Number
Quotation Date
Customer
Project
Valid Until

## Customer-facing preview

Professional quotation layout:

- Company header
- Customer details
- Project reference
- Item table
- Description
- Quantity
- Unit price
- Amount
- Subtotal
- Discount
- Freight
- Tax
- Grand Total
- Delivery terms
- Payment terms
- Validity
- Notes
- Terms & Conditions

Actions:
- Preview
- Generate PDF (frontend mock)
- Send Email (frontend mock)
- Download (mock)
- Mark as Sent

---

# 28. QUOTATION LIST

Columns:

- Quotation #
- RFQ #
- Customer
- Quote Date
- Amount
- Currency
- Margin
- Status
- Valid Until
- Sales Person
- Action

Statuses:

- Draft
- Pending Approval
- Approved
- Sent
- Viewed
- Negotiation
- Won
- Lost
- Expired

---

# 29. CUSTOMER RESPONSE

Quotation detail should include:

### Response status

- Not Sent
- Sent
- Viewed
- Negotiation
- Won
- Lost

Allow Sales to update mock status.

If Lost:
Require loss reason.

Reasons:
- Price
- Delivery
- Competitor
- Technical
- Customer Cancelled
- Other

---

# 30. MY TASKS

Role-specific task center.

Columns:

- Task
- RFQ
- Customer
- Stage
- Priority
- Due Date
- Age
- Assigned To
- Action

Filters:
- Due Today
- Overdue
- High Priority
- Assigned to Me
- All

Clicking a task opens the relevant screen.

---

# 31. NOTIFICATIONS

Notification drawer.

Examples:

"RFQ-2026-00124 has been submitted for Operations review."

"RFQ-2026-00119 was returned with comments."

"Quotation Q-2026-0087 is awaiting final approval."

"Quotation Q-2026-0072 was approved."

Include:
- Read/unread
- Timestamp
- Navigate to record
- Mark all read

---

# 32. CUSTOMER MASTER

Enterprise CRUD table.

Columns:
- Customer Code
- Customer Name
- Contact
- Email
- Phone
- City
- GST/Tax ID
- Payment Terms
- Status
- Last Updated

Actions:
- View
- Edit
- Deactivate

Create/edit drawer.

---

# 33. VENDOR MASTER

Columns:
- Vendor Code
- Vendor Name
- Category
- Contact
- Email
- Rating
- Payment Terms
- Status

Create/edit drawer.

---

# 34. PRODUCT / MATERIAL MASTER

Columns:
- Product Code
- Product Name
- Category
- Unit
- Description
- Default Lead Time
- Base Price
- Status

Product detail should have tabs:

- Basic Information
- Technical Data
- Pricing
- Vendors
- History

Technical Data can contain mocked fields inspired by the supplied Excel example.

Example mock fields:
- Shell Outer Diameter
- Shell Face Width
- Shell Thickness
- Sheet Width
- Sheet Length
- Pulley Diameter
- Housing Distance
- Total Mass
- Hub Type
- Hub Width
- Hub Diameter
- Shaft Length
- Shaft Diameter
- Shaft Material
- Bearing Designation

These are only prototype fields.

---

# 35. PRICE / RATE MASTER

Create a frontend mock screen for future Excel integration.

Sections:

### Base Rates
- Product
- Base Rate
- Currency
- Effective Date
- Expiry

### Freight Rates
- Region
- Rate
- Unit

### Tax Rates
- Tax Type
- Rate

### Duty Rates
- Category
- Rate

### Margin Rules
- Product Category
- Minimum Margin
- Target Margin

Include an information banner:

"Prototype data only — actual Cost Rate Tables and Excel formulas will be integrated in a future phase."

---

# 36. REPORTS

Create a dedicated Reports screen.

Cards:

### RFQ Report
- RFQ by status
- RFQ by Sales Person
- RFQ ageing

### Quotation Report
- Quotations by status
- Quotations by period
- Won/Lost

### Pricing Report
- Price comparison
- Best price trends
- Margin analysis

### Team Performance
- RFQs handled
- Approval TAT
- Conversion rate

### Audit Report
- All activities
- Approvals
- Changes
- User activity

Reports should have:
- Date filters
- Team filter
- Customer filter
- Export button (mock)
- Chart/table toggle

---

# 37. ANALYTICS DASHBOARD

Enterprise analytics page.

KPIs:

- RFQ Pipeline Value
- Quotation Value
- Won Value
- Lost Value
- Conversion %
- Average Margin %
- Average RFQ TAT
- Average Approval TAT

Charts:

1. RFQs by stage
2. RFQs by month
3. Quotation value trend
4. Won vs Lost
5. Margin trend
6. Team performance
7. Customer contribution

Use mock data.

---

# 38. AUDIT LOG

Full-page table.

Columns:

- Date/Time
- User
- Role
- Module
- Record
- Action
- Previous Status
- New Status
- Comment

Filters:
- User
- Role
- Module
- Action
- Date range

Click row to open details drawer.

---

# 39. USER & ROLE MANAGEMENT

Admin screen.

User table:

- Name
- Email
- Role
- Department
- Status
- Last Login
- Actions

Role screen:
- Sales
- Operations
- Sourcing
- Controlling
- Approval Panel
- Admin

Permission matrix can be visual only.

Example:

| Module | Sales | Operations | Sourcing | Controlling | Approval | Admin |
|---|---|---|---|---|---|---|
| Create RFQ | Yes | No | No | No | No | Yes |
| Operations Review | No | Yes | No | No | No | Yes |
| Sourcing | No | No | Yes | No | No | Yes |
| Costing | No | No | No | Yes | View | Yes |
| Approval | No | No | No | No | Yes | Yes |
| Masters | View | View | View | View | View | Full |

---

# 40. SETTINGS

Frontend placeholder pages:

- Company Profile
- Currency
- Tax Settings
- Workflow Settings
- Notification Preferences
- Quotation Template
- Terms & Conditions

These do not need backend persistence.

---

# 41. WORKFLOW BEHAVIOR

The frontend must simulate the workflow.

Example:

Sales creates:
`RFQ-2026-00124`

Status:
`Draft`

Sales clicks Submit.

Status becomes:
`Operations Review`

Operations clicks Approve.

Status becomes:
`Sourcing`

Sourcing selects vendor.

Status becomes:
`Controlling`

Controlling finalizes pricing.

Status becomes:
`Approval Pending`

Approval Panel approves.

Status becomes:
`Approved`

Sales opens RFQ.

Button:
`Generate Quotation`

Quotation created.

Status:
`Quotation Generated`

Sales clicks Send.

Status:
`Quotation Sent`

Sales marks:
`Won`

Status:
`Won`

All of this is frontend mock state.

---

# 42. SEND-BACK BEHAVIOR

Example:

Approval Panel clicks Send Back.

Modal:

"Send RFQ back to which stage?"

Options:
- Controlling
- Sourcing
- Sales

Comment:
Required.

After confirmation:
- Status changes
- Timeline updates
- Notification appears
- Task appears for responsible role

---

# 43. REJECTION BEHAVIOR

Reject modal:

Title:
"Reject RFQ"

Show:
- RFQ
- Customer
- Quote value

Required:
- Rejection reason
- Comment

Confirm.

Show success notification.

Record the event in frontend audit history.

---

# 44. MOCK DATA

Create realistic data.

Customers:
- Apex Mining Industries
- Global Conveyor Systems
- Eastern Engineering
- Nova Cement Works
- Metro Industrial Projects

Vendors:
- SKF
- Timken
- ABC Industrial Supplies
- Global Mechanical
- Prime Components

Products should be industrial products relevant to the supplied Excel example.

Example:
- HT Drive Pulley
- HT Non Drive Pulley
- Double Drive Pulley SPL-03
- Single Drive Pulley SPL-04
- Single Drive Pulley SPL-06
- Single Drive Pulley SPL-07

Create at least 10 products.

Create 10–20 RFQs distributed across different stages.

---

# 45. PRODUCT TECHNICAL DATA

Use mock technical data inspired by the provided Excel screenshot.

Example product record:

Product:
HT Drive Pulley

Technical fields:
- Shell Outer Diameter: 800 mm
- Shell Face Width: 1400 mm
- Shell Thickness: 26 mm
- Sheet Width: 1400 mm
- Sheet Length: 2557 mm
- Overall Pulley Diameter: 483 mm
- Housing Distance: 1011 mm
- Total Pulley Mass: 150 kg
- Hub Type: Welded-in hub
- Hub Width: 119 mm
- Hub Outer Diameter: 818 mm
- Hub Inner Diameter: 290 mm
- Shaft Length: 2521 mm
- Shaft Centre Diameter: 228 mm
- Shaft Material: 42CrMo4+QT forged
- Bearing Designation: 22234 CCK/W33

This data is mock prototype data only.

---

# 46. MOCK PRICING

Do not hard-code values into individual UI components.

Create a centralized frontend mock pricing service/store.

Example:

Product:
HT Drive Pulley

Vendor price:
₹731,000

Freight:
₹18,000

Duties:
₹12,000

Other charges:
₹5,000

Discount:
₹10,000

Adjusted cost:
₹756,000

Margin:
15%

Selling price:
Calculated

Tax:
18%

Grand total:
Calculated

Use different values for different products.

---

# 47. FRONTEND STATE

Use frontend state management appropriate to the chosen stack.

At minimum maintain:
- Current user
- Current role
- RFQs
- RFQ stages
- Customers
- Vendors
- Products
- Vendor quotes
- Pricing
- Quotations
- Notifications
- Audit logs

Persistence can use:
- In-memory state
or
- localStorage

No backend.

Refreshing the browser should preferably preserve demo state using localStorage.

Provide a "Reset Demo Data" option in Admin/settings.

---

# 48. COMPONENT ARCHITECTURE

Create reusable components.

Examples:

- AppShell
- Sidebar
- Header
- DashboardCard
- StatusBadge
- PriorityBadge
- DataTable
- FilterBar
- SearchBox
- Modal
- Drawer
- ConfirmDialog
- WorkflowTimeline
- ApprovalPanel
- ActivityTimeline
- RFQHeader
- RFQItemTable
- VendorComparison
- PricingBreakdown
- QuotationPreview
- NotificationPanel
- EmptyState
- LoadingState
- ErrorState
- Breadcrumbs

Do not duplicate UI logic unnecessarily.

---

# 49. ROUTES

Suggested routes:

`/login`

`/dashboard`

`/rfqs`

`/rfqs/new`

`/rfqs/:id`

`/rfqs/:id/operations`

`/rfqs/:id/sourcing`

`/rfqs/:id/costing`

`/rfqs/:id/approval`

`/quotations`

`/quotations/:id`

`/tasks`

`/notifications`

`/customers`

`/vendors`

`/products`

`/rates`

`/reports`

`/analytics`

`/audit-log`

`/users`

`/settings`

---

# 50. RESPONSIVE DESIGN

Primary target:
- Desktop
- Laptop

Also support:
- Tablet

Mobile can be simplified but should not break.

Minimum recommended desktop width:
1280px.

Tables should:
- Scroll horizontally when needed
- Keep important columns visible

---

# 51. EMPTY STATES

Every major page must have a proper empty state.

Example:

"No RFQs found"

"Try changing your filters or create a new RFQ."

Buttons:
- Clear Filters
- Create RFQ

---

# 52. LOADING STATES

Use skeleton loaders for:
- Dashboard cards
- Tables
- RFQ details
- Charts

Even though data is mocked, the prototype should demonstrate enterprise loading behavior.

---

# 53. ERROR STATES

Show realistic frontend error handling.

Examples:
- Invalid form
- Required comment missing
- Pricing calculation error
- Unable to load mock data

Use inline errors and toast notifications.

---

# 54. TOASTS

Examples:

Success:
"RFQ submitted successfully."

Success:
"Operations review approved."

Success:
"Vendor selected."

Success:
"Quotation generated."

Warning:
"Margin is below target."

Error:
"Please enter a rejection reason."

---

# 55. MODALS / DRAWERS

Use drawers for:
- Customer details
- Vendor details
- Product details
- Audit event details

Use modals for:
- Delete
- Reject
- Send Back
- Approve confirmation
- Generate quotation
- Mark quotation Won/Lost

---

# 56. QUOTATION PDF PREVIEW

No actual backend PDF generation required.

Build a high-quality printable quotation preview.

It should visually resemble a real corporate quotation.

Include:
- Company branding placeholder
- Quotation number
- Date
- Customer
- Project
- Items
- Pricing
- Taxes
- Total
- Terms
- Signature/approval placeholder

Add:
`Print / Export PDF` button.

If actual browser print/PDF is easy to support, implement it on the frontend.

---

# 57. ROLE SWITCHER

For demo purposes, add a role switcher under the profile menu.

Example:

Current:
`Sales User`

Switch role:
- Sales
- Operations
- Sourcing
- Controlling
- Approval Panel
- Admin

Switching role should immediately change:
- Dashboard
- Navigation
- Task list
- Available actions

This is critical for demonstrating the workflow without backend authentication.

---

# 58. DEMO SCENARIO

The prototype must be preloaded with a demo RFQ:

### RFQ
RFQ-2026-00124

### Customer
Apex Mining Industries

### Project
Conveyor Expansion Project

### Items
- HT Drive Pulley
- HT Non Drive Pulley
- Single Drive Pulley SPL-04

### Current Stage
Operations Review

The evaluator should be able to move this RFQ through the entire process.

Create additional RFQs at different stages so dashboards do not look empty.

---

# 59. ENTERPRISE UX DETAILS

The application should include:

- Breadcrumbs
- Page titles
- Page descriptions
- Consistent primary/secondary actions
- Sticky action bars on long forms
- Confirmation dialogs for important actions
- Status colors
- Priority indicators
- Relative timestamps
- User avatars
- Role labels
- Tooltips
- Keyboard-friendly forms
- Form validation
- Clear hierarchy

Avoid:
- Excessive animations
- Huge empty spaces
- Consumer/mobile-app styling
- Excessive gradients
- Cartoonish icons
- Overly bright colors

The goal is:
**Enterprise ERP / industrial quotation management system.**

---

# 60. IMPORTANT EXCEL FUTURE INTEGRATION

The supplied Excel screenshot shows a product technical data structure and pricing/cost calculations.

The prototype should represent these areas visually, but must NOT pretend the actual formulas are known.

Create clear separation:

### Current prototype
Mock Technical Data
Mock Cost Rates
Mock Pricing Formula

### Future Phase
Real:
- Tech Data Table
- Cost Rate Tables
- Excel formulas
- Rate master
- Product calculations
- Actual pricing logic

The frontend should make it easy to replace mock data later.

---

# 61. WHAT THE AI BUILDER SHOULD DELIVER

The generated project must contain:

1. Complete frontend application
2. All major screens listed above
3. Role-based demo experience
4. Mock data
5. Frontend workflow engine/state
6. Working forms
7. Working tables
8. Working filters
9. Working search
10. Working approvals
11. Working rejection/send-back flow
12. Working mock pricing calculation
13. Working quotation preview
14. Working notifications
15. Working audit trail
16. Responsive layout
17. Reusable components
18. Clean project structure

---

# 62. BUILD ORDER

Build in this order:

### Phase A
Application shell
- Login
- Sidebar
- Header
- Role switcher
- Routing

### Phase B
Core RFQ
- Dashboard
- RFQ list
- Create RFQ
- RFQ details
- Workflow timeline

### Phase C
Team workflows
- Operations
- Sourcing
- Controlling
- Approval

### Phase D
Quotation
- Quotation list
- Quotation detail
- Quotation preview
- Customer response

### Phase E
Enterprise modules
- Tasks
- Notifications
- Masters
- Reports
- Analytics
- Audit log
- Users
- Settings

### Phase F
Polish
- Validation
- Empty states
- Loading states
- Error states
- Responsive behavior
- Accessibility
- UX refinement

---

# 63. FINAL INSTRUCTION TO THE AI BUILDER

Build this as a **high-fidelity, enterprise-grade frontend prototype**, not a simple demo page.

The evaluator should be able to:

1. Login as any role.
2. See a role-specific dashboard.
3. Create an RFQ as Sales.
4. Submit it.
5. Switch to Operations.
6. Review and approve/send back/reject.
7. Switch to Sourcing.
8. Compare vendors and select the best source.
9. Switch to Controlling.
10. Calculate commercial pricing.
11. Switch to Approval Panel.
12. Approve/reject/send back.
13. Switch back to Sales.
14. Generate a professional quotation.
15. Send/mark quotation as sent.
16. Mark it Won/Lost.
17. See the complete workflow history.
18. See notifications.
19. See audit history.
20. Explore reports and analytics.

The application must look credible enough to present to business stakeholders as a **Phase 1 enterprise product prototype**.

Again: **frontend only, no backend. Use mock/local data and mock calculations.**
