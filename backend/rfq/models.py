"""
Mirrors src/types/index.ts exactly — every model here is the backend counterpart of
one TS interface. IDs are string primary keys (not Django's default auto-int) so the
frontend's existing `id: string` typing and `/rfqs/:id`-style routes need no changes;
see generate_id() below, which mirrors src/lib/id.ts's uid() helper.
"""

import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

STATUS_ACTIVE_INACTIVE = [("Active", "Active"), ("Inactive", "Inactive")]
PRIORITY_CHOICES = [(p, p) for p in ["Low", "Medium", "High", "Urgent"]]
STAGE_CHOICES = [
    (s, s)
    for s in [
        "Draft",
        "Operations Review",
        "Sourcing",
        "Controlling",
        "Approval Pending",
        "Approved",
        "Quotation Generated",
        "Quotation Sent",
        "Won",
        "Lost",
        "Rejected",
    ]
]


def generate_id(prefix: str) -> str:
    """Mirrors src/lib/id.ts's uid(prefix) — short, readable, unique-enough for this scale."""
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


# Named (not lambda) so Django's migration writer can serialize them as defaults.
def generate_customer_id() -> str:
    return generate_id("cust")


def generate_vendor_id() -> str:
    return generate_id("vend")


def generate_product_id() -> str:
    return generate_id("prod")


def generate_item_id() -> str:
    return generate_id("item")


def generate_quotation_id() -> str:
    return generate_id("quo")


def generate_audit_id() -> str:
    return generate_id("audit")


def generate_notification_id() -> str:
    return generate_id("notif")


def generate_attachment_id() -> str:
    return generate_id("att")


ALLOWED_ATTACHMENT_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg"}
MAX_ATTACHMENT_SIZE_BYTES = 15 * 1024 * 1024
MAX_ATTACHMENTS_PER_RFQ = 20


def attachment_upload_path(instance, filename: str) -> str:
    return f"rfq_attachments/{instance.rfq_id}/{uuid.uuid4().hex[:10]}_{filename}"


class Customer(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=generate_customer_id)
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=200)
    contact = models.CharField(max_length=120, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    city = models.CharField(max_length=100, blank=True)
    tax_id = models.CharField(max_length=60, blank=True)
    payment_terms = models.CharField(max_length=60, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_ACTIVE_INACTIVE, default="Active")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name


class Vendor(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=generate_vendor_id)
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=100, blank=True)
    contact = models.CharField(max_length=120, blank=True)
    email = models.EmailField(blank=True)
    rating = models.FloatField(default=0)
    payment_terms = models.CharField(max_length=60, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_ACTIVE_INACTIVE, default="Active")

    def __str__(self) -> str:
        return self.name


class Product(models.Model):
    SOURCING_CHOICES = [("In-House", "In-House"), ("Out-House", "Out-House"), ("Both", "Both")]

    id = models.CharField(primary_key=True, max_length=40, default=generate_product_id)
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=100, blank=True)
    unit = models.CharField(max_length=30, blank=True)
    description = models.TextField(blank=True)
    default_lead_time_days = models.PositiveIntegerField(default=0)
    base_price = models.FloatField(default=0)
    status = models.CharField(max_length=10, choices=STATUS_ACTIVE_INACTIVE, default="Active")
    technical_data = models.JSONField(default=dict, blank=True)
    preferred_vendor_ids = models.JSONField(default=list, blank=True)
    sourcing_type = models.CharField(max_length=12, choices=SOURCING_CHOICES, default="Both")

    def __str__(self) -> str:
        return self.name


class RFQ(models.Model):
    id = models.CharField(primary_key=True, max_length=40)  # set to rfq_number.lower() on creation
    rfq_number = models.CharField(max_length=30, unique=True)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="rfqs")
    customer_code = models.CharField(max_length=30, blank=True)
    contact_person = models.CharField(max_length=120, blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=40, blank=True)
    customer_reference = models.CharField(max_length=100, blank=True)
    rfq_received_date = models.CharField(max_length=40, blank=True)

    project_name = models.CharField(max_length=200, blank=True)
    project_code = models.CharField(max_length=60, blank=True)
    quote_reference = models.CharField(max_length=60, blank=True)
    end_customer = models.CharField(max_length=200, blank=True)
    location = models.CharField(max_length=120, blank=True)
    industry = models.CharField(max_length=120, blank=True)
    required_delivery_date = models.CharField(max_length=40, blank=True)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default="Medium")

    currency = models.CharField(max_length=10, default="INR")
    payment_terms = models.CharField(max_length=60, blank=True)
    delivery_terms = models.CharField(max_length=120, blank=True)
    quotation_validity = models.CharField(max_length=60, blank=True)
    incoterms = models.CharField(max_length=60, blank=True)
    tax_applicability = models.CharField(max_length=120, blank=True)
    freight_requirement = models.CharField(max_length=200, blank=True)
    customer_remarks = models.TextField(blank=True)

    internal_notes = models.TextField(blank=True)
    customer_notes = models.TextField(blank=True)

    stage = models.CharField(max_length=20, choices=STAGE_CHOICES, default="Draft")
    status = models.CharField(max_length=20, blank=True)
    sales_person = models.CharField(max_length=120, blank=True)
    created_at = models.CharField(max_length=40, blank=True)
    updated_at = models.CharField(max_length=40, blank=True)
    value = models.FloatField(default=0)

    operations_review = models.JSONField(null=True, blank=True)
    sourcing_comments = models.TextField(blank=True, null=True)
    target_margin_percent = models.FloatField(default=15)
    loss_reason = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.rfq_number


