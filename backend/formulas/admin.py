from django.contrib import admin

from .models import FormulaDefinition, FormulaVersion


class FormulaVersionInline(admin.TabularInline):
    model = FormulaVersion
    extra = 0
    readonly_fields = ["previous_expression", "new_expression", "changed_by", "changed_at", "note"]
    can_delete = False


@admin.register(FormulaDefinition)
class FormulaDefinitionAdmin(admin.ModelAdmin):
    list_display = ["key", "label", "section", "expression", "updated_by", "updated_at"]
    list_filter = ["section"]
    search_fields = ["key", "label", "expression"]
    inlines = [FormulaVersionInline]
