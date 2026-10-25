from django.db import models


class Studio(models.Model):
    id = models.CharField(primary_key=True, max_length=8)
    title = models.CharField(max_length=60)


class Order(models.Model):
    id = models.CharField(primary_key=True, max_length=16)
    client_id = models.CharField(max_length=8)
    studio = models.ForeignKey(Studio, on_delete=models.PROTECT)
    product = models.CharField(max_length=10, choices=[("trial", "Пробное"), ("package", "Пакет")])


class Event(models.Model):
    """Неизменяемый журнал доставок. transaction_id повторяется при повторной доставке."""
    event_id = models.CharField(primary_key=True, max_length=40)
    transaction_id = models.CharField(max_length=40, db_index=True)
    order = models.ForeignKey(Order, on_delete=models.PROTECT)
    kind = models.CharField(max_length=10, choices=[("payment", "Платёж"), ("refund", "Возврат")])
    status = models.CharField(max_length=10, choices=[("success", "Успех"), ("failed", "Ошибка")])
    amount = models.PositiveBigIntegerField()
    occurred_at = models.DateTimeField(db_index=True)
