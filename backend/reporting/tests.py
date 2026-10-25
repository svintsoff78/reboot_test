from datetime import datetime
from io import StringIO
from django.core.management import call_command
from django.test import TestCase
from reporting.models import Event, Order, Studio


class ReportTests(TestCase):
    def setUp(self):
        Studio.objects.create(id="S01", title="Студия 01")
        Order.objects.create(id="A", client_id="C001", studio_id="S01", product="trial")
        Event.objects.create(event_id="E1", transaction_id="P1", order_id="A", kind="payment",
                             status="success", amount=100_000, occurred_at=datetime.fromisoformat("2026-04-12T12:00:00+00:00"))

    def test_health(self):
        self.assertEqual(self.client.get("/api/health/").json(), {"status": "ok"})

    def test_simple_report(self):
        data = self.client.get("/api/report/", {"start": "2026-04-12", "end": "2026-04-12"}).json()
        self.assertEqual(data["summary"], dict(paid_orders=1, payments=100_000, refunds=0, net_cash=100_000, td_buyers=1))
        self.assertEqual(data["daily"][0]["payments"], 100_000)

    def test_validation_and_empty(self):
        for params in ({"start": "ошибка"}, {"start": "2026-05-01", "end": "2026-04-01"}, {"studio": "missing"}):
            self.assertEqual(self.client.get("/api/report/", params).status_code, 400)
        data = self.client.get("/api/report/", {"start": "2026-06-10", "end": "2026-06-10"}).json()
        self.assertEqual(data["summary"]["payments"], 0)
        self.assertEqual(data["operations"], [])

    def test_seed_repeatable(self):
        counts = []
        for _ in range(2):
            call_command("seed_exercise", reset=True, stdout=StringIO())
            counts.append((Event.objects.count(), Order.objects.count()))
        self.assertGreater(counts[0][0], 0)
        self.assertEqual(counts[0], counts[1])
