// Собирает два отчёта из результатов прокликивания (results.json + shots/):
//   REPORT_product.pdf — для продакта: что было не так с цифрами, что умеет экран, открытые вопросы;
//   REPORT_dev.pdf     — для разработчика: причины в коде, контракт API, архитектура, тесты, все шаги проверки.
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync } from 'node:fs'

// Установленный Google Chrome (или путь из CHROME_PATH) — без скачивания браузеров.
const launchOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }
const dir = new URL('./', import.meta.url).pathname
const outDir = process.argv[2] ?? '..'
const results = JSON.parse(readFileSync(dir + 'results.json', 'utf8'))
const passed = results.filter(r => r.ok).length
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const step = prefix => results.find(r => r.title.startsWith(prefix)) ?? {}
const img = (file, cls = '') => (file ? `<div class="shot ${cls}"><img src="file://${dir}shots/${file}"></div>` : '')

const css = `
@page { size: A4; margin: 14mm 13mm; }
* { box-sizing: border-box } body { font: 10pt/1.5 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1b2d48; margin: 0 }
h1 { font-size: 20pt; margin: 0 0 4px; letter-spacing: -.02em } h2 { font-size: 13pt; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #315ed7 }
h3 { font-size: 10.5pt; margin: 12px 0 6px } p { margin: 4px 0 8px } ul { margin: 4px 0 8px; padding-left: 18px } li { margin: 2px 0 }
.muted { color: #52627a } code { font: 8.5pt ui-monospace, Menlo, monospace; background: #f1f4f9; padding: 0 3px; border-radius: 3px }
pre { font: 8.3pt/1.45 ui-monospace, Menlo, monospace; background: #f4f7fb; border: 1px solid #e3e9f2; border-radius: 6px; padding: 8px 10px; white-space: pre-wrap; margin: 6px 0 10px }
table { border-collapse: collapse; width: 100% } th, td { text-align: left; vertical-align: top; padding: 5px 6px; border-bottom: 1px solid #e3e9f2 } th { background: #f4f7fb; font-size: 9pt; color: #52627a }
.fix td:first-child { font-weight: 700; width: 18px } .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums } .bad { color: #a3271a } .good { color: #12634f; font-weight: 700 }
.summary { display: flex; gap: 10px; margin: 12px 0 } .summary div { flex: 1; border: 1px solid #dce4f0; border-radius: 8px; padding: 8px 10px; background: #f8fafd } .summary b { display: block; font-size: 15pt }
.callout { border-left: 4px solid #315ed7; background: #f3f6fc; padding: 8px 12px; border-radius: 0 6px 6px 0; margin: 10px 0 }
.callout.warn { border-color: #d08a1f; background: #fdf7ec }
.card { break-inside: avoid; border: 1px solid #dce4f0; border-radius: 8px; padding: 10px 12px; margin: 0 0 10px }
.badge { display: inline-block; font-size: 8pt; padding: 1px 6px; border-radius: 4px; margin-right: 4px } .badge.ok { background: #e0f3ec; color: #14614f } .badge.fail { background: #fde8e4; color: #a3271a }
.checks td { font-size: 8.5pt; padding: 2px 6px; border: 0 } .checks .val { color: #52627a; font-family: ui-monospace, Menlo, monospace; font-size: 8pt } .mark { width: 14px } .mark.ok { color: #12634f } .mark.fail { color: #a3271a }
.shot { margin-top: 8px; border: 1px solid #dce4f0; border-radius: 6px; overflow: hidden; max-height: 105mm } .shot.tall { max-height: 150mm } .shot img { width: 100%; display: block }
.pair { display: flex; gap: 10px; justify-content: center } .shot.phone { width: 62mm; max-height: 130mm }
.err { color: #a3271a } h3 { break-after: avoid } .pagebreak { break-before: page }
`
const page = (title, body) => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head><body>${body}</body></html>`

const beforeAfter = `
<table style="break-inside: avoid">
  <tr><th>Срез</th><th>Показатель</th><th class="num">Было</th><th class="num">Стало</th></tr>
  <tr><td>Апрель, вся сеть</td><td>Платежи</td><td class="num bad">1 111 301,00 ₽</td><td class="num good">1 099 190,00 ₽</td></tr>
  <tr><td>Апрель, вся сеть</td><td>ТД-покупатели</td><td class="num bad">47</td><td class="num good">48</td></tr>
  <tr><td>Май, вся сеть</td><td>Оплаченные заказы / платежи</td><td class="num bad">141 / 1 097 067,00 ₽</td><td class="num good">142 / 1 099 412,00 ₽</td></tr>
  <tr><td>Апрель–май, вся сеть</td><td>Платежи</td><td class="num bad">2 208 368,00 ₽</td><td class="num good">2 198 602,00 ₽</td></tr>
  <tr><td>Апрель, Студия 02</td><td>Оплаченные заказы</td><td class="num bad">29</td><td class="num good">28</td></tr>
  <tr><td>Апрель, Студия 02</td><td>Платежи</td><td class="num bad">236 845,00 ₽</td><td class="num good">223 500,00 ₽</td></tr>
  <tr><td>Апрель, Студия 02</td><td>ТД-покупатели</td><td class="num bad">47</td><td class="num good">9</td></tr>
