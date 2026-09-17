"""
Seeds a demo RFQ pipeline so a freshly-deployed instance isn't empty on first login.

This deliberately does NOT port src/data/mockSeed.ts's pulley technical-data /
pricing generation exactly (computeAutoFields / computePulleyPricing are a large,
actively-maintained calculation engine that already lives in the frontend and
recomputes on every edit). Instead, technical_data is seeded as a plausible but
simplified JSON dict — the same free-form shape every real RFQ item uses — and
cost-breakdown figures are approximated. What matters for demo/onboarding is the
stage distribution, audit trail, and notifications, which this ports faithfully
from the RFQ_CONFIGS list in mockSeed.ts.
"""

from datetime import datetime, timedelta, timezone

from django.core.management.base import BaseCommand
from django.db import transaction

from rfq.models import AppNotification, AuditEvent, Customer, CostBreakdownLine, Product, Quotation, RFQ, RFQItem, Vendor

NOW = datetime(2026, 8, 28, 10, 0, 0, tzinfo=timezone.utc)


def days_ago(n: float) -> str:
    return (NOW - timedelta(days=n)).isoformat().replace("+00:00", "Z")


CUSTOMERS = [
    ("Apex Mining Industries", "Suresh Pillai", "Bhubaneswar", "27AACCA1234F1Z5", "Net 45"),
    ("Global Conveyor Systems", "Meera Krishnan", "Chennai", "33AACCG5678K1Z2", "Net 30"),
    ("Eastern Engineering", "Alok Bannerjee", "Kolkata", "19AACCE9012M1Z8", "Net 30"),
    ("Nova Cement Works", "Farhan Sheikh", "Ahmedabad", "24AACCN3456P1Z3", "Net 60"),
    ("Metro Industrial Projects", "Neha Kapoor", "Pune", "27AACCM7890Q1Z9", "Net 45"),
]

VENDORS = [
    ("SKF", "Bearings", 4.7, "Net 30"),
    ("Timken", "Bearings", 4.5, "Net 45"),
    ("ABC Industrial Supplies", "Fabrication", 3.9, "Net 30"),
    ("Global Mechanical", "Machining & Shafts", 4.1, "Net 60"),
    ("Prime Components", "Pulleys & Idlers", 4.3, "Net 30"),
]

# (name, code, category, sizeFactor, basePrice, sourcingType)
PRODUCTS = [
    ("HT Drive Pulley", "PLY-DR-800", "Drive Pulley", 0.8, 620000, "Both"),
    ("HT Non Drive Pulley", "PLY-NDR-800", "Non-Drive Pulley", 0.8, 480000, "Both"),
    ("Double Drive Pulley SPL-03", "PLY-DD-SPL03", "Drive Pulley", 1.0, 780000, "Out-House"),
    ("Single Drive Pulley SPL-04", "PLY-SD-SPL04", "Drive Pulley", 0.63, 390000, "Both"),
    ("Single Drive Pulley SPL-06", "PLY-SD-SPL06", "Drive Pulley", 0.71, 430000, "Both"),
    ("Single Drive Pulley SPL-07", "PLY-SD-SPL07", "Drive Pulley", 0.75, 460000, "In-House"),
    ("HT Snub Pulley", "PLY-SNB-630", "Snub/Bend Pulley", 0.63, 210000, "In-House"),
    ("HT Bend Pulley", "PLY-BND-710", "Snub/Bend Pulley", 0.71, 240000, "In-House"),
    ("HT Take-up Pulley", "PLY-TKP-560", "Take-up Pulley", 0.56, 260000, "Both"),
    ("Wing Pulley WP-500", "PLY-WNG-500", "Wing Pulley", 0.5, 195000, "Out-House"),
    ("Rubber Lagged Drive Pulley RL-900", "PLY-RL-900", "Lagged Pulley", 0.9, 710000, "Out-House"),
    ("Ceramic Lagged Head Pulley CL-1000", "PLY-CL-1000", "Lagged Pulley", 1.0, 860000, "Out-House"),
]

