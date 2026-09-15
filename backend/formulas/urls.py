from rest_framework.routers import DefaultRouter

from .views import FormulaDefinitionViewSet

router = DefaultRouter()
router.register("formulas", FormulaDefinitionViewSet, basename="formula")

urlpatterns = router.urls
