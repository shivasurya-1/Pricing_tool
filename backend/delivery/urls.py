from django.urls import path

from .views import DeliveryScheduleResetView, DeliveryScheduleView

urlpatterns = [
    path("", DeliveryScheduleView.as_view(), name="delivery-schedule"),
    path("reset/", DeliveryScheduleResetView.as_view(), name="delivery-schedule-reset"),
]
