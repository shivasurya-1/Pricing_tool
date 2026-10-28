from django.urls import path
from rest_framework.routers import DefaultRouter

from .bulk_import import BulkImportTemplateView, BulkImportView
from .views import FormulaDefinitionViewSet, SectionViewSet, TechDataFieldDefinitionViewSet

router = DefaultRouter()
# Registered before "formulas" — FormulaDefinitionViewSet's widened lookup_value_regex
# ([^/]+, to allow dotted keys like "sectionA.a1") would otherwise match
# "formulas/tech-data-fields/" first, treating "tech-data-fields" as a formula key.
router.register("formulas/tech-data-fields", TechDataFieldDefinitionViewSet, basename="tech-data-field")
router.register("formulas/sections", SectionViewSet, basename="section")
router.register("formulas", FormulaDefinitionViewSet, basename="formula")

# Before the router for the same reason: "formulas/{key}/" would match "bulk-import".
urlpatterns = [
    path("formulas/bulk-import/", BulkImportView.as_view(), name="formulas-bulk-import"),
    path("formulas/bulk-import/template/", BulkImportTemplateView.as_view(), name="formulas-bulk-import-template"),
] + router.urls
