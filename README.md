# REBOOT · учебный отчёт о денежном потоке

Это самостоятельный мини-проект для вакансии fullstack-разработчика: Python/Django, Vue/TypeScript, API, БД, интеграционные данные, тестирование и осмысленное использование AI. Здесь только синтетические идентификаторы. Это не код Reboot OS и не интеграция с рабочими системами.

На выполнение — **до 4 часов**, на отправку — **3 календарных дня** с получения. Подробности и приоритеты — в [TASK.md](TASK.md). Если время вышло, отправьте то, что готово, и перечислите ограничения.

## Среда

Python **3.12 или новее**; проверено на Python 3.13.13, Django 6.0.8. Node.js **22.12 или новее**; проверено на Node **26.0.0**, npm **11.12.1**. Прямые зависимости закреплены в package.json. Lock-файл не включён: полностью чистая установка из реестра в этой подготовке не выполнялась. При своей установке сохраните созданный package-lock.json.

Нужны только Python, Node и SQLite из Python. Нет платных API, ключей, Docker или внешней БД. Для первой установки зависимостей потребуется доступ к PyPI/npm. Команды ниже выполняются из распакованного каталога проекта в двух терминалах.

## Backend

```bash
cd backend
python3 --version
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py seed_exercise --reset
python manage.py runserver 127.0.0.1:8000
```

Используйте python3, соответствующий версии не ниже 3.12. В Windows активация: `.venv\Scripts\activate`. `seed_exercise --reset` явно заменяет только три учебные таблицы локальной SQLite. Повторный вызов даёт тот же набор. Не указывайте рабочую БД; используйте настройки из комплекта. JSON-источник: `backend/reporting/data/synthetic.json`.

В третьем терминале:

```bash
curl --fail http://127.0.0.1:8000/api/health/
curl --fail 'http://127.0.0.1:8000/api/report/?start=2026-04-01&end=2026-04-30'
```

Health возвращает `{"status":"ok"}`. Отчёт возвращает JSON с `summary`, `daily`, `studios`, `operations`, `filters`.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Откройте **http://127.0.0.1:5173**. Vite передаёт `/api` на локальный Django :8000. Frontend обращается к относительным URL. Отдельный CORS не нужен: запросы браузера идут на один origin. Серверы слушают только loopback; разрешённые host ограничены localhost, loopback и служебным testserver Django. Ключ Django в настройках — явно фиктивный dev-only ключ, не производственный credential. Ничего не публикуйте.

## Проверки

```bash
# Из backend с активированным venv
python manage.py test reporting --noinput
# Из frontend
npm run typecheck
npm test
npm run build
```

Стартовые тесты проверяют простые ситуации, но не доказывают корректность всего отчёта. Добавьте собственные проверки важных правил. Для просмотра интерфейса используйте `npm run dev` при запущенном backend; сборка сама по себе не проверяет поведение API.

## Структура

- `backend/reporting/models.py` — студии, заказы, журнал доставок событий.
- `backend/reporting/service.py`, `views.py` — расчёт и GET API.
- `frontend/src/api.ts` — типы и обращения к API.
- `frontend/src/reportLoader.ts` — состояние загрузки.
- `frontend/src/App.vue` — стартовый интерфейс.

Передайте исходники и короткий отчёт по TASK.md. Не включайте `.venv`, `node_modules`, `dist`, SQLite, кэши, `.env` и секреты. Git-коммиты не обязательны; небольшой diff или список изменённых файлов поможет обсуждению.