</table>`

// ───────────────────────── Продакт ─────────────────────────
const product = page('REBOOT — отчёт о денежном потоке: что изменилось', `
<h1>Отчёт о денежном потоке: что изменилось</h1>
<p class="muted">Для продакта и руководителя · REBOOT, учебные данные · 25.10.2026</p>

<div class="callout"><b>Коротко.</b> Цифры в отчёте раньше были неверными: часть платежей считалась дважды, операции около полуночи попадали не в тот день и месяц, а при выборе студии одна из карточек показывала данные всей сети. Это исправлено, и цифры сверены с исходными данными вручную. Экран доделан: руководитель выбирает период и студию, видит пять показателей, график по дням, сравнение студий и может открыть список операций за любой суммой.</div>

<h2>Почему цифры были неверными</h2>
<table class="fix">
  <tr><th>#</th><th>Что происходило</th><th>Как это выглядело для руководителя</th></tr>
  <tr><td>1</td><td><b>Сутки считались по Гринвичу, а не по Москве.</b> Операция в 00:30 по Москве относилась к предыдущему дню.</td><td>Платёж в 00:30 1 апреля (1 234 ₽) попадал в март, а платёж в 00:30 1 мая (2 345 ₽) — в апрель. Итоги месяца и графики по дням «плыли».</td></tr>
  <tr><td>2</td><td><b>Повторное уведомление о платеже считалось новым платежом.</b> Платёжная система иногда присылает одно и то же событие дважды.</td><td>Платёж 10 апреля на 11 000 ₽ учитывался дважды. Вместе с ошибкой №1 апрельские платежи были завышены на 12 111 ₽.</td></tr>
  <tr><td>3</td><td><b>«ТД-покупатели» не учитывали выбранную студию.</b></td><td>У «Студии 02» показывалось 47 покупателей пробного — это число по всей сети. На самом деле их 9.</td></tr>
  <tr><td>4</td><td><b>Если указать только конец периода</b>, начало молча подставлялось как 1 апреля.</td><td>Можно было получить отчёт не за тот период, что запросили, и не заметить этого. Теперь система просит указать обе даты.</td></tr>
</table>

<h3>Было → стало</h3>
${beforeAfter}
<p class="muted">Значения «стало» независимо пересчитаны прямо из исходных данных и совпали с отчётом до копейки.</p>

<h2>Как считаются показатели</h2>
<table>
  <tr><th>Показатель</th><th>Что означает</th></tr>
  <tr><td><b>Оплаченные заказы</b></td><td>Сколько заказов получили успешную оплату в выбранный период. Возврат не отменяет факт оплаты.</td></tr>
  <tr><td><b>Платежи</b></td><td>Сколько денег пришло за период. Повторные уведомления о том же платеже не считаются.</td></tr>
  <tr><td><b>Возвраты</b></td><td>Сколько денег вернули клиентам за период — даже если сама оплата была раньше.</td></tr>
  <tr><td><b>Чистый денежный поток</b></td><td>Платежи минус возвраты. Это движение денег, <b>не выручка</b>; может быть отрицательным.</td></tr>
  <tr><td><b>ТД-покупатели</b></td><td>Сколько разных клиентов купили пробное занятие за период (независимо от возвратов).</td></tr>
</table>
<p>Все даты — по московскому времени, обе границы периода включаются. Деньги студии — по студии, которой принадлежит заказ.</p>

<h2>Что теперь умеет экран</h2>
<div class="card"><h3>Период, студия и пять показателей</h3>
<p>Выбор дат и студии, быстрые кнопки «Апрель», «Май», «Апрель–май». Над показателями всегда написано, за какой период и по какой студии они посчитаны. Выбор сохраняется в адресе страницы — ссылкой можно поделиться.</p>
${img(step('Открытие').file)}</div>