class RFQItem(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=generate_item_id)
    rfq = models.ForeignKey(RFQ, on_delete=models.CASCADE, related_name="items")
    item_no = models.PositiveIntegerField()
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="+")
    product_code = models.CharField(max_length=30, blank=True)
    product_name = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    quantity = models.FloatField(default=1, validators=[MinValueValidator(0)])
    unit = models.CharField(max_length=30, blank=True)
    specification = models.TextField(blank=True)
    required_delivery = models.CharField(max_length=40, blank=True)
    target_price = models.FloatField(default=0, validators=[MinValueValidator(0)])
    remarks = models.TextField(blank=True)
    technical_data = models.JSONField(default=dict, blank=True)
    sourcing_confirmed = models.BooleanField(default=False)
    process_vendors = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["item_no"]


class RFQAttachment(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=generate_attachment_id)
    rfq = models.ForeignKey(RFQ, on_delete=models.CASCADE, related_name="attachment_files")
    file = models.FileField(upload_to=attachment_upload_path, max_length=500)
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100, blank=True)
    size_bytes = models.PositiveIntegerField(default=0)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self) -> str:
        return self.original_filename


class CostBreakdownLine(models.Model):
    # adjusted_cost/margin_percent/margin_value/tax_percent/tax_value are derived and
    # deliberately left unrestricted (e.g. margin_value is legitimately negative if
    # Controlling is knowingly pricing an item below cost) — only the inputs a client
    # submits directly are constrained to non-negative, matching the view-level checks.
    item = models.OneToOneField(RFQItem, on_delete=models.CASCADE, related_name="cost_breakdown")
    base_cost = models.FloatField(default=0, validators=[MinValueValidator(0)])
    freight = models.FloatField(default=0, validators=[MinValueValidator(0)])
    duties = models.FloatField(default=0, validators=[MinValueValidator(0)])
    other_charges = models.FloatField(default=0, validators=[MinValueValidator(0)])
    discount = models.FloatField(default=0, validators=[MinValueValidator(0)])
    adjusted_cost = models.FloatField(default=0)
    margin_percent = models.FloatField(default=0)
    margin_value = models.FloatField(default=0)
    selling_price = models.FloatField(default=0, validators=[MinValueValidator(0)])
    tax_percent = models.FloatField(default=0)
    tax_value = models.FloatField(default=0)
    final_price = models.FloatField(default=0, validators=[MinValueValidator(0)])


class Quotation(models.Model):
    STATUS_CHOICES = [
        (s, s) for s in ["Draft", "Pending Approval", "Approved", "Sent", "Viewed", "Negotiation", "Won", "Lost", "Expired"]
    ]

    id = models.CharField(primary_key=True, max_length=40, default=generate_quotation_id)
    quotation_number = models.CharField(max_length=30, unique=True)
    rfq = models.ForeignKey(RFQ, on_delete=models.CASCADE, related_name="quotations")
    customer_name = models.CharField(max_length=200, blank=True)
    project_name = models.CharField(max_length=200, blank=True)
    quote_date = models.CharField(max_length=40, blank=True)
    valid_until = models.CharField(max_length=40, blank=True)
    currency = models.CharField(max_length=10, default="INR")
    amount = models.FloatField(default=0)
    margin_percent = models.FloatField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="Draft")
    sales_person = models.CharField(max_length=120, blank=True)
    loss_reason = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        ordering = ["-quote_date"]

    def __str__(self) -> str:
        return self.quotation_number


class AuditEvent(models.Model):
    id = models.CharField(primary_key=True, max_length=40, default=generate_audit_id)
    rfq = models.ForeignKey(RFQ, on_delete=models.CASCADE, related_name="audit_events")
    timestamp = models.CharField(max_length=40, blank=True)
    user = models.CharField(max_length=120)
    role = models.CharField(max_length=20)
    module = models.CharField(max_length=40)
    record = models.CharField(max_length=60)
    action = models.CharField(max_length=300)
    previous_status = models.CharField(max_length=20, blank=True, null=True)
    new_status = models.CharField(max_length=20, blank=True, null=True)
    comment = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ["-timestamp"]


class AppNotification(models.Model):
    KIND_CHOICES = [(k, k) for k in ["info", "success", "warning", "error"]]

    id = models.CharField(primary_key=True, max_length=40, default=generate_notification_id)
    message = models.CharField(max_length=300)
    timestamp = models.CharField(max_length=40, blank=True)
    read = models.BooleanField(default=False)
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default="info")
    rfq = models.ForeignKey(RFQ, on_delete=models.CASCADE, null=True, blank=True, related_name="notifications")
    quotation = models.ForeignKey(Quotation, on_delete=models.CASCADE, null=True, blank=True, related_name="notifications")
    target_role = models.CharField(max_length=20, blank=True, null=True)

    class Meta:
        ordering = ["-timestamp"]
