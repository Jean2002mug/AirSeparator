export interface Aircraft {
  callSign: string
  latitudeDegrees: number
  longitudeDegrees: number
  altitudeFeet: number
}
export const maxUserAircraft = 30
export const maxTotalAircraft = 50
export interface MarkerAircraft extends Aircraft {
  color: string
}
export interface Thresholds {
  horizontalNm: number
  verticalFeet: number
}
export interface Range {
  min: number
  max: number
}
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
export interface Results {
  pairs: Pair[]
  warningCount: number
}
export interface Scenario {
  name: string
  type: string
  region: string
  description: string
  aircraft: MarkerAircraft[]
}

export const palette = ['#168afa', '#61b731', '#ff9b19', '#9658e8']
function plane(
  callSign: string,
  latitudeDegrees: number,
  longitudeDegrees: number,
  altitudeFeet: number,
  color: string,
): MarkerAircraft {
  return { callSign, latitudeDegrees, longitudeDegrees, altitudeFeet, color }
}
const multiple = [
  plane('AAL101', 45, -73, 34000, palette[0]),
  plane('ACA209', 45.38, -72.24, 36000, palette[1]),
  plane('DAL305', 44.944, -73.06, 34500, palette[2]),
  plane('UAL404', 45.25, -73.61, 33000, palette[3]),
]
const bay = [
  plane('UAL482', 37.68, -122.36, 6500, palette[0]),
  plane('SWA219', 37.63, -122.32, 7000, palette[2]),
  plane('ASA706', 37.74, -122.18, 10500, palette[1]),
]
export const samples: Scenario[] = [
  {
    name: 'Conflict',
    type: 'Conflict',
    region: 'North America',
    description: 'Two nearby aircraft at similar altitudes over southern Québec.',
    aircraft: [multiple[0], multiple[2]],
  },
  {
    name: 'No Conflict',
    type: 'No Conflict',
    region: 'North America',
    description: 'Two aircraft at different positions and cruising levels.',
    aircraft: [multiple[0], multiple[1]],
  },
  {
    name: 'Multiple Aircraft',
    type: 'Mixed',
    region: 'North America',
    description: 'Four aircraft over southern Québec with a mix of horizontal and vertical separations.',
    aircraft: multiple,
  },
  {
    name: 'Formation Flight',
    type: 'No Conflict',
    region: 'Europe',
    description: 'Three aircraft follow parallel tracks over France at distinct levels.',
    aircraft: [
      plane('AFR201', 48.7, 2.2, 23000, palette[0]),
      plane('BAW312', 48.73, 2.24, 24500, palette[1]),
      plane('DLH405', 48.76, 2.28, 26000, palette[3]),
    ],
  },
  {
    name: 'Bay approach',
    type: 'Mixed',
    region: 'North America',
    description: 'Three simulated arrivals over San Francisco Bay.',
    aircraft: bay,
  },
  {
    name: 'Altitude spacing',
    type: 'No Conflict',
    region: 'North America',
    description: 'The Bay approach positions with 2,000 ft between levels.',
    aircraft: bay.map((p, i) => ({ ...p, altitudeFeet: 6500 + 2000 * i })),
  },
  {
    name: 'Casablanca arrival', region: 'Africa', type: 'Conflict',
    description: 'Two simulated aircraft approach Casablanca at similar levels.',
    aircraft: [plane('RAM310', 33.42, -7.6, 8200, palette[0]), plane('TSC221', 33.45, -7.57, 8700, palette[2])],
  },
  {
    name: 'Ross Island survey', region: 'Antarctica', type: 'No Conflict',
    description: 'Simulated survey aircraft cross McMurdo Sound at different altitudes.',
    aircraft: [plane('ICE21', -77.72, 166.4, 11000, palette[0]), plane('ICE42', -77.76, 166.32, 13000, palette[3])],
  },
  {
    name: 'Tokyo Bay crossing', region: 'Asia', type: 'Mixed',
    description: 'Three simulated aircraft cross Tokyo Bay on two flight levels.',
    aircraft: [plane('SIM31', 35.52, 139.82, 14000, palette[0]), plane('SIM32', 35.55, 139.85, 14500, palette[2]), plane('SIM33', 35.68, 139.94, 18000, palette[3])],
  },
  {
    name: 'Auckland approach', region: 'Oceania', type: 'No Conflict',
    description: 'Two simulated approaches over Manukau Harbour maintain different levels.',
    aircraft: [plane('KIWI41', -36.97, 174.76, 7500, palette[1]), plane('KIWI42', -37.01, 174.79, 9600, palette[0])],
  },
  {
    name: 'Santiago crossing', region: 'South America', type: 'Conflict',
    description: 'Two simulated aircraft cross west of Santiago at nearby altitudes.',
    aircraft: [plane('AND51', -33.39, -70.8, 15500, palette[2]), plane('AND52', -33.36, -70.77, 15800, palette[3])],
  },
]
export const initialScenario = samples[2]
export function calculationBody(aircraft: Aircraft[], thresholds?: Thresholds) {
  return JSON.stringify({
    aircraft: aircraft.map(({ callSign, latitudeDegrees, longitudeDegrees, altitudeFeet }) => ({
      callSign,
      latitudeDegrees,
      longitudeDegrees,
      altitudeFeet,
    })),
    thresholds,
  })
}
export function inRange(text: string, range: Range) {
  return (
    text.trim() !== '' &&
    Number.isFinite(Number(text)) &&
    Number(text) >= range.min &&
    Number(text) <= range.max
  )
}
export const formatNumber = (value: number, digits = 2) =>
  value.toLocaleString('en-US', { maximumFractionDigits: digits })
export const pairId = (p: Pair) => p.callSignA + '/' + p.callSignB
