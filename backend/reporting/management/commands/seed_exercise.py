"""Явный сброс только трёх учебных таблиц локальной SQLite."""
import json
from pathlib import Path
from datetime import datetime
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from reporting.models import Event, Order, Studio


class Command(BaseCommand):
    help = "Заменить учебные таблицы синтетическим набором (только локальная SQLite)"

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Подтвердить замену учебных данных")

    @transaction.atomic
    def handle(self, *args, **options):
        if not options["reset"]:
            raise CommandError("Нужен явный --reset: учебные таблицы будут заменены.")
        if connection.vendor != "sqlite":
            raise CommandError("Команда разрешена только для учебной SQLite.")
        data = json.loads((Path(__file__).resolve().parents[2] / "data/synthetic.json").read_text())
        Event.objects.all().delete()
        Order.objects.all().delete()
        Studio.objects.all().delete()
        Studio.objects.bulk_create(Studio(**row) for row in data["studios"])
        Order.objects.bulk_create(Order(**row) for row in data["orders"])
        Event.objects.bulk_create(Event(**{**row, "occurred_at": datetime.fromisoformat(row["occurred_at"])}) for row in data["events"])
        self.stdout.write("Учебные данные загружены.")