<div class="card"><h3>Из чего сложилась сумма</h3>
<p>Нажатие на «Платежи» или «Возвраты» открывает список операций: дата и время по Москве, номер транзакции и заказа, клиент, студия, продукт, сумма. Внизу — итог, и экран сам сверяет его с карточкой.</p>
${img(step('Клик «Платежи»').file)}</div>

<div class="card"><h3>График по дням</h3>
<p>Платежи и возвраты по дням. Точная сумма видна при наведении на столбец; есть таблица всех значений по дням.</p>
${img(step('График: наведение').file)}</div>

<div class="card"><h3>Сравнение студий</h3>
<p>Таблица с теми же показателями по каждой студии и итогом по сети. Нажатие на студию фильтрует весь отчёт, «← Вся сеть» возвращает обратно.</p>
${img(step('Таблица студий').file)}${img(step('Клик по «Студия 02»').file)}</div>

<div class="card"><h3>Понятные состояния</h3>
<p>Если даты введены неверно — подсказка, что не так. Если сервер не ответил — сообщение и кнопка «Повторить». Если за период нет операций — отдельный экран «Нет операций», а не нули.</p>
${img(step('Ввод дат с клавиатуры').file)}${img(step('Сбой сервера').file)}${img(step('Пустой период').file)}</div>

<div class="card"><h3>Телефон</h3>
<p>Экран читается на телефоне (проверено на ширине 390 px); таблицы и график прокручиваются внутри своих блоков.</p>
<div class="pair">${img(step('Телефон').file, 'phone')}${img(step('Телефон').extra, 'phone')}</div></div>

<h2>Как проверено</h2>
<ul>
  <li>Расчёт сверен с независимым пересчётом исходных данных за апрель, май, апрель–май, отдельные студии и граничные дни.</li>
  <li>Автотесты на каждое правило подсчёта из задания — все проходят.</li>
  <li>Экран прокликан в браузере по ${results.length} сценариям, как это сделал бы пользователь, включая работу только с клавиатуры и на телефоне: <b>${passed} из ${results.length} прошли</b>.</li>
</ul>

<h2>Вопросы к продукту</h2>
<div class="callout warn">
<ul>
  <li><b>Таблица сравнения при выбранной студии</b> сейчас показывает только эту студию. Альтернатива — всегда показывать все студии и подсвечивать выбранную. Что удобнее руководителю?</li>
  <li><b>Итог «ТД-покупателей» по сети</b> может быть меньше суммы по студиям: клиент, купивший пробное в двух студиях, — один покупатель сети. Так задумано; под таблицей есть пояснение.</li>
  <li><b>Возвраты на графике</b> выглядят мелкими на фоне платежей (общая шкала). Точные суммы есть в подсказке и таблице. Нужен ли отдельный график возвратов?</li>
</ul>
</div>
`)

// ───────────────────────── Разработчик ─────────────────────────
const devSteps = results.map((r, i) => `
  <section class="card">
    <h3 style="margin-top:0"><span class="badge ${r.ok ? 'ok' : 'fail'}">${r.ok ? '✓ OK' : '✗ FAIL'}</span> ${i + 1}. ${esc(r.title)}</h3>
    ${r.error ? `<p class="err">${esc(r.error)}</p>` : ''}
    <table class="checks">${r.checks.map(c => `<tr><td class="mark ${c.ok ? 'ok' : 'fail'}">${c.ok ? '✓' : '✗'}</td><td>${esc(c.label)}</td><td class="val">${esc(c.actual)}</td></tr>`).join('')}</table>
    ${r.file ? (r.extra ? `<div class="pair">${img(r.file, 'phone')}${img(r.extra, 'phone')}</div>` : img(r.file)) : ''}
  </section>`).join('')

const dev = page('REBOOT — технический отчёт', `
<h1>REBOOT · технический отчёт</h1>
<p class="muted">Для разработчика · ветка <code>fix/cash-report</code> → <code>main</code> · 25.10.2026</p>

<div class="summary">
  <div>Исправлено<b>8</b>4 в расчёте, 4 по ТЗ</div>
  <div>Backend-тесты<b>17 / 17</b>13 новых</div>
  <div>Frontend-тесты<b>13 / 13</b>10 новых</div>
  <div>E2E<b>${passed} / ${results.length}</b>сценариев</div>
</div>

