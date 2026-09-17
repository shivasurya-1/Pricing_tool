from django.contrib import admin

from .models import AppNotification, AuditEvent, Customer, CostBreakdownLine, Product, Quotation, RFQ, RFQItem, Vendor


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "city", "status", "updated_at"]
    search_fields = ["code", "name"]


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "category", "rating", "status"]
    search_fields = ["code", "name"]


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "category", "sourcing_type", "status"]
    search_fields = ["code", "name"]


class RFQItemInline(admin.TabularInline):
    model = RFQItem
    extra = 0
    readonly_fields = ["id"]


@admin.register(RFQ)
class RFQAdmin(admin.ModelAdmin):
    list_display = ["rfq_number", "customer", "stage", "sales_person", "value", "created_at"]
    list_filter = ["stage", "priority"]
    search_fields = ["rfq_number", "project_name", "customer__name"]
    inlines = [RFQItemInline]


@admin.register(CostBreakdownLine)
class CostBreakdownLineAdmin(admin.ModelAdmin):
    list_display = ["item", "base_cost", "selling_price", "final_price"]


@admin.register(Quotation)
class QuotationAdmin(admin.ModelAdmin):
    list_display = ["quotation_number", "rfq", "status", "amount", "quote_date"]
    list_filter = ["status"]
    search_fields = ["quotation_number"]


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ["timestamp", "rfq", "user", "role", "action"]
    list_filter = ["role", "module"]
    search_fields = ["rfq__rfq_number", "action"]


@admin.register(AppNotification)
class AppNotificationAdmin(admin.ModelAdmin):
    list_display = ["timestamp", "message", "kind", "target_role", "read"]
    list_filter = ["kind", "target_role", "read"]
