from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("formulas.urls")),
    path("api/reference/", include("reference.urls")),
    path("api/rfq/", include("rfq.urls")),
]
