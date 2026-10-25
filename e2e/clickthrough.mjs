// Прокликивание UI в реальном Chrome: каждый шаг = действие + проверка + скриншот.
import { chromium } from 'playwright-core'
// Установленный Google Chrome (или путь из CHROME_PATH) — без скачивания браузеров.
const launchOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = process.env.APP_URL ?? 'http://127.0.0.1:5173'
const SHOTS = new URL('./shots/', import.meta.url).pathname
const norm = s => (s ?? '').replace(/\s+/g, ' ').trim()
const text = loc => loc.innerText().then(norm)
const results = []
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch(launchOptions)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU', timezoneId: 'America/New_York', deviceScaleFactor: 1.5 })
const page = await ctx.newPage()
const consoleErrors = []
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })

async function step(title, fn, shot) {
  const checks = []
  const expect = (label, actual, expected) => {
    const ok = expected instanceof RegExp ? expected.test(actual) : actual === expected
    checks.push({ label, actual: String(actual), expected: String(expected), ok })
  }
  let error = ''
  try { await fn(expect) } catch (e) { error = e.message.split('\n')[0] }
  let file = ''
  if (shot) {
    file = `${String(results.length + 1).padStart(2, '0')}.png`
    const target = typeof shot === 'string' && shot !== 'full' ? page.locator(shot).first() : null
    if (target) await target.screenshot({ path: SHOTS + file })
    else await page.screenshot({ path: SHOTS + file, fullPage: shot === 'full' })
  }
  const ok = !error && checks.every(c => c.ok)
  results.push({ title, ok, checks, error, file })
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${title}${error ? ' — ' + error : ''}`)
  for (const c of checks.filter(c => !c.ok)) console.log(`     ✗ ${c.label}: ${c.actual} ≠ ${c.expected}`)
}

const kpi = async name => norm(await page.locator('.kpi', { has: page.getByRole('heading', { name, exact: true }) }).locator('strong, .metric-button').textContent())
const period = async () => norm(await page.locator('.report-period').textContent())
const loaded = () => page.locator('.kpi-grid, .empty, .notice').first().waitFor()
const apply = async () => { await page.getByRole('button', { name: 'Показать' }).click(); await loaded() }

await step('Открытие: апрель 2026, вся сеть', async expect => {
  await page.goto(APP); await loaded()
  expect('Период', await period(), '1 апреля 2026 г. — 30 апреля 2026 г. · 30 дней · Вся сеть')
  expect('Оплаченные заказы', await kpi('Оплаченные заказы'), '142')
  expect('Платежи', await kpi('Платежи'), '1 099 190,00 ₽')
  expect('Возвраты', await kpi('Возвраты'), '3 000,00 ₽')
  expect('Чистый поток', await kpi('Чистый денежный поток'), '1 096 190,00 ₽')
  expect('ТД-покупатели', await kpi('ТД-покупатели'), '48')
}, 'full')

await step('Клик «Платежи» → список успешных платежей, сумма = карточке', async expect => {
  await page.locator('.kpi', { has: page.getByRole('heading', { name: 'Платежи', exact: true }) }).getByRole('button').click()
  const ops = page.locator('#operations')
  await ops.waitFor()
  expect('Сводка', norm(await ops.locator('p.muted').first().textContent()), '142 операции на сумму 1 099 190,00 ₽ — совпадает с карточкой.')
  expect('Итог таблицы', await text(ops.locator('tfoot')), 'Итого 1 099 190,00 ₽')
  expect('Первая операция (31.03 21:30Z → 01.04 00:30 МСК)', await text(ops.locator('tbody tr').first()), /^01\.04\.2026, 00:30:00 P-B01 B01 C149 Студия 01 Пробное \(ТД\) 1 234,00 ₽$/)
  expect('Колонки', await text(ops.locator('thead')), 'Дата и время, МСК Транзакция Заказ Клиент Студия Продукт Сумма')
}, '#operations')

await step('Клик «Возвраты» → список возвратов, сумма = карточке', async expect => {
  await page.locator('.kpi', { has: page.getByRole('heading', { name: 'Возвраты', exact: true }) }).getByRole('button').click()
  const ops = page.locator('#operations')
  expect('Заголовок', norm(await ops.locator('h2').textContent()), 'Возвраты: операции')
  expect('Сводка', norm(await ops.locator('p.muted').first().textContent()), /на сумму 3 000,00 ₽ — совпадает с карточкой/)
}, '#operations')

await step('График: наведение на столбец показывает точные значения', async expect => {
  await page.getByRole('button', { name: 'Закрыть' }).click()
  const bars = page.locator('svg g:has(rect.hit)')
  await bars.nth(3).hover()
  expect('Подсказка над графиком', norm(await page.locator('.chart-readout').textContent()), /^4 апреля 2026 г\.: платежи .+ ₽, возвраты .+ ₽, чистый поток .+ ₽$/)
}, 'section.panel:has(svg)')

await step('График: клавиатура (Tab на график, стрелки, End) и таблица точных значений', async expect => {
  await page.mouse.move(0, 0)
  await page.locator('svg[role=img]').focus()
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight')
  expect('Стрелка → второй день', norm(await page.locator('.chart-readout').textContent()), /^2 апреля 2026 г\./)
  await page.keyboard.press('End')
  expect('End → последний день', norm(await page.locator('.chart-readout').textContent()), /^30 апреля 2026 г\./)
  await page.getByText('Точные значения по дням').click()
  const rows = page.locator('details tbody tr')
  expect('Строк в таблице дней', await rows.count(), 30)
  expect('1 апреля', await text(rows.first()), '1 апреля 2026 г. 1 234,00 ₽ 0,00 ₽ 1 234,00 ₽')
}, 'section.panel:has(svg)')

await step('Таблица студий: итог по сети = карточкам', async expect => {
  const foot = await text(page.locator('tfoot').last())
  expect('Итог по сети', foot, 'Итого по сети 142 1 099 190,00 ₽ 3 000,00 ₽ 1 096 190,00 ₽ 48*')
  expect('Строк студий', await page.locator('section.panel:has(h2:text-is("Сравнение студий")) tbody tr').count(), 5)
}, 'section.panel:has(h2:text("Сравнение студий"))')

await step('Клик по «Студия 02» в таблице → фильтр применяется ко всем блокам', async expect => {
  await page.getByRole('button', { name: 'Студия 02' }).click(); await loaded()
  expect('Период', await period(), /Студия 02/)
  expect('Селект студии', await page.getByLabel('Студия').inputValue(), 'S02')
  expect('Платежи', await kpi('Платежи'), '223 500,00 ₽')
  expect('ТД-покупатели (только студия)', await kpi('ТД-покупатели'), '9')
  expect('В таблице одна студия', await page.locator('section.panel:has(h2:text-is("Сравнение студий")) tbody tr').count(), 1)
  await page.locator('.kpi', { has: page.getByRole('heading', { name: 'Платежи', exact: true }) }).getByRole('button').click()
  expect('Операции только S02', norm(await page.locator('#operations p.muted').first().textContent()), '28 операций на сумму 223 500,00 ₽ — совпадает с карточкой.')
}, 'full')

await step('«← Вся сеть» → возврат ко всей сети', async expect => {
  await page.locator('.report-period').getByRole('button', { name: '← Вся сеть' }).click(); await loaded()
  expect('Период', await period(), /Вся сеть$/)
  expect('Платежи', await kpi('Платежи'), '1 099 190,00 ₽')
  expect('Студий в таблице', await page.locator('section.panel:has(h2:text-is("Сравнение студий")) tbody tr').count(), 5)
}, null)

await step('Фильтры в адресе страницы: выбор студии переживает перезагрузку', async expect => {
  await page.getByRole('button', { name: 'Студия 03' }).click(); await loaded()
  expect('Адрес', new URL(page.url()).search, '?start=2026-04-01&end=2026-04-30&studio=S03')
  await page.reload(); await loaded()
  expect('После перезагрузки', await period(), /· Студия 03/)
  expect('Селект студии', await page.getByLabel('Студия').inputValue(), 'S03')
  expect('Сообщение для экранного диктора', norm(await page.getByRole('status').textContent()), /^Отчёт обновлён: 1 апреля 2026 г\. — 30 апреля 2026 г\. · 30 дней, Студия 03\. Платежи .+ ₽\.$/)
  await page.locator('.report-period').getByRole('button', { name: '← Вся сеть' }).click(); await loaded()
  expect('Адрес после «Вся сеть»', new URL(page.url()).search, '?start=2026-04-01&end=2026-04-30')
}, null)

await step('Быстрый период «Май 2026» + граничная операция 31.05 23:59:59 МСК', async expect => {
  await page.getByRole('button', { name: 'Май 2026' }).click(); await loaded()
  expect('Период', await period(), '1 мая 2026 г. — 31 мая 2026 г. · 31 день · Вся сеть')
  expect('Платежи', await kpi('Платежи'), '1 099 412,00 ₽')
  expect('Возвраты', await kpi('Возвраты'), '4 700,00 ₽')
  expect('Чистый поток', await kpi('Чистый денежный поток'), '1 094 712,00 ₽')
  const pay = page.locator('.kpi', { has: page.getByRole('heading', { name: 'Платежи', exact: true }) }).getByRole('button')
  if (await pay.getAttribute('aria-expanded') !== 'true') await pay.click()
  expect('Последняя операция мая', await text(page.locator('#operations tbody tr').last()), /^31\.05\.2026, 23:59:59 /)
}, 'full')

await step('Ввод дат с клавиатуры: начало позже конца → ошибка, запрос не отправлен', async expect => {
  let requests = 0
  page.on('request', r => { if (r.url().includes('/api/report/')) requests++ })
  await page.getByLabel('С даты').fill('2026-05-10')
  await page.getByLabel('По дату включительно').fill('2026-05-01')
  await page.getByRole('button', { name: 'Показать' }).click()
  expect('Сообщение', norm(await page.locator('#filter-error').textContent()), 'Дата начала не может быть позже даты окончания.')
  expect('Запросов к API', requests, 0)
  expect('Отчёт остался прежним (май)', await period(), /^1 мая 2026/)
}, 'form')

await step('Период длиннее 93 дней → ошибка', async expect => {
  await page.getByLabel('С даты').fill('2026-01-01')
  await page.getByLabel('По дату включительно').fill('2026-05-31')
  await page.getByRole('button', { name: 'Показать' }).click()
  expect('Сообщение', norm(await page.locator('#filter-error').textContent()), 'Период не может быть длиннее 93 дней (сейчас 151).')
}, 'form')

await step('Гонка: май (медленный ответ) → сразу апрель; на экране остаётся апрель', async expect => {
  await page.route('**/api/report/?start=2026-05-01*', async route => { await new Promise(r => setTimeout(r, 1500)); await route.continue().catch(() => {}) })
  await page.getByRole('button', { name: 'Май 2026' }).click()
  await page.getByRole('button', { name: 'Апрель 2026' }).click()
  await page.waitForTimeout(2200)
  await page.unroute('**/api/report/?start=2026-05-01*')
  expect('Период', await period(), /^1 апреля 2026 г\. — 30 апреля/)
  expect('Платежи (апрель)', await kpi('Платежи'), '1 099 190,00 ₽')
}, null)

await step('Сбой сервера → ошибка с кнопкой «Повторить»', async expect => {
  await page.route('**/api/report/**', route => route.fulfill({ status: 502, body: '' }))
  await apply()
  expect('Текст ошибки', norm(await page.locator('.notice').textContent()), 'Сервер не ответил (код 502). Попробуйте ещё раз. Повторить')
}, 'section[aria-busy]')

await step('«Повторить» после восстановления → отчёт загружается', async expect => {
  await page.unroute('**/api/report/**')
  await page.getByRole('button', { name: 'Повторить' }).click(); await page.locator('.kpi-grid').waitFor()
  expect('Платежи', await kpi('Платежи'), '1 099 190,00 ₽')
}, null)

await step('API: неизвестная студия, 94 дня и одна дата → 400 с текстом ошибки', async expect => {
  const r = await page.request.get(`${APP}/api/report/?studio=S99`)
  expect('HTTP', r.status(), 400)
  expect('error', (await r.json()).error, 'Неизвестная студия.')
  const r2 = await page.request.get(`${APP}/api/report/?start=2026-04-01&end=2026-07-03`)
  expect('94 дня → HTTP', r2.status(), 400)
  const r3 = await page.request.get(`${APP}/api/report/?end=2026-05-31`)
  expect('Только одна дата → HTTP', r3.status(), 400)
}, null)

await step('Пустой период (июнь) → отдельное пустое состояние', async expect => {
  await page.getByLabel('С даты').fill('2026-06-01')
  await page.getByLabel('По дату включительно').fill('2026-06-30')
  await apply()
  expect('Пустое состояние', await text(page.locator('.empty')), 'Нет операций За выбранный период в сети не было успешных платежей и возвратов.')
}, 'full')

await step('Только клавиатура: Tab до «Показать», Enter, Tab до карточки «Платежи», Enter', async expect => {
  await page.getByLabel('С даты').fill('2026-04-01')
  await page.getByLabel('По дату включительно').fill('2026-04-30')
  await page.getByLabel('Студия').focus()
  await page.keyboard.press('Tab')
  expect('Фокус на кнопке', norm(await page.evaluate(() => document.activeElement?.textContent)), 'Показать')
  await page.keyboard.press('Enter'); await page.locator('.kpi-grid').waitFor()
  if (await page.locator('#operations').count()) await page.getByRole('button', { name: 'Закрыть' }).click()
  await page.getByRole('button', { name: 'Показать' }).focus()
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab')
    if (await page.evaluate(() => document.activeElement?.classList.contains('metric-button'))) break
  }
  await page.keyboard.press('Enter')
  expect('Открыт список платежей', norm(await page.locator('#operations h2').textContent()), 'Платежи: операции')
  expect('Фокус перенесён на заголовок списка', await page.evaluate(() => document.activeElement?.tagName), 'H2')
}, null)

// Телефон 390 px
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ru-RU' })
const mp = await phone.newPage()
await step('Телефон 390 px: нет горизонтального скролла страницы', async expect => {
  await mp.goto(APP); await mp.locator('.kpi-grid').waitFor()
  expect('Ширина документа', await mp.evaluate(() => document.documentElement.scrollWidth), 390)
  expect('Таблица студий скроллится внутри блока', await mp.evaluate(() => { const el = document.querySelector('section:has(h2) .table-scroll:not(details *)'); return el.scrollWidth > el.clientWidth }), true)
}, null)
await mp.screenshot({ path: SHOTS + 'phone-top.png' })
await mp.evaluate(() => document.querySelector('.chart-scroll').scrollIntoView())
await mp.screenshot({ path: SHOTS + 'phone-chart.png' })
results.at(-1).file = 'phone-top.png'
results.at(-1).extra = 'phone-chart.png'

await step('Нет ошибок в консоли браузера (кроме намеренного 502)', async expect => {
  expect('Ошибки консоли', consoleErrors.filter(e => !/502/.test(e)).join(' | '), '')
}, null)

writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(results, null, 2))
await browser.close()
const failed = results.filter(r => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} шагов пройдено`)
process.exit(failed ? 1 : 0)
