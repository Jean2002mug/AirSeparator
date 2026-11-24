// Run from the repository root with Node 22+ and a running Compose stack.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'

const url = process.env.AIRSEPARATOR_URL || 'http://127.0.0.1:8088/'
const output = resolve('design/screenshots/sprint-3.2')
mkdirSync(output, { recursive: true })
const profile = mkdtempSync(resolve(tmpdir(), 'airseparator-ui-'))
const chrome = spawn(
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  [
    '--headless',
    '--remote-debugging-pipe',
    '--no-first-run',
    '--disable-background-networking',
    '--disable-extensions',
    '--user-data-dir=' + profile,
    'about:blank',
  ],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
)
let id = 0,
  sessionId,
  buffer = ''
const pending = new Map(),
  errors = []
chrome.stdio[4].setEncoding('utf8').on('data', (chunk) => {
  buffer += chunk
  let end
  while ((end = buffer.indexOf('\0')) >= 0) {
    const msg = JSON.parse(buffer.slice(0, end))
    buffer = buffer.slice(end + 1)
    pending.get(msg.id)?.(msg)
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text)
  }
})
function send(method, params = {}) {
  return new Promise((ok, fail) => {
    const n = ++id,
      timer = setTimeout(() => {
        pending.delete(n)
        fail(Error('Timed out: ' + method))
      }, 15000)
    pending.set(n, (msg) => {
      clearTimeout(timer)
      pending.delete(n)
      msg.error ? fail(Error(msg.error.message)) : ok(msg.result)
    })
    chrome.stdio[3].write(JSON.stringify({ id: n, method, params, sessionId }) + '\0')
  })
}
async function run(fn, ...args) {
  const reply = await send('Runtime.evaluate', {
    expression: '(' + fn.toString() + ')(...' + JSON.stringify(args) + ')',
    returnByValue: true,
    awaitPromise: true,
  })
  if (reply.exceptionDetails)
    throw Error(reply.exceptionDetails.exception?.description || reply.exceptionDetails.text)
  return reply.result.value
}
async function wait(fn, ...args) {
  for (let i = 0; i < 100; i++) {
    if (await run(fn, ...args)) return
    await delay(100)
  }
  throw Error('Failed check: ' + fn + ' ' + args + '\n' + (await run(() => document.body.innerText)))
}
const click = (selector) => run((s) => document.querySelector(s).click(), selector)
const textIn = (selector, text) =>
  wait((s, t) => document.querySelector(s)?.textContent.includes(t), selector, text)
async function value(selector, val) {
  await run(
    (s, v) => {
      const el = document.querySelector(s),
        select = el.tagName === 'SELECT'
      Object.getOwnPropertyDescriptor(
        select ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
        'value',
      ).set.call(el, v)
      el.dispatchEvent(new Event(select ? 'change' : 'input', { bubbles: true }))
    },
    selector,
    val,
  )
}
async function page(name) {
  await click('nav a[href="#' + name + '"]')
  await wait((n) => document.querySelector('nav [aria-current=page]')?.getAttribute('href') === '#' + n, name)
  await wait(() => document.querySelector('main') !== null)
}
let fileSequence = 0
async function importFile(content) {
  const path = resolve(profile, 'aircraft-' + ++fileSequence + '.csv')
  writeFileSync(path, content)
  await upload(path)
}
async function upload(path) {
  const { root } = await send('DOM.getDocument')
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' })
  await send('DOM.setFileInputFiles', { nodeId, files: [path] })
  await wait(() => !document.querySelector('.import-actions button')?.disabled)
  await click('.import-actions button')
}
const csv = 'callSign,latitudeDegrees,longitudeDegrees,altitudeFeet,color\r\n'
const samples = 'test01,45.1,-73.2,34000,#168afa\r\nTEST02,44.9,-72.8,35000,#9658e8'
const form = (mode) => 'form[aria-label="' + mode + ' Aircraft"]'
const act = (label) => click('button[aria-label="' + label + '"]')
const pairCount = (n) => wait((n) => document.querySelectorAll('.pair-table tbody tr').length === n, n)
const viewport = (width, height) =>
  send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
