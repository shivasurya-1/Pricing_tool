from rest_framework.routers import DefaultRouter

from .views import (
    AuditEventViewSet,
    CustomerViewSet,
    NotificationViewSet,
    ProductViewSet,
    QuotationViewSet,
    RFQViewSet,
    VendorViewSet,
)

router = DefaultRouter()
router.register("customers", CustomerViewSet, basename="customer")
router.register("vendors", VendorViewSet, basename="vendor")
router.register("products", ProductViewSet, basename="product")
router.register("rfqs", RFQViewSet, basename="rfq")
router.register("quotations", QuotationViewSet, basename="quotation")
router.register("audit-log", AuditEventViewSet, basename="audit-event")
router.register("notifications", NotificationViewSet, basename="notification")

urlpatterns = router.urls
