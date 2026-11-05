from django.urls import path

from .views import (
    DeliveryScheduleResetView,
    DeliveryScheduleVersionDetailView,
    DeliveryScheduleVersionListView,
    DeliveryScheduleVersionRestoreView,
    DeliveryScheduleView,
)

urlpatterns = [
    path("", DeliveryScheduleView.as_view(), name="delivery-schedule"),
    path("reset/", DeliveryScheduleResetView.as_view(), name="delivery-schedule-reset"),
    path("versions/", DeliveryScheduleVersionListView.as_view(), name="delivery-schedule-versions"),
    path("versions/<int:pk>/", DeliveryScheduleVersionDetailView.as_view(), name="delivery-schedule-version"),
    path("versions/<int:pk>/restore/", DeliveryScheduleVersionRestoreView.as_view(), name="delivery-schedule-version-restore"),
]
