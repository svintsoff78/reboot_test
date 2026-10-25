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


def at(iso):
    return datetime.fromisoformat(iso)


class MoneyRulesTests(TestCase):
    """Каждый тест называет правило из TASK.md, которое он защищает."""

    def setUp(self):
        Studio.objects.create(id="S01", title="Студия 01")
        Studio.objects.create(id="S02", title="Студия 02")
        Order.objects.create(id="CX", client_id="CX", studio_id="S01", product="trial")

    def event(self, event_id, tx, kind, amount, when, order="CX", status="success"):
        Event.objects.create(event_id=event_id, transaction_id=tx, order_id=order, kind=kind,
                             status=status, amount=amount, occurred_at=at(when))

    def report(self, start, end, studio=""):
        response = self.client.get("/api/report/", {"start": start, "end": end, "studio": studio})
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def test_task_example_redelivery_and_partial_refunds(self):
        """Пример из ТЗ: повторная доставка платежа не удваивает деньги, частичные возвраты — разные операции."""
        self.event("E1", "P1", "payment", 100_000, "2026-04-10T09:00:00Z")
        self.event("E1-retry", "P1", "payment", 100_000, "2026-04-10T09:00:00Z")
        self.event("E2", "R1", "refund", 20_000, "2026-04-12T09:00:00Z")
        self.event("E3", "R2", "refund", 10_000, "2026-04-12T10:00:00Z")
        self.assertEqual(self.report("2026-04-10", "2026-04-12")["summary"],
                         dict(paid_orders=1, payments=100_000, refunds=30_000, net_cash=70_000, td_buyers=1))
        self.assertEqual(self.report("2026-04-12", "2026-04-12")["summary"],
                         dict(paid_orders=0, payments=0, refunds=30_000, net_cash=-30_000, td_buyers=0))

    def test_refund_redelivery_counted_once(self):
        """Уникальность по transaction_id действует и для возвратов."""
        self.event("E1", "R1", "refund", 5_000, "2026-04-12T09:00:00Z")
        self.event("E2", "R1", "refund", 5_000, "2026-04-12T09:05:00Z")
        data = self.report("2026-04-12", "2026-04-12")
        self.assertEqual(data["summary"]["refunds"], 5_000)
        self.assertEqual(len(data["operations"]), 1)

    def test_redelivery_after_window_does_not_move_money_again(self):
        """Повтор, доставленный в следующем окне, не создаёт второго платежа: деньги — в окне первой доставки."""
        self.event("E1", "P1", "payment", 100_000, "2026-04-30T20:00:00Z")  # 30.04 23:00 МСК
        self.event("E1-retry", "P1", "payment", 100_000, "2026-04-30T21:30:00Z")  # 01.05 00:30 МСК
        self.assertEqual(self.report("2026-04-30", "2026-04-30")["summary"]["payments"], 100_000)
        self.assertEqual(self.report("2026-05-01", "2026-05-01")["summary"]["payments"], 0)

    def test_failed_operations_excluded(self):
        """Неуспешные операции не входят в показатели и в список операций."""
        self.event("E1", "P1", "payment", 100_000, "2026-04-10T09:00:00Z", status="failed")
        self.event("E2", "R1", "refund", 50_000, "2026-04-10T10:00:00Z", status="failed")
        data = self.report("2026-04-10", "2026-04-10")
        self.assertEqual(data["summary"], dict(paid_orders=0, payments=0, refunds=0, net_cash=0, td_buyers=0))
        self.assertEqual(data["operations"], [])

    def test_failed_then_success_delivery_counts_success(self):
        """Неуспешная попытка с тем же transaction_id не мешает учесть успешную."""
        self.event("E1", "P1", "payment", 100_000, "2026-04-10T09:00:00Z", status="failed")
        self.event("E2", "P1", "payment", 100_000, "2026-04-10T09:01:00Z")
        self.assertEqual(self.report("2026-04-10", "2026-04-10")["summary"]["payments"], 100_000)

    def test_moscow_window_and_daily_grouping(self):
        """Окно и дни — по Москве (UTC+3): 31.03 21:30Z — это 1 апреля, 31.05 23:59:59+03:00 — это 31 мая."""
        self.event("E1", "P1", "payment", 1_000, "2026-03-31T21:30:00Z")
        self.event("E2", "P2", "payment", 2_000, "2026-05-31T23:59:59+03:00")
        self.event("E3", "P3", "payment", 4_000, "2026-03-31T20:59:59Z")  # 31.03 23:59:59 МСК — вне апреля
        april = self.report("2026-04-01", "2026-04-30")
        self.assertEqual(april["summary"]["payments"], 1_000)
        self.assertEqual(april["daily"][0], {"date": "2026-04-01", "payments": 1_000, "refunds": 0, "net_cash": 1_000})
        self.assertEqual(len(april["daily"]), 30)
        self.assertEqual(april["operations"][0]["date"], "2026-04-01")
        self.assertTrue(april["operations"][0]["occurred_at"].startswith("2026-04-01T00:30:00+03:00"))
        self.assertEqual(self.report("2026-05-31", "2026-05-31")["summary"]["payments"], 2_000)
        self.assertEqual(self.report("2026-03-31", "2026-03-31")["summary"]["payments"], 4_000)

    def test_refund_of_earlier_payment(self):
        """Возврат входит в окно, даже если оплата была раньше; оплаченным заказом он не делает."""
        self.event("E1", "P1", "payment", 100_000, "2026-04-01T09:00:00Z")
        self.event("E2", "R1", "refund", 100_000, "2026-05-02T09:00:00Z")
        data = self.report("2026-05-01", "2026-05-31")
        self.assertEqual(data["summary"], dict(paid_orders=0, payments=0, refunds=100_000, net_cash=-100_000, td_buyers=0))
        self.assertEqual(self.report("2026-04-01", "2026-05-31")["summary"]["paid_orders"], 1)

    def test_studio_by_order_owner_and_unique_buyers(self):
        """Студия — по владельцу заказа; ТД-покупатели считаются в выбранной студии; уникальные сети ≠ сумме студий."""
        Order.objects.create(id="CX2", client_id="CX", studio_id="S02", product="trial")
        Order.objects.create(id="PK", client_id="C9", studio_id="S02", product="package")
        Order.objects.create(id="CY", client_id="CY", studio_id="S01", product="trial")
        self.event("E1", "P1", "payment", 1_000, "2026-04-10T09:00:00Z")
        self.event("E2", "P2", "payment", 2_000, "2026-04-10T09:00:00Z", order="CX2")
        self.event("E3", "P3", "payment", 4_000, "2026-04-10T09:00:00Z", order="PK")
        self.event("E4", "P4", "payment", 8_000, "2026-04-10T09:00:00Z", order="CY")
        network = self.report("2026-04-10", "2026-04-10")
        self.assertEqual(network["summary"]["td_buyers"], 2)  # CX и CY
        self.assertEqual(sum(s["td_buyers"] for s in network["studios"]), 3)  # CX учтён в обеих студиях
        for key in ("paid_orders", "payments", "refunds", "net_cash"):
            self.assertEqual(sum(s[key] for s in network["studios"]), network["summary"][key], key)
        s02 = self.report("2026-04-10", "2026-04-10", "S02")
        self.assertEqual(s02["summary"], dict(paid_orders=2, payments=6_000, refunds=0, net_cash=6_000, td_buyers=1))
        self.assertEqual([s["id"] for s in s02["studios"]], ["S02"])
        self.assertEqual({o["studio_id"] for o in s02["operations"]}, {"S02"})

    def test_period_validation(self):
        """Окно до 93 дней включительно; неверные даты и переполнение — 400 с error."""
        self.assertEqual(self.client.get("/api/report/", {"start": "2026-04-01", "end": "2026-07-02"}).status_code, 200)
        for params in ({"start": "2026-04-01", "end": "2026-07-03"}, {"start": "2026-4-1", "end": "2026-04-30"},
                       {"start": "9999-12-31", "end": "9999-12-31"}, {"start": "0001-01-01", "end": "0001-01-01"},
                       {"start": "2026-02-30", "end": "2026-03-01"}, {"start": "", "end": ""},
                       {"start": "2026-04-01T00:00", "end": "2026-04-30"}, {"start": "20260401", "end": "20260430"}):
            response = self.client.get("/api/report/", params)
            self.assertEqual(response.status_code, 400, params)
            self.assertIn("error", response.json())

    def test_both_dates_or_none(self):
        """Без дат — апрель; одна дата без второй — 400, а не молчаливая подстановка апреля."""
        self.assertEqual(self.client.get("/api/report/").json()["filters"], {"start": "2026-04-01", "end": "2026-04-30", "studio": ""})
        for params in ({"start": "2026-05-01"}, {"end": "2026-05-31"}):
            response = self.client.get("/api/report/", params)
            self.assertEqual(response.status_code, 400, params)
            self.assertIn("обе даты", response.json()["error"])

    def test_get_only(self):
        """API только на чтение."""
        self.assertEqual(self.client.post("/api/report/").status_code, 405)


