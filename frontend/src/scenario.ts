export interface Aircraft {
  callSign: string
  latitudeDegrees: number
  longitudeDegrees: number
  altitudeFeet: number
}

export interface Thresholds { horizontalNm: number; verticalFeet: number }
export interface Range { min: number; max: number }
export interface Config {
  defaults: Thresholds
  limits: Record<keyof Thresholds | 'aircraft', Range>
}

export interface Pair {
  callSignA: string
  callSignB: string
  horizontalNm: number
  verticalFeet: number
  status: 'WARNING' | 'NO_WARNING'
}
export interface Results { pairs: Pair[]; warningCount: number }

const approach: Aircraft[] = [
  { callSign: 'UAL482', latitudeDegrees: 37.68, longitudeDegrees: -122.36, altitudeFeet: 6500 },
  { callSign: 'SWA219', latitudeDegrees: 37.63, longitudeDegrees: -122.32, altitudeFeet: 7000 },
  { callSign: 'ASA706', latitudeDegrees: 37.74, longitudeDegrees: -122.18, altitudeFeet: 10500 },
]

export const samples = [
  { name: 'Bay approach', description: 'Warning example', aircraft: approach },
  { name: 'Altitude spacing', description: 'No-warning example', aircraft:
    approach.map((plane, index) => ({ ...plane, altitudeFeet: 6500 + 2000 * index })) },
]

export function inRange(text: string, range: Range) {
  const value = Number(text)
  return text.trim() !== '' && Number.isFinite(value) && value >= range.min && value <= range.max
}

export const formatNumber = (value: number, digits = 2) =>
  value.toLocaleString('en-US', { maximumFractionDigits: digits })
