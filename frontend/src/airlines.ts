import { palette } from './scenario'

// ICAO assignments and the attribution for each locally bundled logo are in README.md.
const operators: Record<string, { name: string; color: string }> = {
  ACA: { name: 'Air Canada', color: '#ef5264' },
  DAL: { name: 'Delta Air Lines', color: '#ec4973' },
  UAL: { name: 'United Airlines', color: '#548eff' },
  ETH: { name: 'Ethiopian Airlines', color: '#50b75c' },
  RAM: { name: 'Royal Air Maroc', color: '#ec6655' },
  TSC: { name: 'Air Transat', color: '#35b5d7' },
}

export function airlineFor(callSign: string) {
  const code = /^([A-Z]{3})\d[A-Z0-9]{0,3}$/.exec(callSign.trim().toUpperCase())?.[1]
  if (code && operators[code]) return { ...operators[code], code }
}

export function suggestedColor(callSign: string) {
  const name = callSign.trim().toUpperCase()
  const airline = airlineFor(name)
  if (airline) return airline.color
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return palette[hash % palette.length]
}
