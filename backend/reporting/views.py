from django.http import JsonResponse
from django.views.decorators.http import require_GET
from reporting.models import Studio
from reporting.service import make_report


@require_GET
def health(request):
    return JsonResponse({"status": "ok"})


@require_GET
def studios(request):
    return JsonResponse({"studios": list(Studio.objects.order_by("id").values("id", "title"))})


@require_GET
def report(request):
    start, end = request.GET.get("start", "2026-04-01"), request.GET.get("end", "2026-04-30")
    studio = request.GET.get("studio", "")
    if studio and not Studio.objects.filter(pk=studio).exists():
        return JsonResponse({"error": "Неизвестная студия."}, status=400)
    try:
        result = make_report(start, end, studio)
    except (ValueError, OverflowError):
        return JsonResponse({"error": "Некорректный период. Нужны даты YYYY-MM-DD, от 1 до 93 дней."}, status=400)
    return JsonResponse(result)
