"""Только локальное учебное приложение. Не использовать в продакшене."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
# Публичный фиктивный ключ только для локальной разработки.
SECRET_KEY = "fake-dev-only-reboot-exercise-key-do-not-use-in-production"
DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]", "testserver"]
INSTALLED_APPS = ["reporting"]
MIDDLEWARE = ["django.middleware.common.CommonMiddleware"]
ROOT_URLCONF = "config.urls"
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": os.environ.get("EXERCISE_DB", str(BASE_DIR / "exercise.sqlite3"))}}
TIME_ZONE = "Europe/Moscow"
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
