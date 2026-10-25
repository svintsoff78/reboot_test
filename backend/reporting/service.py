from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
from django.db.models import Min
from reporting.models import Event, Studio

MOSCOW = ZoneInfo("Europe/Moscow")
MAX_DAYS = 93


def parse_period(start, end):
    first, last = date.fromisoformat(start), date.fromisoformat(end)
    if first.isoformat() != start or last.isoformat() != end or first > last or (last - first).days >= MAX_DAYS:
        raise ValueError("Укажите период от 1 до 93 дней, начало не позже окончания.")
    return first, last


def date_bounds(first, last):
    """Окно [полночь первого дня; полночь дня после последнего) по Москве."""
    return (datetime.combine(first, time.min, MOSCOW),
            datetime.combine(last + timedelta(days=1), time.min, MOSCOW))


def money_events(lower, upper, studio):
    """Успешные денежные транзакции окна, по одной на transaction_id.

    Журнал хранит доставки: повтор с тем же transaction_id не является новым движением денег.
    Транзакция относится к моменту её первой успешной доставки, поэтому повтор,
    доставленный уже после границы окна, не попадёт во второе окно.
    """
    success = Event.objects.filter(status="success")
    if studio:
        success = success.filter(order__studio_id=studio)
    firsts = (success.values("transaction_id").annotate(first=Min("occurred_at"))
              .filter(first__gte=lower, first__lt=upper))
    first_at = {row["transaction_id"]: row["first"] for row in firsts}
    rows = (success.filter(transaction_id__in=first_at).select_related("order")
            .order_by("occurred_at", "event_id"))
    unique = {}
    for e in rows:
        if e.occurred_at == first_at[e.transaction_id]:
            unique.setdefault(e.transaction_id, e)
    return sorted(unique.values(), key=lambda e: (e.occurred_at, e.transaction_id))


def metrics(events):
    payments = [e for e in events if e.kind == "payment"]
    incoming = sum(e.amount for e in payments)
    outgoing = sum(e.amount for e in events if e.kind == "refund")
    return {"paid_orders": len({e.order_id for e in payments}), "payments": incoming,
            "refunds": outgoing, "net_cash": incoming - outgoing,
            "td_buyers": len({e.order.client_id for e in payments if e.order.product == "trial"})}


def moscow_date(e):
    return e.occurred_at.astimezone(MOSCOW).date()


def make_report(start, end, studio):
    first, last = parse_period(start, end)
    events = money_events(*date_bounds(first, last), studio)

    by_day = {}
    for e in events:
        by_day.setdefault(moscow_date(e), []).append(e)
    daily = []
    for offset in range((last - first).days + 1):
        values = metrics(by_day.get(first + timedelta(days=offset), []))
        daily.append({"date": (first + timedelta(days=offset)).isoformat(),
                      **{k: values[k] for k in ("payments", "refunds", "net_cash")}})

    studio_rows = Studio.objects.order_by("id")
    if studio:
        studio_rows = studio_rows.filter(pk=studio)
    studios = [{"id": s.id, "title": s.title, **metrics([e for e in events if e.order.studio_id == s.id])}
               for s in studio_rows]

    operations = [{"transaction_id": e.transaction_id, "order_id": e.order_id,
                   "client_id": e.order.client_id, "studio_id": e.order.studio_id,
                   "product": e.order.product, "kind": e.kind, "amount": e.amount,
                   "occurred_at": e.occurred_at.astimezone(MOSCOW).isoformat(),
                   "date": moscow_date(e).isoformat()}
                  for e in events]
    return {"filters": {"start": start, "end": end, "studio": studio}, "summary": metrics(events),
            "daily": daily, "studios": studios, "operations": operations}
