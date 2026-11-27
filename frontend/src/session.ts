import { initialScenario, samples, maxUserAircraft, maxTotalAircraft, type MarkerAircraft } from './scenario'
import { validateAircraft, type Draft } from './aircraftInput'
import type { CatalogSelection } from './ScenariosPage'

export const sessionKey = 'airseparator-workspace-v1'
export function readSession() {
  const catalog: CatalogSelection = { selected: initialScenario.name, region: '', type: '', warning: '' }
  const initial = { sample: initialScenario, scenario: initialScenario.aircraft, user: [] as MarkerAircraft[], catalog }
  try {
    const raw = sessionStorage.getItem(sessionKey)
    if (!raw) return initial
    const saved = JSON.parse(raw)
    const sample = samples.find(s => s.name === saved.name)
    if (!sample || !Array.isArray(saved.scenario) || !Array.isArray(saved.user) ||
        saved.user.length > maxUserAircraft || saved.scenario.length + saved.user.length > maxTotalAircraft) return initial
    const used = new Set<string>()
    function restore(p: MarkerAircraft) {
      const draft = Object.fromEntries(Object.entries(p).map(([key, v]) => [key, String(v)])) as Draft
      const valid = validateAircraft(draft, used)
      used.add(valid.callSign)
      return valid
    }
    for (const key of Object.keys(catalog) as (keyof CatalogSelection)[])
      if (typeof saved.catalog?.[key] === 'string') catalog[key] = saved.catalog[key]
    return { sample, scenario: saved.scenario.map(restore) as MarkerAircraft[], user: saved.user.map(restore) as MarkerAircraft[], catalog }
  } catch { return initial }
}
