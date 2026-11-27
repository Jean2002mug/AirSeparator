import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
after(() => vite.close())
const { importCsv, validateAircraft } = await vite.ssrLoadModule('/src/aircraftInput.ts')
const { defaultFilter, minNearbyNm, visiblePairs } = await vite.ssrLoadModule('/src/pairView.ts')
const { airlineFor, suggestedColor } = await vite.ssrLoadModule('/src/airlines.ts')
const { formatMeasurement } = await vite.ssrLoadModule('/src/scenario.ts')
const { explanationLabel } = await vite.ssrLoadModule('/src/PairResults.tsx')
test('AI attribution requires an explicit provider source', () => {
  assert.equal(explanationLabel('gemini'), 'Live AI (Gemini)')
  assert.equal(explanationLabel('mock'), 'Response')
  assert.equal(explanationLabel('fallback'), 'Response')
  assert.equal(explanationLabel('ai'), 'Source unavailable')
  assert.equal(explanationLabel(undefined), 'Source unavailable')
})
test('separation measurements show exactly two decimal places', () => {
  assert.equal(formatMeasurement(0), '0.00')
  assert.equal(formatMeasurement(1000), '1,000.00')
  assert.equal(formatMeasurement(4.999), '5.00')
})
const fixture = await readFile(new URL('./fixtures/aircraft-13.csv', import.meta.url), 'utf8')
const base = { callSign: 'p1', latitudeDegrees: '0', longitudeDegrees: '0', altitudeFeet: '0', color: '#123456' }

test('CSV counts actual records, supports heading aliases and preserves supplied colors', () => {
  for (const header of ['Call Sign', 'callsigns', 'callSign']) {
    const rows = importCsv('\uFEFF\r\n' + fixture.replace('Call Sign', header) + '\n\n', [], [], 'merge', 20)
    assert.equal(rows.length, 13)
    assert.equal(rows[0].color, suggestedColor('ACA701'))
  }
  const rows = importCsv('longitude,Marker Color,alt,lat,Callsigns\n-73,#123abc,1200,45," dl12 "', [], [], 'merge', 20)
  assert.deepEqual(rows[0], {callSign:'DL12', longitudeDegrees:-73, latitudeDegrees:45, altitudeFeet:1200, color:'#123abc'})
})
test('CSV fails atomically for invalid data, duplicates, headers and excess capacity', () => {
  const nine = Array.from({ length: 9 }, (_, i) => ({ callSign: 'M' + i }))
  const scenario = [{callSign:'LOCAL'}]
  assert.throws(() => importCsv(fixture, scenario, nine, 'merge', 20), /1 scenario \+ 9 user-added \+ 13 imported = 23/)
  assert.equal(importCsv(fixture, scenario, nine, 'replace', 20).length, 13)
  assert.equal(nine.length, 9)
  assert.throws(() => importCsv(fixture, [{callSign:'ACA701'}], nine, 'replace', 20), /row 2: Duplicate callsign: ACA701/)
  assert.throws(() => importCsv(fixture.replace('NOVA7', 'dal702'), [], [], 'merge', 20), /row 6: Duplicate/)
  assert.throws(() => importCsv(fixture.replace('RAM705', '1212'), [], [], 'merge', 20), /row 8: Callsign/)
  assert.throws(() => importCsv(fixture.replace('Longitude','Latitude'), [], [], 'merge', 20), /same field/)
  assert.throws(() => importCsv(fixture.replace('Longitude','Longtude'), [], [], 'merge', 20), /Longtude/)
})
test('CSV accepts 30 user aircraft alongside a scenario and rejects a 31st', () => {
  const scenario = [{callSign: 'SCEN1'}, {callSign: 'SCEN2'}]
  const records = Array.from({length: 30}, (_, i) => `PLANE${i},45,-73,10000`).join('\n')
  const csv = 'callSign,latitude,longitude,altitude\n' + records
  const imported = importCsv(csv, scenario, [], 'merge', 50)
  assert.equal(imported.length, 30)
  assert.throws(() => importCsv('callSign,latitude,longitude,altitude\nEXTRA,45,-73,10000',
    scenario, imported, 'merge', 50), /31 user-added aircraft. The limit is 30/)
  assert.equal(imported.length, 30)
})
test('callsigns agree with the API, operator recognition requires a flight identifier', () => {
  assert.equal(validateAircraft({...base,callSign:'  ab12345\t'}, new Set()).callSign, 'AB12345')
  for (const callSign of ['1212','12345678','abcdefgh','A B','X+1','é'])
    assert.throws(() => validateAircraft({...base,callSign}, new Set()), /Callsign/)
  for (const prefix of ['ACA','DAL','UAL','ETH','RAM','TSC']) assert.ok(airlineFor(prefix+'1A'))
  for (const plain of ['ACADEMY','DELTA','ACA','ZZZ123']) assert.equal(airlineFor(plain), undefined)
  assert.equal(suggestedColor(' abc2 '), suggestedColor('ABC2'))
})
test('nearby uses unrounded engine distances, includes exactly 100 NM and all possible warnings', () => {
  const pairs = [19.999999,20,99.99999,100,100.00001,3000].map((horizontalNm,i) =>
    ({callSignA:'A',callSignB:'P'+i,horizontalNm,verticalFeet:0,status:i === 0 ? 'WARNING':'NO_WARNING'}))
  assert.deepEqual(visiblePairs(pairs,defaultFilter),pairs.slice(0,4))
  assert.deepEqual(visiblePairs(pairs,{...defaultFilter,radius:minNearbyNm,status:'WARNING'}),[pairs[0]])
  assert.deepEqual(visiblePairs(pairs,{...defaultFilter,scope:'all'}),pairs)
})
