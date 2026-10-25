from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from reporting.models import Event, Studio

MOSCOW = ZoneInfo("Europe/Moscow")


def date_bounds(start, end):
    first, last = date.fromisoformat(start), date.fromisoformat(end)
    if first.isoformat() != start or last.isoformat() != end or first > last or (last - first).days > 92:
        raise ValueError("Укажите период от 1 до 93 дней, начало не позже окончания.")
    return (datetime.combine(first, time.min, timezone.utc),
            datetime.combine(last + timedelta(days=1), time.min, timezone.utc))


def unique_transactions(rows):
    seen = set()
    result = []
    for row in rows:
        if row.transaction_id not in seen:
            seen.add(row.transaction_id)
            result.append(row)
    return result


def metrics(payments, refunds):
    incoming = sum(e.amount for e in payments)
    outgoing = sum(e.amount for e in refunds)
    return {"paid_orders": len({e.order_id for e in payments}), "payments": incoming,
            "refunds": outgoing, "net_cash": incoming - outgoing,
            "td_buyers": len({e.order.client_id for e in payments if e.order.product == "trial"})}


def make_report(start, end, studio):
    lower, upper = date_bounds(start, end)
    network = Event.objects.filter(status="success", occurred_at__gte=lower, occurred_at__lt=upper).select_related("order").order_by("occurred_at", "event_id")
    rows = [e for e in network if not studio or e.order.studio_id == studio]
    payments = [e for e in rows if e.kind == "payment"]
    refunds = unique_transactions([e for e in rows if e.kind == "refund"])
    summary = metrics(payments, refunds)
    summary["td_buyers"] = len({e.order.client_id for e in network if e.kind == "payment" and e.order.product == "trial"})
    daily = []
    current, last = date.fromisoformat(start), date.fromisoformat(end)
    while current <= last:
        p = [e for e in payments if e.occurred_at.astimezone(MOSCOW).date() == current]
        r = [e for e in refunds if e.occurred_at.astimezone(MOSCOW).date() == current]
        values = metrics(p, r)
        daily.append({"date": current.isoformat(), **{k: values[k] for k in ("payments", "refunds", "net_cash")}})
        current += timedelta(days=1)
    studios = []
    for s in Studio.objects.order_by("id"):
        if studio and s.id != studio:
            continue
        studios.append({"id": s.id, "title": s.title,
                        **metrics([e for e in payments if e.order.studio_id == s.id],
                                  [e for e in refunds if e.order.studio_id == s.id])})
    operations = [{"transaction_id": e.transaction_id, "order_id": e.order_id,
                   "client_id": e.order.client_id, "studio_id": e.order.studio_id,
                   "product": e.order.product, "kind": e.kind, "amount": e.amount,
                   "occurred_at": e.occurred_at.isoformat(),
                   "date": e.occurred_at.astimezone(MOSCOW).date().isoformat()}
                  for e in sorted(payments + refunds, key=lambda e: (e.occurred_at, e.transaction_id))]
    return {"filters": {"start": start, "end": end, "studio": studio}, "summary": summary,
            "daily": daily, "studios": studios, "operations": operations}
