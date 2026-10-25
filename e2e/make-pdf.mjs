import { chromium } from 'playwright-core'
// Установленный Google Chrome (или путь из CHROME_PATH) — без скачивания браузеров.
const launchOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }
import { readFileSync, writeFileSync } from 'node:fs'

const dir = new URL('./', import.meta.url).pathname
const out = process.argv[2] ?? '../REPORT.pdf'
const results = JSON.parse(readFileSync(dir + 'results.json', 'utf8'))
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const passed = results.filter(r => r.ok).length
const img = (file, cls = '') => `<div class="shot ${cls}"><img src="file://${dir}shots/${file}"></div>`

const steps = results.map((r, i) => `
  <section class="step">
    <h3><span class="badge ${r.ok ? 'ok' : 'fail'}">${r.ok ? '✓ OK' : '✗ FAIL'}</span> ${i + 1}. ${esc(r.title)}</h3>
    ${r.error ? `<p class="err">${esc(r.error)}</p>` : ''}
    <table class="checks">${r.checks.map(c => `<tr><td class="mark ${c.ok ? 'ok' : 'fail'}">${c.ok ? '✓' : '✗'}</td><td>${esc(c.label)}</td><td class="val">${esc(c.actual)}</td></tr>`).join('')}</table>
    ${r.file ? (r.extra ? `<div class="pair">${img(r.file, 'phone')}${img(r.extra, 'phone')}</div>` : img(r.file)) : ''}
  </section>`).join('')

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>REBOOT — исправления и проверка</title><style>
@page { size: A4; margin: 14mm 13mm; }
* { box-sizing: border-box } body { font: 10pt/1.45 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1b2d48; margin: 0 }
h1 { font-size: 20pt; margin: 0 0 4px; letter-spacing: -.02em } h2 { font-size: 13pt; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #315ed7 }
h3 { font-size: 10.5pt; margin: 0 0 6px } p { margin: 4px 0 8px } .muted { color: #52627a } code { font: 8.5pt ui-monospace, Menlo, monospace; background: #f1f4f9; padding: 0 3px; border-radius: 3px }
table { border-collapse: collapse; width: 100% } th, td { text-align: left; vertical-align: top; padding: 5px 6px; border-bottom: 1px solid #e3e9f2 } th { background: #f4f7fb; font-size: 9pt; color: #52627a }
.fix td:first-child { font-weight: 700; width: 18px } .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums } .bad { color: #a3271a } .good { color: #12634f; font-weight: 700 }
.summary { display: flex; gap: 10px; margin: 12px 0 } .summary div { flex: 1; border: 1px solid #dce4f0; border-radius: 8px; padding: 8px 10px; background: #f8fafd } .summary b { display: block; font-size: 15pt }
.step { break-inside: avoid; border: 1px solid #dce4f0; border-radius: 8px; padding: 10px 12px; margin: 0 0 10px }
.badge { display: inline-block; font-size: 8pt; padding: 1px 6px; border-radius: 4px; margin-right: 4px } .badge.ok { background: #e0f3ec; color: #14614f } .badge.fail { background: #fde8e4; color: #a3271a }
.checks td { font-size: 8.5pt; padding: 2px 6px; border: 0 } .checks .val { color: #52627a; font-family: ui-monospace, Menlo, monospace; font-size: 8pt } .mark { width: 14px } .mark.ok { color: #12634f } .mark.fail { color: #a3271a }
.shot { margin-top: 8px; border: 1px solid #dce4f0; border-radius: 6px; overflow: hidden; max-height: 105mm } .shot img { width: 100%; display: block }
.pair { display: flex; gap: 10px; justify-content: center } .shot.phone { width: 62mm; max-height: 130mm }
.err { color: #a3271a } .pagebreak { break-before: page }
</style></head><body>
<h1>REBOOT · отчёт о денежном потоке</h1>
<p class="muted">Что исправлено и как проверено · 25.10.2026 · проект <code>IdeaProjects/reboot</code></p>

<div class="summary">
  <div>Ошибок в расчёте<b>4</b>исправлено</div>
  <div>Backend-тесты<b>17 / 17</b>проходят</div>
  <div>Frontend-тесты<b>13 / 13</b>проходят</div>
  <div>Прокликивание UI<b>${passed} / ${results.length}</b>шагов OK</div>
</div>

<h2>1. Ошибки в расчёте (backend/reporting/service.py)</h2>
<table class="fix">
  <tr><th>#</th><th>Что было не так</th><th>Последствие</th><th>Как исправлено</th></tr>
  <tr><td>1</td><td>Границы периода строились в UTC</td><td>Операция 31.03 21:30 UTC (= 1 апреля 00:30 МСК) выпадала из апреля; конец месяца сдвигался на 3 часа</td><td>Окно = полночь по <code>Europe/Moscow</code>: [первый день 00:00; день после последнего 00:00)</td></tr>
  <tr><td>2</td><td>Платежи не схлопывались по <code>transaction_id</code></td><td>Повторная доставка события удваивала платёж</td><td>Одна запись на транзакцию — и для платежей, и для возвратов</td></tr>
  <tr><td>3</td><td>«ТД-покупатели» в сводке считались по всей сети</td><td>При выборе студии показывались покупатели всей сети</td><td>Все пять KPI считаются одной функцией по одному набору операций</td></tr>
  <tr><td>4</td><td>Дедупликация после фильтра по окну</td><td>Повтор, доставленный уже в следующем периоде, засчитался бы второй раз</td><td>Транзакция относится к моменту первой успешной доставки</td></tr>
</table>

<h3 style="margin-top:12px">Было → стало (сверено с независимым расчётом прямо из исходного JSON)</h3>
<table>
  <tr><th>Срез</th><th>Показатель</th><th class="num">Было</th><th class="num">Стало</th></tr>
  <tr><td>Апрель, вся сеть</td><td>Платежи</td><td class="num bad">1 111 301,00 ₽</td><td class="num good">1 099 190,00 ₽</td></tr>
  <tr><td>Апрель, вся сеть</td><td>ТД-покупатели</td><td class="num bad">47</td><td class="num good">48</td></tr>
  <tr><td>Май, вся сеть</td><td>Оплаченные заказы / платежи</td><td class="num bad">141 / 1 097 067,00 ₽</td><td class="num good">142 / 1 099 412,00 ₽</td></tr>
  <tr><td>Апрель–май, вся сеть</td><td>Платежи</td><td class="num bad">2 208 368,00 ₽</td><td class="num good">2 198 602,00 ₽</td></tr>
  <tr><td>Апрель, Студия 02</td><td>Оплаченные заказы</td><td class="num bad">29</td><td class="num good">28</td></tr>
  <tr><td>Апрель, Студия 02</td><td>Платежи</td><td class="num bad">236 845,00 ₽</td><td class="num good">223 500,00 ₽</td></tr>
  <tr><td>Апрель, Студия 02</td><td>ТД-покупатели</td><td class="num bad">47</td><td class="num good">9</td></tr>
</table>

<h3 style="margin-top:12px">Найдено при повторной сверке с ТЗ</h3>
<table class="fix">
  <tr><th>#</th><th>Проблема</th><th>Последствие</th><th>Исправление</th></tr>
  <tr><td>5</td><td>API подставлял апрель вместо недостающей даты (<code>?end=2026-05-31</code>)</td><td>Отчёт молча строился не за тот период, что запросили</td><td>Одна дата без второй — HTTP 400 с <code>error</code>; без обеих — апрель, как в ТЗ</td></tr>
  <tr><td>6</td><td><code>aria-live</code> висел на всём отчёте</td><td>Экранный диктор зачитывал весь отчёт при каждой смене фильтра</td><td>Отдельная короткая строка статуса: «Отчёт обновлён: период, студия, платежи»</td></tr>
  <tr><td>7</td><td>Фильтры не сохранялись в адресе</td><td>После перезагрузки выбор терялся, ссылкой на отчёт не поделиться</td><td>Период и студия в <code>?start=…&amp;end=…&amp;studio=…</code>, неверный период из адреса заменяется апрелем</td></tr>
  <tr><td>8</td><td>Браузер получал 404 на <code>/favicon.ico</code></td><td>Ошибка в консоли на каждой загрузке</td><td>Пустая иконка в <code>index.html</code></td></tr>
</table>

<h2>2. Что доделано в интерфейсе</h2>
<ul>
  <li>Пять KPI; клик «Платежи» / «Возвраты» открывает операции (дата и время МСК, транзакция, заказ, клиент, студия, продукт, сумма) с итогом и отметкой «совпадает с карточкой».</li>
  <li>Дневной SVG-график: значения при наведении, выбор дня стрелками ←/→/Home/End, раскрываемая таблица точных значений.</li>
  <li>Таблица студий с итогом по сети; клик по студии фильтрует весь отчёт, «← Вся сеть» возвращает.</li>
  <li>Фильтры с проверкой дат (те же правила, что в API), быстрые периоды, подпись текущего периода, загрузка, ошибка с «Повторить», отдельное пустое состояние.</li>
  <li>Защита от гонок: старый запрос отменяется, его поздний ответ игнорируется — на экране всегда последний выбор.</li>
  <li>Вёрстка до 390 px без горизонтального скролла страницы; таблицы и график скроллятся внутри своих блоков.</li>
  <li>Фильтры в адресе страницы, короткая строка статуса для экранного диктора.</li>
</ul>

<h2>3. Автотесты: какое правило защищает каждый</h2>
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
  <tr><td>frontend <code>rules.test.ts</code></td><td>Поздний ответ/ошибка старого запроса не перезаписывает новый; «Повторить» берёт последний применённый выбор; проверка дат; время по Москве; копейки и минус; фильтры из адреса страницы</td></tr>
</table>
<p class="muted">Контроль: на исходном backend падают 8 из 13 новых тестов — они ловят именно найденные ошибки. Прокликивание лежит в репозитории: <code>e2e/</code>, запуск — <code>npm run clickthrough</code>.</p>

<h2 class="pagebreak">4. Прокликивание интерфейса</h2>
<p>Реальный Google Chrome (headless) через Playwright: клики, ввод дат и клавиатура, как у пользователя; на каждом шаге — проверка значений на экране и скриншот. Браузер намеренно запущен в часовом поясе <b>America/New_York</b>, чтобы убедиться, что время операций всё равно показывается по Москве. Сбой сервера и медленный ответ сымитированы перехватом запросов. Последний шаг — телефон 390 px.</p>
<p><b>Итог: ${passed} из ${results.length} шагов пройдено.</b></p>
${steps}
</body></html>`

writeFileSync(dir + 'report.html', html)
const browser = await chromium.launch(launchOptions)
const page = await browser.newPage()
await page.goto('file://' + dir + 'report.html', { waitUntil: 'load' })
await page.pdf({ path: out, format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '13mm', right: '13mm' },
  displayHeaderFooter: true, headerTemplate: '<span></span>',
  footerTemplate: '<div style="font-size:8px;color:#888;width:100%;text-align:center">REBOOT · исправления и проверка · <span class="pageNumber"></span> / <span class="totalPages"></span></div>' })
await browser.close()
console.log('PDF:', out)