async function examples() {
  await click('.toolbar button:nth-child(2)')
  await importFile(csv + samples)
  await textIn('[role=status]', 'Imported 2')
  await page('simulation')
  await pairCount(15)
  await page('aircraft')
  await act('Edit TEST01')
}
async function capture(name, theme) {
  await run(() => {
    window.scrollTo(0, 0)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  await delay(140)
  const {cssContentSize} = await send('Page.getLayoutMetrics')
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
    clip: {...cssContentSize, x:0, y:0, scale:1} })
  writeFileSync(resolve(output, name + '-' + theme + '.png'), Buffer.from(shot.data, 'base64'))
}
try {
  const tab = (await send('Target.getTargets')).targetInfos.find((t) => t.type === 'page')
  sessionId = (await send('Target.attachToTarget', { targetId: tab.targetId, flatten: true })).sessionId
  await send('Runtime.enable')
  await viewport(1366, 800)
  await send('Page.navigate', { url })
  await pairCount(6)
  for (const theme of ['light', 'dark']) {
    if ((await run(() => document.documentElement.dataset.theme)) !== theme) await click('.theme-switch')
    await wait((t) => document.documentElement.dataset.theme === t, theme)
    await send('Page.reload')
    await pairCount(6)
    assert.equal(await run(() => document.documentElement.dataset.theme), theme)
    await wait(
      () =>
        document.querySelectorAll('.aircraft-marker').length === 4 &&
        document.querySelector('.leaflet-tile-loaded'),
    )
    await textIn('.analysis', 'AAL101 – DAL305')
    assert.equal(await run(() => document.querySelector('.metric:nth-child(3) strong').textContent), '1')
    await capture('simulation', theme)
    await page('aircraft')
    await examples()
    await capture('aircraft', theme)
    await act('Remove TEST01')
    await act('Remove TEST02')
    await page('scenarios')
    await wait(() => document.querySelectorAll('td .status').length === 11)
    await capture('scenarios', theme)
    await page('results')
    await pairCount(6)
    await capture('results', theme)
    await page('about')
    await textIn('main', 'not a certified')
    await capture('about', theme)
    await page('simulation')
    await pairCount(6)
    console.log(theme + ': captured all five pages; theme survived reload')
  }

  await click('.pair-choice')
  await textIn('.analysis', 'AAL101 – ACA209')
  await click('.thresholds summary')
  await value('.threshold-fields label:nth-child(2) input', '500')
  await wait(() => document.querySelector('.metric:nth-child(3) strong')?.textContent === '0')
  await value('.threshold-fields label:nth-child(2) input', '99')
  await textIn('.sim-body', 'within the displayed ranges')
  await value('.threshold-fields label:nth-child(2) input', '1000')
  await pairCount(6)
  await click('.pair-fold summary')
  assert.equal(await run(() => document.querySelector('.pair-fold').open), false)
  await page('aircraft')
  const add = form('Add'),
    edit = form('Edit')
  for (const [i, v] of ['tmp123', '45.2', '-73.4', '11800', '#1357ab'].entries())
    await value(add + ' .form-grid label:nth-child(' + (i + 1) + ') input', v)
  await click(add + ' .primary')
  await textIn('tbody', 'TMP123')
  await value(edit + ' .form-grid label:nth-child(4) input', '12000')
  await click(edit + ' .primary')
  await textIn('tbody', '12,000')
  await click('.toolbar button:nth-child(2)')
  await importFile(csv + 'GOOD,45,-73,1000,#123456\r\ntmp123,45,-73,1000,#123456')
  await textIn('[role=alert]', 'Duplicate callsign')
  assert(!(await run(() => document.querySelector('tbody').innerText)).includes('GOOD'))
  await importFile(csv + 'BAD,91,-73,1000,#123456')
  await textIn('[role=alert]', 'Latitude')
  await importFile(csv + 'BAD,45,-73,NaN,#123456')
  await textIn('[role=alert]', 'Altitude')
  const batch = Array.from({ length: 16 }, (_, i) => 'P' + i + ',45,-73,12000,#123456')
  await importFile(csv + batch.join('\n'))
  await textIn('[role=alert]', 'at most 20')
  await importFile(csv + batch.slice(0, 15).join('\n'))
  await textIn('[role=status]', 'Imported 15')
  await page('results')
  await pairCount(190)
  await page('aircraft')
  await act('Remove TMP123')
  await page('results')
  await pairCount(171)
  await page('simulation')
  await run(() => sessionStorage.removeItem('airseparator-workspace-v1'))
  await send('Page.reload')
  await pairCount(6)
  await page('scenarios')
  await wait(() => document.querySelectorAll('.scenarios-page td .status').length === 11)
  await value('.filters label:nth-child(1) select', 'No Conflict')
  await value('.filters label:nth-child(2) select', 'No Warning')
  await value('.filters label:nth-child(3) select', 'Europe')
  await wait(() => document.querySelectorAll('tbody tr').length === 1)
  await click('.scenario-choice')
  await textIn('.preview', 'AFR201')
  await click('.preview .primary')
  await pairCount(3)
  assert.equal(await run(() => document.querySelector('.metric:nth-child(3) strong').innerText), '0')
  await page('results')
  for (const [i, heading] of [
    'Pairwise Separation',
    'Aircraft List',
    'Summary',
    'AI Interpretation',
  ].entries()) {
    await click('.side-nav button:nth-child(' + (i + 1) + ')')
    await textIn('.results-body h1', heading)
  }
  assert(await run(() => document.querySelector('.interpretation input').matches(':disabled')))
  await page('about')
  for (let i = 0; i < 6; i++) {
    await click('.side-nav button:nth-child(' + (i + 1) + ')')
    await wait(
      (i) => document.querySelectorAll('.side-nav button')[i].getAttribute('aria-pressed') === 'true',
      i,
    )
  }
  await viewport(390, 844)
  for (const name of ['simulation', 'aircraft', 'scenarios', 'results', 'about']) {
    await page(name)
    await wait(() => document.documentElement.scrollWidth <= innerWidth)
  }
  await run(() => document.querySelector('nav a[href="#aircraft"]').focus())
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  })
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  })
  await wait(() => document.querySelector('nav [aria-current=page]')?.textContent === 'Aircraft')
  assert.deepEqual(errors, [])
  console.log(
    'Passed: pair selection, strict thresholds, CRUD, atomic CSV validation, 20-aircraft limit, filters, loading, results views, About topics, mobile navigation.',
  )
} finally {
  await send('Browser.close').catch(() => {})
  chrome.kill()
}