STAGE_OWNER = {
    "Draft": "Sales", "Operations Review": "Operations", "Sourcing": "Sourcing", "Controlling": "Controlling",
    "Approval Pending": "Approval Panel", "Approved": "Sales", "Quotation Generated": "Sales", "Quotation Sent": "Sales",
}
STAGE_ORDER = [
    "Draft", "Operations Review", "Sourcing", "Controlling", "Approval Pending", "Approved",
    "Quotation Generated", "Quotation Sent",
]
STAGE_ACTIONS = {
    "Draft->Operations Review": ("Submitted RFQ for Operations review", "Sales"),
    "Operations Review->Sourcing": ("Approved — technically feasible, forwarded to Sourcing", "Operations"),
    "Sourcing->Controlling": ("Best vendor selected, submitted to Controlling", "Sourcing"),
    "Controlling->Approval Pending": ("Commercial pricing calculated, submitted for approval", "Controlling"),
    "Approval Pending->Approved": ("Final quotation approved", "Approval Panel"),
    "Approved->Quotation Generated": ("Quotation generated", "Sales"),
    "Quotation Generated->Quotation Sent": ("Quotation sent to customer", "Sales"),
}
NOTIF_MESSAGE = {
    "Operations Review": "{n} has been submitted for Operations review.",
    "Sourcing": "{n} is awaiting vendor sourcing.",
    "Controlling": "{n} is awaiting commercial pricing.",
    "Approval Pending": "Quotation for {n} is awaiting final approval.",
    "Approved": "{n} was approved — ready to generate quotation.",
    "Quotation Generated": "Quotation generated for {n} — ready to send.",
    "Quotation Sent": "Quotation for {n} was sent to the customer.",
}

# number, customerName, project, itemNames, priority, stage, progressLevel, salesPerson, createdDaysAgo, marginBias, lossReason, rejectedAtOperations, quotationStatusOverride
RFQ_CONFIGS = [
    ("RFQ-2026-00124", "Apex Mining Industries", "Conveyor Expansion Project",
     ["HT Drive Pulley", "HT Non Drive Pulley", "Single Drive Pulley SPL-04"], "Urgent", "Operations Review", 1, "Ananya Sharma", 3, 0, None, False, None),
    ("RFQ-2026-00101", "Global Conveyor Systems", "Belt Line Upgrade",
     ["Wing Pulley WP-500"], "Medium", "Draft", 0, "Karthik Iyer", 1, 0, None, False, None),
    ("RFQ-2026-00102", "Eastern Engineering", "Crusher Feed System",
     ["HT Snub Pulley", "HT Bend Pulley"], "Low", "Draft", 0, "Priya Nair", 2, 0, None, False, None),
    ("RFQ-2026-00103", "Nova Cement Works", "Kiln Feed Conveyor",
     ["Single Drive Pulley SPL-06", "Single Drive Pulley SPL-07"], "High", "Operations Review", 1, "Ananya Sharma", 5, 0, None, False, None),
    ("RFQ-2026-00104", "Metro Industrial Projects", "Stacker Reclaimer Retrofit",
     ["HT Take-up Pulley"], "Medium", "Sourcing", 2, "Karthik Iyer", 8, 0, None, False, None),
    ("RFQ-2026-00105", "Apex Mining Industries", "Overland Conveyor Phase 2",
     ["Double Drive Pulley SPL-03", "Rubber Lagged Drive Pulley RL-900"], "High", "Sourcing", 2, "Ananya Sharma", 9, 0, None, False, None),
    ("RFQ-2026-00106", "Global Conveyor Systems", "Ship Loader Upgrade",
     ["HT Drive Pulley", "HT Non Drive Pulley"], "High", "Controlling", 3, "Karthik Iyer", 11, 0, None, False, None),
    ("RFQ-2026-00107", "Eastern Engineering", "Ash Handling Conveyor",
     ["Ceramic Lagged Head Pulley CL-1000"], "Medium", "Controlling", 3, "Priya Nair", 12, -5, None, False, None),
    ("RFQ-2026-00108", "Nova Cement Works", "Raw Mill Conveyor Line",
     ["Single Drive Pulley SPL-04", "HT Snub Pulley"], "High", "Approval Pending", 4, "Ananya Sharma", 14, 0, None, False, None),
    ("RFQ-2026-00109", "Metro Industrial Projects", "Yard Conveyor Replacement",
     ["Wing Pulley WP-500", "HT Bend Pulley"], "Urgent", "Approval Pending", 4, "Karthik Iyer", 15, -6, None, False, None),
    ("RFQ-2026-00110", "Apex Mining Industries", "Crusher House Modernization",
     ["HT Drive Pulley"], "Medium", "Approved", 5, "Ananya Sharma", 18, 0, None, False, None),
    ("RFQ-2026-00111", "Global Conveyor Systems", "Transfer Point Upgrade",
     ["Single Drive Pulley SPL-06"], "Medium", "Quotation Generated", 6, "Karthik Iyer", 20, 0, None, False, "Draft"),
    ("RFQ-2026-00112", "Eastern Engineering", "Cooler Vent Conveyor",
     ["HT Take-up Pulley", "Double Drive Pulley SPL-03"], "High", "Quotation Sent", 7, "Priya Nair", 22, 0, None, False, "Viewed"),
    ("RFQ-2026-00113", "Nova Cement Works", "Clinker Handling Line",
     ["Rubber Lagged Drive Pulley RL-900"], "Medium", "Quotation Sent", 7, "Ananya Sharma", 24, -5, None, False, "Negotiation"),
    ("RFQ-2026-00114", "Metro Industrial Projects", "Port Conveyor Expansion",
     ["HT Drive Pulley", "HT Non Drive Pulley", "Wing Pulley WP-500"], "High", "Won", 7, "Karthik Iyer", 30, 0, None, False, None),
    ("RFQ-2026-00115", "Apex Mining Industries", "Screening Plant Conveyor",
     ["Single Drive Pulley SPL-07"], "Medium", "Lost", 7, "Ananya Sharma", 28, 0, "Price", False, None),
    ("RFQ-2026-00116", "Global Conveyor Systems", "Reclaim Tunnel Conveyor",
     ["HT Snub Pulley"], "Low", "Rejected", 0, "Karthik Iyer", 10, 0, None, True, None),
]