class SeedDatasetTests(TestCase):
    """Регрессия на учебном наборе: значения сверены с независимым расчётом прямо из JSON."""

    def setUp(self):
        call_command("seed_exercise", reset=True, stdout=StringIO())

    def test_april_network(self):
        data = self.client.get("/api/report/", {"start": "2026-04-01", "end": "2026-04-30"}).json()
        self.assertEqual(data["summary"], dict(paid_orders=142, payments=109_919_000, refunds=300_000,
                                               net_cash=109_619_000, td_buyers=48))

    def test_cross_block_consistency(self):
        """Карточка = сумма студий = сумма дней = сумма операций, для сети и для каждой студии."""
        for studio in ["", "S01", "S02", "S03", "S04", "S05"]:
            data = self.client.get("/api/report/", {"start": "2026-04-01", "end": "2026-05-31", "studio": studio}).json()
            summary = data["summary"]
            for kind, key in (("payment", "payments"), ("refund", "refunds")):
                self.assertEqual(sum(o["amount"] for o in data["operations"] if o["kind"] == kind), summary[key])
                self.assertEqual(sum(d[key] for d in data["daily"]), summary[key])
                self.assertEqual(sum(s[key] for s in data["studios"]), summary[key])
            self.assertEqual(len({o["transaction_id"] for o in data["operations"]}), len(data["operations"]))