<h2>1. Ошибки в расчёте — <code>backend/reporting/service.py</code></h2>
<table class="fix">
  <tr><th>#</th><th>Причина в коде</th><th>Последствие</th><th>Исправление</th></tr>
  <tr><td>1</td><td><code>date_bounds()</code> собирал границы через <code>datetime.combine(…, timezone.utc)</code></td><td><code>2026-03-31T21:30Z</code> (01.04 00:30 МСК) вне апреля; <code>2026-04-30T21:00Z…</code> (уже май) — внутри</td><td>Границы в <code>ZoneInfo("Europe/Moscow")</code>: <code>[first 00:00; last+1 00:00)</code>; группировка по дням — тоже МСК</td></tr>
  <tr><td>2</td><td><code>unique_transactions()</code> применялся только к возвратам</td><td>Повтор доставки <code>P-O008</code> удваивал платёж</td><td>Одна запись на <code>transaction_id</code> для обоих видов</td></tr>
  <tr><td>3</td><td><code>summary["td_buyers"]</code> пересчитывался по <code>network</code> (без фильтра студии)</td><td>S02: 47 вместо 9</td><td>Все KPI — одна функция <code>metrics(events)</code> по одному набору</td></tr>
  <tr><td>4</td><td>Дедупликация после фильтра окна</td><td>Повтор, доставленный после границы окна, засчитался бы во втором окне</td><td>Транзакция датируется первой успешной доставкой (<code>Min("occurred_at")</code> по <code>transaction_id</code>)</td></tr>
</table>
<pre>success = Event.objects.filter(status="success")            # + order__studio_id, если выбрана студия
firsts  = success.values("transaction_id").annotate(first=Min("occurred_at"))
                 .filter(first__gte=lower, first__lt=upper)  # окно по Москве
# затем по одной доставке на transaction_id с occurred_at == first</pre>

<h3>Найдено при повторной сверке с ТЗ</h3>
<table class="fix">
  <tr><th>#</th><th>Где</th><th>Проблема</th><th>Исправление</th></tr>
  <tr><td>5</td><td><code>views.report</code></td><td><code>GET.get("start", "2026-04-01")</code> — при одной дате вторая бралась из апреля</td><td>Ровно одна дата → 400 <code>{"error"}</code>; ни одной → апрель</td></tr>
  <tr><td>6</td><td><code>App.vue</code></td><td><code>aria-live</code> на всей секции отчёта</td><td>Отдельный <code>&lt;p role="status"&gt;</code> с короткой фразой</td></tr>
  <tr><td>7</td><td><code>App.vue</code></td><td>Фильтры не в URL</td><td><code>filtersFromQuery</code>/<code>filtersToQuery</code>, <code>history.replaceState</code> при применении</td></tr>
  <tr><td>8</td><td><code>index.html</code></td><td>404 <code>/favicon.ico</code></td><td><code>&lt;link rel="icon" href="data:,"&gt;</code></td></tr>
</table>

<h3>Было → стало (сверено с независимым расчётом из <code>synthetic.json</code>)</h3>
${beforeAfter}

<h2>2. Контракт API</h2>
<ul>
  <li><code>operations[].occurred_at</code> теперь с московским смещением (<code>2026-04-01T00:30:00+03:00</code> вместо <code>…21:30:00+00:00</code>) — тот же момент времени, фронт всё равно форматирует в <code>Europe/Moscow</code>.</li>
  <li><code>/api/report/?start=…</code> или <code>?end=…</code> без пары → <b>400</b>. Без обеих — апрель, как раньше.</li>
  <li>Остальное без изменений: 93 дня включительно, 400 для неверных дат, переполнения (<code>9999-12-31</code>, <code>0001-01-01</code>) и неизвестной студии; только GET.</li>
</ul>

<h2>3. Frontend</h2>
<table>
  <tr><th>Файл</th><th>Что делает</th></tr>
  <tr><td><code>reportLoader.ts</code></td><td>Номер запроса + <code>AbortController</code>: прежний запрос отменяется, поздний ответ/ошибка игнорируются. <code>applied</code> — последний применённый выбор; <code>retry()</code> повторяет его, а не несохранённую форму.</td></tr>
  <tr><td><code>format.ts</code></td><td>Валидация периода (те же правила, что в API), подписи периода, время в <code>Europe/Moscow</code> независимо от пояса браузера, фильтры ↔ URL.</td></tr>
  <tr><td><code>api.ts</code></td><td><code>signal</code> в fetch; сетевой сбой и 5xx без тела → понятный текст.</td></tr>
  <tr><td><code>DailyChart.vue</code></td><td>SVG без библиотек; наведение и клавиатура (←/→/Home/End) → строка точных значений; <code>&lt;details&gt;</code> с таблицей по дням.</td></tr>
  <tr><td><code>OperationsTable.vue</code></td><td>Операции выбранного вида, итог и сверка с карточкой.</td></tr>
  <tr><td><code>App.vue</code></td><td>Фильтры, KPI, студии (клик = общий фильтр), состояния loading / error / empty, URL, <code>role="status"</code>.</td></tr>