MARGIN_RULES = {
    "Drive Pulley": 15, "Non-Drive Pulley": 14, "Snub/Bend Pulley": 16, "Take-up Pulley": 16,
    "Wing Pulley": 14, "Lagged Pulley": 15,
}


class Command(BaseCommand):
    help = "Seeds demo customers, vendors, products, and a full RFQ pipeline for onboarding a fresh deployment."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing rfq-app data before seeding.")

    @transaction.atomic
    def handle(self, *args, **options):
        if options["reset"]:
            AppNotification.objects.all().delete()
            AuditEvent.objects.all().delete()
            Quotation.objects.all().delete()
            CostBreakdownLine.objects.all().delete()
            RFQItem.objects.all().delete()
            RFQ.objects.all().delete()
            Product.objects.all().delete()
            Vendor.objects.all().delete()
            Customer.objects.all().delete()

        if RFQ.objects.exists():
            self.stdout.write(self.style.WARNING("RFQs already exist — skipping seed (use --reset to reseed)."))
            return

        customers = {}
        for i, (name, contact, city, tax_id, terms) in enumerate(CUSTOMERS):
            c = Customer.objects.create(
                id=f"cust-{i + 1}", code=f"CUST-{i + 1:03d}", name=name, contact=contact,
                email=f"{contact.lower().replace(' ', '.')}@{name.lower().split()[0]}.com",
                phone=f"+91 98{10000000 + i * 7654321:08d}"[:16], city=city, tax_id=tax_id,
                payment_terms=terms, status="Active",
            )
            customers[name] = c

        vendors = []
        for i, (name, category, rating, terms) in enumerate(VENDORS):
            v = Vendor.objects.create(
                id=f"vend-{i + 1}", code=f"VND-{i + 1:03d}", name=name, category=category,
                contact=f"{name.split()[0]} Sales Desk", email=f"sales@{name.lower().replace(' ', '')}.com",
                rating=rating, payment_terms=terms, status="Active",
            )
            vendors.append(v)

        products = {}
        for i, (name, code, category, size_factor, base_price, sourcing_type) in enumerate(PRODUCTS):
            shell_od = round(size_factor * 1000)
            technical_data = {
                "Shell Outer Diameter": f"{shell_od} mm",
                "Shell Face Width": f"{round(1200 + size_factor * 400)} mm",
                "Overall Pulley Diameter": f"{round(shell_od * 0.6)} mm",
                "Hub Type": "Welded-in hub",
                "Shaft Material": "42CrMo4+QT forged",
                "Bearing Designation": "22234 CCK/W33",
            }
            p = Product.objects.create(
                id=f"prod-{i + 1}", code=code, name=name, category=category, unit="Nos",
                description=f"{category} for heavy-duty belt conveyor applications, shell diameter ~{shell_od} mm.",
                default_lead_time_days=30, base_price=base_price, status="Active",
                technical_data=technical_data, preferred_vendor_ids=["vend-5", "vend-1"], sourcing_type=sourcing_type,
            )
            products[name] = p

        rfq_count = 0
        quotation_seq = 1000
        for cfg in RFQ_CONFIGS:
            (number, customer_name, project, item_names, priority, stage, progress_level,
             sales_person, created_days_ago, margin_bias, loss_reason, rejected_at_ops, quote_status_override) = cfg

            customer = customers[customer_name]
            received_iso = days_ago(created_days_ago)
            updated_iso = days_ago(max(0, created_days_ago - progress_level))
            rfq_id = number.lower()

            rfq = RFQ.objects.create(
                id=rfq_id, rfq_number=number, customer=customer, customer_code=customer.code,
                contact_person=customer.contact, contact_email=customer.email, contact_phone=customer.phone,
                customer_reference=f"{customer.code}-REF-{number[-3:]}", rfq_received_date=received_iso,
                project_name=project, project_code=f"PRJ-{number[-5:]}", quote_reference=f"QR-{number[-5:]}",
                end_customer=customer.name, location=customer.city, industry="Mining & Materials Handling",
                required_delivery_date=days_ago(created_days_ago - 45), priority=priority, currency="INR",
                payment_terms=customer.payment_terms, delivery_terms="Ex-works + freight", quotation_validity="30 days",
                incoterms="FOR Destination", tax_applicability="GST Applicable",
                freight_requirement="To be arranged by supplier", stage=stage, status=stage, sales_person=sales_person,
                created_at=received_iso, updated_at=updated_iso,
                operations_review=(
                    {"technicalFeasibility": "Not Feasible", "delivery": "Not available", "commercialReview": "Requires clarification",
                     "notes": "Shell dimensions conflict with existing pulley shaft centre distance."}
                    if rejected_at_ops else
                    ({"technicalFeasibility": "Feasible", "delivery": "Available", "commercialReview": "Acceptable",
                      "notes": "Specifications verified against standard range."} if progress_level > 0 else None)
                ),
                sourcing_comments="All components and processes reviewed — in-house/outsource split confirmed per item." if progress_level > 1 else None,
                target_margin_percent=MARGIN_RULES.get(products[item_names[0]].category, 15),
            )

            items = []
            total_value = 0.0
            for i, name in enumerate(item_names):
                product = products[name]
                qty = 1 + (i % 3)
                target_price = round(product.base_price * 0.95)
                item = RFQItem.objects.create(
                    rfq=rfq, item_no=i + 1, product=product, product_code=product.code, product_name=product.name,
                    description=product.description, quantity=qty, unit=product.unit,
                    specification=f"{product.technical_data.get('Overall Pulley Diameter', '')} dia, {product.technical_data.get('Shaft Material', '')}",
                    required_delivery=days_ago(created_days_ago - 45), target_price=target_price,
                    technical_data=dict(product.technical_data, quoteReference=product.code, qty=qty),
                    sourcing_confirmed=progress_level > 1,
                )
                items.append(item)
                total_value += target_price * qty

            if progress_level > 2:
                for item in items:
                    margin_pct = max(4.0, rfq.target_margin_percent + margin_bias)
                    base_cost = round(item.target_price * 0.75)
                    freight = round(base_cost * 0.02)
                    duties = round(base_cost * 0.05)
                    other_charges = round(base_cost * 0.01)
                    discount = round(base_cost * 0.015)
                    adjusted_cost = base_cost + freight + duties + other_charges - discount
                    margin_value = round(adjusted_cost * margin_pct / 100)
                    selling_price = adjusted_cost + margin_value
                    tax_value = round(selling_price * 0.18)
                    final_price = selling_price + tax_value
                    CostBreakdownLine.objects.create(
                        item=item, base_cost=base_cost, freight=freight, duties=duties, other_charges=other_charges,
                        discount=discount, adjusted_cost=adjusted_cost, margin_percent=margin_pct, margin_value=margin_value,
                        selling_price=selling_price, tax_percent=18, tax_value=tax_value, final_price=final_price,
                    )
                total_value = sum(cb.final_price for cb in CostBreakdownLine.objects.filter(item__rfq=rfq))

            rfq.value = total_value
            rfq.save(update_fields=["value"])

            # --- audit trail ---
            span = max(1, created_days_ago)
            step = 0

            def push_audit(label, role, prev, new_status, comment=None):
                nonlocal step
                step += 1
                ts = days_ago(max(0, span - step * (span / 8)))
                AuditEvent.objects.create(
                    rfq=rfq, timestamp=ts, user=(sales_person if role == "Sales" else role), role=role, module="RFQ",
                    record=number, action=label, previous_status=prev, new_status=new_status, comment=comment,
                )

            push_audit("Created RFQ", "Sales", None, "Draft")

            if rejected_at_ops:
                push_audit("Rejected RFQ — not technically feasible", "Operations", "Draft", "Rejected",
                           "Shell/shaft dimensions conflict with existing installation. Please re-check with customer.")
                AppNotification.objects.create(
                    message=f"{number} was rejected by Operations.", timestamp=updated_iso, kind="error",
                    target_role="Sales", rfq=rfq,
                )
            else:
                current_idx = STAGE_ORDER.index(stage) if stage in STAGE_ORDER else -1
                stop_idx = current_idx if current_idx >= 0 else len(STAGE_ORDER)
                for i in range(min(stop_idx, len(STAGE_ORDER) - 1)):
                    key = f"{STAGE_ORDER[i]}->{STAGE_ORDER[i + 1]}"
                    if key in STAGE_ACTIONS:
                        label, role = STAGE_ACTIONS[key]
                        push_audit(label, role, STAGE_ORDER[i], STAGE_ORDER[i + 1])

                if stage == "Won":
                    push_audit("Marked as Won", "Sales", "Quotation Sent", "Won")
                    AppNotification.objects.create(
                        message=f"Quotation for {number} was marked Won.", timestamp=updated_iso, kind="success",
                        target_role="Sales", rfq=rfq,
                    )
                elif stage == "Lost":
                    push_audit("Marked as Lost", "Sales", "Quotation Sent", "Lost", f"Loss reason: {loss_reason or 'Other'}")
                    AppNotification.objects.create(
                        message=f"Quotation for {number} was marked Lost.", timestamp=updated_iso, kind="warning",
                        target_role="Sales", rfq=rfq,
                    )
                    rfq.loss_reason = loss_reason
                    rfq.save(update_fields=["loss_reason"])
                elif stage in NOTIF_MESSAGE:
                    AppNotification.objects.create(
                        message=NOTIF_MESSAGE[stage].format(n=number), timestamp=updated_iso, kind="info",
                        target_role=STAGE_OWNER.get(stage), rfq=rfq,
                    )

            # --- quotation, for stages that would have one ---
            if stage in ("Quotation Generated", "Quotation Sent", "Won", "Lost"):
                quotation_seq += 1
                if quote_status_override:
                    q_status = quote_status_override
                elif stage == "Won":
                    q_status = "Won"
                elif stage == "Lost":
                    q_status = "Lost"
                elif stage == "Quotation Generated":
                    q_status = "Draft"
                else:
                    q_status = "Sent"

                margin_percent = (
                    sum(cb.margin_percent for cb in CostBreakdownLine.objects.filter(item__rfq=rfq)) / len(items)
                    if progress_level > 2 else rfq.target_margin_percent
                )
                Quotation.objects.create(
                    id=f"quo-{rfq_id}", quotation_number=f"Q-2026-{quotation_seq:04d}", rfq=rfq,
                    customer_name=rfq.end_customer, project_name=rfq.project_name, quote_date=updated_iso,
                    valid_until=days_ago(created_days_ago - progress_level - 30), currency=rfq.currency,
                    amount=rfq.value, margin_percent=margin_percent, status=q_status, sales_person=sales_person,
                    loss_reason=loss_reason if stage == "Lost" else None,
                )

            rfq_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {len(customers)} customers, {len(vendors)} vendors, {len(products)} products, {rfq_count} RFQs."
        ))
