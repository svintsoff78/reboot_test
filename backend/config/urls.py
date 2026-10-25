from django.urls import path
from reporting.views import health, report, studios

urlpatterns = [path("api/health/", health), path("api/studios/", studios), path("api/report/", report)]