</table>

<h2>4. Тесты: какое правило защищает каждый</h2>
<table>
  <tr><th>Тест</th><th>Правило</th></tr>
  <tr><td><code>test_task_example_redelivery_and_partial_refunds</code></td><td>Пример из ТЗ: повтор доставки не удваивает деньги; частичные возвраты — разные операции; поток может быть отрицательным</td></tr>
  <tr><td><code>test_refund_redelivery_counted_once</code></td><td>Уникальность по transaction_id и для возвратов</td></tr>
  <tr><td><code>test_redelivery_after_window_…</code></td><td>Повтор после границы окна не создаёт новый платёж</td></tr>
  <tr><td><code>test_failed_operations_excluded</code>, <code>test_failed_then_success_…</code></td><td>Неуспешные операции не входят в показатели</td></tr>
  <tr><td><code>test_moscow_window_and_daily_grouping</code></td><td>Окно и дни — по Москве; смещения <code>Z</code> и <code>+03:00</code></td></tr>
  <tr><td><code>test_refund_of_earlier_payment</code></td><td>Возврат попадает в окно при оплате раньше окна; возврат не отменяет оплату</td></tr>
  <tr><td><code>test_studio_by_order_owner_and_unique_buyers</code></td><td>Студия — по владельцу заказа; сумма студий = сети; уникальные покупатели сети ≤ сумме студий</td></tr>
  <tr><td><code>test_period_validation</code></td><td>93 дня — можно, 94 — 400; неверные, пустые, с временем, переполнение — 400</td></tr>
  <tr><td><code>test_both_dates_or_none</code>, <code>test_get_only</code></td><td>Без дат — апрель; одна дата — 400; API только GET</td></tr>
  <tr><td><code>SeedDatasetTests</code></td><td>Регрессия на учебном наборе; карточка = дни = студии = операции для сети и каждой студии</td></tr>
  <tr><td>frontend <code>rules.test.ts</code></td><td>Поздний ответ/ошибка старого запроса не перезаписывает новый; «Повторить» берёт последний применённый выбор; проверка дат; время по Москве; копейки и минус; фильтры ↔ URL</td></tr>
</table>
<p class="muted">Контроль: на исходном backend падают 8 из 13 новых тестов — они ловят именно найденные ошибки.</p>

<h2>5. Как запустить проверки</h2>
<pre># backend (Python ≥ 3.12)
cd backend && python manage.py test reporting --noinput      # 17 OK
# frontend
cd frontend && npm run typecheck && npm test && npm run build  # 13 OK
# e2e: при запущенных backend (:8000) и frontend (:5173), нужен Google Chrome
cd e2e && npm install && npm run clickthrough                # ${results.length} сценариев
npm run pdf                                                   # пересобрать оба PDF</pre>

<h2>6. Допущения и ограничения</h2>
<ul>
  <li>Если у транзакции есть неуспешная и успешная доставка — учитывается успешная. Повторы в наборе идентичны по сумме и виду; берётся первая доставка.</li>
  <li>При выбранной студии API и таблица отдают только её (общий фильтр для всех блоков).</li>
  <li>E2E не подключён к CI — в репозитории CI нет.</li>
</ul>

<h2 class="pagebreak">7. Прокликивание: все шаги</h2>
<p>Google Chrome (headless) через Playwright, браузер в поясе <b>America/New_York</b> — чтобы убедиться, что время показывается по Москве. Сбой сервера и медленный ответ сымитированы перехватом запросов (<code>page.route</code>). Итог: <b>${passed} из ${results.length}</b>.</p>
${devSteps}
`)

const browser = await chromium.launch(launchOptions)
for (const [name, html] of [['REPORT_product', product], ['REPORT_dev', dev]]) {
  writeFileSync(`${dir}${name}.html`, html)
  const tab = await browser.newPage()
  await tab.goto(`file://${dir}${name}.html`, { waitUntil: 'load' })
  const label = name === 'REPORT_product' ? 'отчёт для продукта' : 'технический отчёт'
  await tab.pdf({ path: `${outDir}/${name}.pdf`, format: 'A4', printBackground: true,
    margin: { top: '14mm', bottom: '14mm', left: '13mm', right: '13mm' }, displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: `<div style="font-size:8px;color:#888;width:100%;text-align:center">REBOOT · ${label} · <span class="pageNumber"></span> / <span class="totalPages"></span></div>` })
  console.log('PDF:', `${outDir}/${name}.pdf`)
}
await browser.close()
