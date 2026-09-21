import re

from rest_framework import serializers

from .models import AppNotification, AuditEvent, Customer, CostBreakdownLine, Product, Quotation, RFQ, RFQAttachment, RFQItem, Vendor


def to_camel(s: str) -> str:
    parts = s.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


def to_snake(s: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", s).lower()


class CamelCaseSerializer(serializers.ModelSerializer):
    """Every field this app defines is snake_case (Django convention); every field the
    frontend expects is camelCase (its existing TS interfaces) — this converts between
    them generically so no field needs a manual `source=` mapping."""

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        return {to_camel(k): v for k, v in ret.items()}

    def to_internal_value(self, data):
        snake_data = {to_snake(k): v for k, v in data.items()}
        return super().to_internal_value(snake_data)


class CustomerSerializer(CamelCaseSerializer):
    class Meta:
        model = Customer
        fields = ["id", "code", "name", "contact", "email", "phone", "city", "tax_id", "payment_terms", "status", "updated_at"]


class VendorSerializer(CamelCaseSerializer):
    class Meta:
        model = Vendor
        fields = ["id", "code", "name", "category", "contact", "email", "rating", "payment_terms", "status"]


class ProductSerializer(CamelCaseSerializer):
    class Meta:
        model = Product
        fields = [
            "id", "code", "name", "category", "unit", "description", "default_lead_time_days",
            "base_price", "status", "technical_data", "preferred_vendor_ids", "sourcing_type",
        ]


class RFQItemSerializer(CamelCaseSerializer):
    class Meta:
        model = RFQItem
        fields = [
            "id", "item_no", "product_code", "product_name", "description", "quantity", "unit",
            "specification", "required_delivery", "target_price", "remarks", "technical_data",
            "sourcing_confirmed", "process_vendors",
        ]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["productId"] = instance.product_id
        return ret


class CostBreakdownLineSerializer(CamelCaseSerializer):
    item_id = serializers.CharField(source="item.id", read_only=True)

    class Meta:
        model = CostBreakdownLine
        fields = [
            "item_id", "base_cost", "freight", "duties", "other_charges", "discount", "adjusted_cost",
            "margin_percent", "margin_value", "selling_price", "tax_percent", "tax_value", "final_price",
        ]


class AuditEventSerializer(CamelCaseSerializer):
    rfq_id = serializers.CharField(source="rfq.id", read_only=True)

    class Meta:
        model = AuditEvent
        fields = ["id", "rfq_id", "timestamp", "user", "role", "module", "record", "action", "previous_status", "new_status", "comment"]


class AppNotificationSerializer(CamelCaseSerializer):
    rfq_id = serializers.CharField(source="rfq.id", read_only=True, allow_null=True)
    quotation_id = serializers.CharField(source="quotation.id", read_only=True, allow_null=True)

    class Meta:
        model = AppNotification
        fields = ["id", "message", "timestamp", "read", "kind", "rfq_id", "quotation_id", "target_role"]


class QuotationSerializer(CamelCaseSerializer):
    rfq_id = serializers.CharField(source="rfq.id", read_only=True)
    rfq_number = serializers.CharField(source="rfq.rfq_number", read_only=True)
    customer_id = serializers.CharField(source="rfq.customer_id", read_only=True)

    class Meta:
        model = Quotation
        fields = [
            "id", "quotation_number", "rfq_id", "rfq_number", "customer_id", "customer_name", "project_name",
            "quote_date", "valid_until", "currency", "amount", "margin_percent", "status", "sales_person", "loss_reason",
        ]


class RFQAttachmentSerializer(CamelCaseSerializer):
    """`name` (not `original_filename`) so the frontend's existing {id, name}
    attachment shape extends rather than breaks. No raw storage path/url is
    exposed — downloads go through RFQViewSet's authenticated download action."""

    name = serializers.CharField(source="original_filename", read_only=True)
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RFQAttachment
        fields = ["id", "name", "content_type", "size_bytes", "uploaded_by_name", "uploaded_at"]

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.username if obj.uploaded_by_id else ""


class RFQSerializer(CamelCaseSerializer):
    items = RFQItemSerializer(many=True, read_only=True)
    customer_id = serializers.CharField(source="customer.id", read_only=True)
    cost_breakdown = serializers.SerializerMethodField()
    attachments = RFQAttachmentSerializer(source="attachment_files", many=True, read_only=True)

    class Meta:
        model = RFQ
        fields = [
            "id", "rfq_number", "customer_id", "customer_code", "contact_person", "contact_email", "contact_phone",
            "customer_reference", "rfq_received_date", "project_name", "project_code", "quote_reference",
            "end_customer", "location", "industry", "required_delivery_date", "priority", "currency",
            "payment_terms", "delivery_terms", "quotation_validity", "incoterms", "tax_applicability",
            "freight_requirement", "customer_remarks", "items", "attachments", "internal_notes", "customer_notes",
            "stage", "status", "sales_person", "created_at", "updated_at", "value", "operations_review",
            "sourcing_comments", "cost_breakdown", "target_margin_percent", "loss_reason",
        ]

    def get_cost_breakdown(self, obj):
        lines = []
        for item in obj.items.all():
            cb = getattr(item, "cost_breakdown", None)
            if cb is not None:
                lines.append(CostBreakdownLineSerializer(cb).data)
        return lines
