from rest_framework.routers import DefaultRouter

from .views import FormulaDefinitionViewSet, SectionViewSet, TechDataFieldDefinitionViewSet

router = DefaultRouter()
# Registered before "formulas" — FormulaDefinitionViewSet's widened lookup_value_regex
# ([^/]+, to allow dotted keys like "sectionA.a1") would otherwise match
# "formulas/tech-data-fields/" first, treating "tech-data-fields" as a formula key.
router.register("formulas/tech-data-fields", TechDataFieldDefinitionViewSet, basename="tech-data-field")
router.register("formulas/sections", SectionViewSet, basename="section")
router.register("formulas", FormulaDefinitionViewSet, basename="formula")

urlpatterns = router.urls
