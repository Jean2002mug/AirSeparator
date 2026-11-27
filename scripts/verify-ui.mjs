// Run from the repository root with Node 22+ and a running Compose stack.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'

const url = process.env.AIRSEPARATOR_URL || 'http://127.0.0.1:8088/'
const output = resolve(process.env.AIRSEPARATOR_SCREENSHOTS || 'design/screenshots/sprint-3.2')
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
    await click('.aircraft-marker')
    await textIn('.marker-details', 'Altitude')
    await capture('simulation-details', theme)
    await click('.aircraft-marker')
    await page('aircraft')
    await examples()
    await capture('aircraft', theme)
    await click('.tabs button:nth-child(2)')
    await wait(() => document.querySelector('img[alt="Air Canada"]')?.naturalWidth > 0)
    await click('.toolbar button:nth-child(2)')
    await capture('aircraft-import', theme)
    await click('.toolbar button:nth-child(2)')
    await click('.tabs button:first-child')
    await act('Remove TEST01')
    await act('Remove TEST02')
    await page('scenarios')
    await wait(() => document.querySelectorAll('td .status').length === 11)
    await capture('scenarios', theme)
    await page('results')
    await pairCount(6)
    await capture('results', theme)
    await click('.interpretation > button')
    await textIn('.ai-message', 'The warning rule')
    await capture('results-ai', theme)
    await click('.pair-choice')
    await wait(() => !document.querySelector('.ai-message'))
    await click('.pair-table tbody tr:nth-child(2) .pair-choice')
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
  const batch = Array.from({ length: 30 }, (_, i) => 'P' + i + ',45,-73,12000,#123456')
  await importFile(csv + batch.join('\n'))
  await textIn('[role=alert]', '31 user-added aircraft')
  await importFile(csv + batch.slice(0, 29).join('\n'))
  await textIn('[role=status]', 'Imported 29')
  for (const [i, v] of ['OVER31', '45', '-73', '12000'].entries())
    await value(add + ' .form-grid label:nth-child(' + (i + 1) + ') input', v)
  await click(add + ' .primary')
  await textIn(add + ' [role=alert]', 'limit of 30 user-added aircraft')
  await textIn('.tabs button:first-child', 'User Added (30)')
  await send('Page.reload')
  await textIn('.tabs button:first-child', 'User Added (30)')
  await page('results')
  await pairCount(561)
  await page('aircraft')
  await act('Remove TMP123')
  await page('results')
  await pairCount(528)
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
  await click('.interpretation > button')
  await textIn('.ai-message', 'The warning rule')
  await value('.interpretation input', 'Explain the vertical distance')
  await click('.interpretation form button')
  await textIn('.ai-message:last-of-type', 'absolute altitude difference')
  await textIn('.ai-message:last-of-type p:last-child strong', 'Response')
  await value('.interpretation input', 'What is a great circle?')
  await click('.interpretation form button')
  await textIn('.ai-message:last-of-type', 'center of a sphere')
  await value('.interpretation input', 'Can you give an example?')
  await click('.interpretation form button')
  await textIn('.ai-message:last-of-type', 'equator')
  await value('.interpretation input', 'Will these aircraft collide?')
  await click('.interpretation form button')
  await textIn('.ai-message:last-of-type', 'Static positions cannot predict a collision')
  await textIn('.ai-message:last-of-type p:last-child strong', 'Response')
  await page('about')
  for (let i = 0; i < 6; i++) {
    await click('.side-nav button:nth-child(' + (i + 1) + ')')
    await wait(
      (i) => document.querySelectorAll('.side-nav button')[i].getAttribute('aria-pressed') === 'true',
      i,
    )
  }

  // Exercise the Sprint 3.2 workflows against the actual browser and API.
  await page('simulation')
  await run(() => sessionStorage.removeItem('airseparator-workspace-v1'))
  await send('Page.reload')
  await pairCount(6)
  for (const [index, expected, rosterOpen] of [[1,6,false],[2,1,false],[3,5,false],[0,6,true]]) {
    await click('.metric:nth-child(' + (index + 1) + ')')
    assert.equal(await run((i) => document.querySelectorAll('.metric')[i].getAttribute('aria-pressed'), index), 'true')
    assert.equal(await run(() => document.querySelector('.roster').open), rosterOpen)
    if (!rosterOpen) {
      assert.equal(await run(() => document.querySelector('.pair-fold').open), true)
      await pairCount(expected)
    }
  }
  await click('.metric:nth-child(2)')
  const oldHeight = await run(() => document.querySelector('.chart').clientHeight)
  await value('input[type=range]', '550')
  await wait((h) => document.querySelector('.chart').clientHeight > h, oldHeight)
  await wait(() => document.querySelector('.leaflet-tile-pane') !== null)
  await run(() => document.querySelector('.aircraft-marker').dispatchEvent(new MouseEvent('mouseover', {bubbles:true})))
  await textIn('.marker-details', 'Latitude')
  await run(() => document.querySelector('.aircraft-marker').dispatchEvent(new MouseEvent('mouseout', {bubbles:true})))
  await run(() => { window.testOldMarker = document.querySelector('.aircraft-marker') })
  await click('.hover-option input')
  await wait(() => !document.querySelector('.hover-option input').checked && !window.testOldMarker.isConnected && !document.querySelector('.marker-details'))
  await run(() => document.querySelector('.aircraft-marker').dispatchEvent(new MouseEvent('mouseover', {bubbles:true})))
  assert.equal(await run(() => !!document.querySelector('.marker-details')), false)
  await run(() => document.querySelector('.aircraft-marker').focus())
  await send('Input.dispatchKeyEvent', {type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13})
  await send('Input.dispatchKeyEvent', {type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13})
  await textIn('.marker-details', 'Altitude')
  await run(() => document.activeElement.blur())

  await page('aircraft')
  const fields = form('Add') + ' .form-grid label:nth-child('
  for (const [i, v] of ['1212','45','-73','34000'].entries()) await value(fields + (i+1) + ') input', v)
  await click(form('Add') + ' .primary')
  await textIn(form('Add') + ' [role=alert]', 'at least one letter')
  await value(fields + '1) input', 'ACA999')
  assert.equal(await run((s) => document.querySelector(s).value, fields + '5) input'), '#ef5264')
  await value(fields + '5) input', '#1357ab')
  await value(fields + '1) input', 'TEST1')
  assert.equal(await run((s) => document.querySelector(s).value, fields + '5) input'), '#1357ab')
  await click(form('Add') + ' .primary')
  for (let i = 2; i <= 5; i++) {
    for (const [j, v] of [('TEST' + i),'45','-73','34000'].entries()) await value(fields + (j+1) + ') input', v)
    await click(form('Add') + ' .primary')
  }
  await textIn('.tabs button:first-child', 'User Added (5)')
  await page('simulation')
  await value('.sim-side select', 'Conflict')
  await wait(() => document.querySelectorAll('.roster tbody tr').length === 7)
  for (let i = 1; i <= 5; i++) await textIn('.roster', 'TEST' + i)
  await page('aircraft')
  for (const [i, v] of ['RAM310','45','-73','34000'].entries()) await value(fields + (i+1) + ') input', v)
  await click(form('Add') + ' .primary')
  await textIn('.tabs button:first-child', 'User Added (6)')
  await page('simulation')
  await value('.sim-side select', 'Casablanca arrival')
  await textIn('[role=alert]', 'RAM310')
  assert.equal(await run(() => document.querySelector('.sim-side select').value), 'Conflict')
  await page('aircraft')
  await act('Remove RAM310')
  await page('simulation')
  await value('.sim-side select', 'Multiple Aircraft')
  await wait(() => document.querySelectorAll('.roster tbody tr').length === 9)

  await page('scenarios')
  for (const region of ['Africa','Antarctica','Asia','Europe','North America','Oceania','South America']) {
    await value('.filters label:nth-child(3) select', region)
    await wait((r) => document.querySelector('.scenarios-page tbody tr')?.innerText.includes(r), region)
  }
  await value('.filters label:nth-child(3) select', 'Africa')
  await click('.scenarios-page tbody tr')
  await textIn('.preview', 'Casablanca')
  await run(() => document.querySelector('.scenario-choice').focus())
  await send('Input.dispatchKeyEvent', {type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13})
  await send('Input.dispatchKeyEvent', {type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13})
  await click('.preview .primary')
  await wait(() => document.querySelectorAll('.roster tbody tr').length === 7)
  await page('scenarios')
  assert.equal(await run(() => document.querySelector('.filters label:nth-child(3) select').value), 'Africa')
  await textIn('.preview', 'Casablanca')
  await page('simulation')
  await value('.sim-side select', 'Multiple Aircraft')
  await page('aircraft')
  await click('.toolbar button:nth-child(2)')
  const fixture = readFileSync(resolve('frontend/tests/fixtures/aircraft-13.csv'), 'utf8')
  const extra = Array.from({length: 13}, (_, i) => 'FILL' + i + ',45,-73,12000,#123456')
  await importFile(csv + extra.join('\n'))
  await textIn('[role=status]', 'Imported 13')
  await importFile(fixture)
  await textIn('[role=alert]', '31 user-added aircraft')
  await textIn('.tabs button:first-child', 'User Added (18)')
  await value('.import-actions select', 'replace')
  await click('.import-actions button')
  await textIn('[role=status]', 'Imported 13')
  await textIn('.tabs button:first-child', 'User Added (13)')
  await wait(() => document.querySelector('img[alt="Air Canada"]')?.naturalWidth > 0)
  await textIn('tbody', 'Unknown')
  await page('simulation')
  await wait(() => document.querySelectorAll('.aircraft-marker').length === 17)
  await click('.metric:nth-child(2)')
  await textIn('.pair-count', '136 evaluated')
  const nearbyCount = await run(() => document.querySelectorAll('.pair-table tbody tr').length)
  assert(nearbyCount < 136)
  assert.equal(await run(() => [...document.querySelectorAll('.pair-choice')].some(e => e.textContent.includes('ACA701') && e.textContent.includes('RAM705'))), false)
  await click('.scope-switch button:nth-child(2)')
  await pairCount(136)
  assert.equal(await run(() => [...document.querySelectorAll('.pair-choice')].some(e => e.textContent.includes('ACA701') && e.textContent.includes('RAM705'))), true)
  await page('results')
  await pairCount(136)
  await click('.scope-switch button:first-child')
  await pairCount(nearbyCount)
  await page('simulation')
  await click('.thresholds summary')
  await value('.threshold-fields label:first-child input', '20')
  await value('.pair-controls input', '20')
  await click('.metric:nth-child(3)')
  await wait(() => {
    const count = Number(document.querySelector('.metric:nth-child(3) strong').textContent)
    return count > 0 && document.querySelectorAll('.pair-table tbody tr').length === count
  })
  await value('.sim-side select', 'Conflict')
  await page('aircraft')
  for (let i = 0; i < 4; i++) {
    for (const [j, v] of [('EXTRA' + i),'45','-73','34000'].entries()) await value(fields + (j+1) + ') input', v)
    await click(form('Add') + ' .primary')
  }
  await textIn('.tabs button:first-child', 'User Added (17)')
  await page('simulation')
  await value('.sim-side select', 'Multiple Aircraft')
  await wait(() => document.querySelector('.sim-side select').value === 'Multiple Aircraft')
  await page('aircraft')
  await click('.tabs button:nth-child(2)')
  for (const name of ['AAL101','ACA209','DAL305','UAL404']) await act('Remove ' + name)
  await click('.toolbar button:nth-child(2)')
  const original = process.env.AIRSEPARATOR_ORIGINAL_CSV
  if (original && existsSync(original)) {
    await value('.import-actions select', 'replace')
    await upload(original)
    await textIn('[role=status]', 'Imported 12')
  }
  await value('.import-actions select', 'replace')
  await importFile(fixture)
  await textIn('[role=status]', 'Imported 13')
  await textIn('.tabs button:first-child', 'User Added (13)')
  await page('simulation')
  await wait(() => document.querySelectorAll('.aircraft-marker').length === 13)
  await page('aircraft')
  console.log('Passed: Sprint 3.2 cards, map details and resize, five-aircraft scenario changes, seven regions, atomic 13-row import, replacement, logos, 13 map markers and geographic pair scope.')

  await viewport(390, 844)
  for (const theme of ['light', 'dark']) {
    if ((await run(() => document.documentElement.dataset.theme)) !== theme) await click('.theme-switch')
    for (const name of ['simulation', 'aircraft', 'scenarios', 'results', 'about']) {
      await page(name)
      await wait(() => document.documentElement.scrollWidth <= innerWidth)
    }
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
    'Passed: pair selection, strict thresholds, CRUD, atomic CSV validation, 30-user-aircraft limit, filters, loading, results views, About topics, mobile navigation.',
  )
} finally {
  await send('Browser.close').catch(() => {})
  chrome.kill()
}
