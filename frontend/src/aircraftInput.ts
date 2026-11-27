import { inRange, maxUserAircraft, type MarkerAircraft } from './scenario'
import { suggestedColor } from './airlines'
export const fields = [
  { key: 'latitudeDegrees', label: 'Latitude (°)', min: -90, max: 90, example: '45.0000' },
  { key: 'longitudeDegrees', label: 'Longitude (°)', min: -180, max: 180, example: '-73.0000' },
  { key: 'altitudeFeet', label: 'Altitude (ft)', min: -2000, max: 60000, example: '34000' },
] as const
export type Draft = Record<keyof MarkerAircraft, string>
export function validateAircraft(draft: Draft, used: Set<string>): MarkerAircraft {
  const trimmed = draft.callSign.replace(/^[\t-\r ]+|[\t-\r ]+$/g, '')
  if (!/^[a-zA-Z0-9]{1,7}$/.test(trimmed) || !/[a-zA-Z]/.test(trimmed))
    throw Error('Callsign must be 1–7 letters or digits after trimming and contain at least one letter (A–Z).')
  const callSign = trimmed.toUpperCase()
  if (used.has(callSign)) throw Error('Duplicate callsign: ' + callSign + '.')
  for (const f of fields) {
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(draft[f.key]) || !inRange(draft[f.key], f))
      throw Error(f.label + ' must be a number between ' + f.min + ' and ' + f.max + '.')
  }
  if (!/^#[0-9a-f]{6}$/i.test(draft.color)) throw Error('Use a six-digit marker color, such as #168afa.')
  return {
    callSign,
    latitudeDegrees: +draft.latitudeDegrees,
    longitudeDegrees: +draft.longitudeDegrees,
    altitudeFeet: +draft.altitudeFeet,
    color: draft.color,
  }
}

// Aircraft values are single-line fields. Accept quoted cells and escaped quotes.
function csvRow(line: string): string[] {
  const cells: string[] = []
  let cell = '',
    quoted = false,
    closed = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch !== '"') cell += ch
      else if (line[i + 1] === '"') {
        cell += '"'
        i++
      } else {
        quoted = false
        closed = true
      }
    } else if (ch === ',') {
      cells.push(cell.trim())
      cell = ''
      closed = false
    } else if (ch === '"' && !cell.trim() && !closed) {
      quoted = true
      cell = ''
    } else if (ch === '"' || (closed && ch.trim())) throw Error('Malformed quoted field.')
    else cell += ch
  }
  if (quoted) throw Error('Unclosed quoted field.')
  return [...cells, cell.trim()]
}
export type ImportMode = 'merge' | 'replace'
const headings: Record<string, keyof Draft> = {
  callsign: 'callSign', callsigns: 'callSign',
  latitude: 'latitudeDegrees', lat: 'latitudeDegrees', latitudedegrees: 'latitudeDegrees',
  longitude: 'longitudeDegrees', lon: 'longitudeDegrees', lng: 'longitudeDegrees', longitudedegrees: 'longitudeDegrees',
  altitude: 'altitudeFeet', altitudeft: 'altitudeFeet', altitudefeet: 'altitudeFeet', alt: 'altitudeFeet',
  color: 'color', colour: 'color', markercolor: 'color',
}
export function importCsv(text: string, scenario: MarkerAircraft[], user: MarkerAircraft[], mode: ImportMode, limit: number): MarkerAircraft[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)
  const first = lines.findIndex(line => line.trim())
  if (first < 0) throw Error('The CSV is empty. Include a header and at least one aircraft.')
  const keys = csvRow(lines[first]).map(cell => {
    const key = headings[cell.toLowerCase().replace(/[\s_()°-]/g, '')]
    if (!key) throw Error('Unrecognized CSV header "' + cell + '". Use callsign, latitude, longitude, altitude and optional color.')
    return key
  })
  if (new Set(keys).size !== keys.length) throw Error('Two CSV columns represent the same field.')
  for (const key of ['callSign', ...fields.map(f => f.key)] as const)
    if (!keys.includes(key)) throw Error('Missing CSV column for ' + key + '.')
  const retained = mode === 'merge' ? [...scenario, ...user] : scenario
  const used = new Set(retained.map(p => p.callSign))
  const added: MarkerAircraft[] = []
  lines.slice(first + 1).forEach((line, i) => {
    if (!line.trim()) return
    try {
      const cells = csvRow(line)
      if (cells.length !== keys.length) throw Error('Column count does not match the header.')
      const draft = Object.fromEntries(keys.map((key, j) => [key, cells[j]])) as Draft
      draft.color ||= suggestedColor(draft.callSign)
      const plane = validateAircraft(draft, used)
      used.add(plane.callSign)
      added.push(plane)
    } catch (error) {
      throw Error('CSV row ' + (first + i + 2) + ': ' + (error as Error).message)
    }
  })
  if (!added.length) throw Error('Include at least one aircraft row beneath the header.')
  const userTotal = (mode === 'merge' ? user.length : 0) + added.length
  if (userTotal > maxUserAircraft)
    throw Error('This import would create ' + userTotal + ' user-added aircraft. The limit is ' + maxUserAircraft +
      '. Remove ' + (userTotal - maxUserAircraft) + ' aircraft or CSV rows' +
      (mode === 'merge' && user.length && added.length <= maxUserAircraft ? ', or choose Replace User-Added.' : '.'))
  const total = retained.length + added.length
  if (total > limit) {
    const counts = scenario.length + ' scenario + ' + (mode === 'merge' ? user.length : 0) + ' user-added + ' + added.length + ' imported = ' + total
    throw Error(counts + '. A calculation supports at most ' + limit + ' aircraft. Remove ' + (total - limit) + ' aircraft or CSV rows' +
      (mode === 'merge' && user.length && scenario.length + added.length <= limit ? ', or choose Replace User-Added.' : '.'))
  }
  return added
}
