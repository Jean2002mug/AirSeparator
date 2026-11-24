import type { Pair } from './scenario'

export type Card = 'Aircraft' | 'Aircraft Pairs' | 'Warning Pairs' | 'No-Warning Pairs'
export interface PairFilter {
  scope: 'nearby' | 'all'
  radius: number
  status: 'any' | Pair['status']
}
export const minNearbyNm = 20
export const defaultFilter: PairFilter = { scope: 'nearby', radius: 100, status: 'any' }
export function visiblePairs(pairs: Pair[], filter: PairFilter) {
  return pairs.filter(p => (filter.scope === 'all' || p.horizontalNm <= filter.radius)
    && (filter.status === 'any' || p.status === filter.status))
}
export function cardFor(status: PairFilter['status']): Card {
  return status === 'WARNING' ? 'Warning Pairs' : status === 'NO_WARNING' ? 'No-Warning Pairs' : 'Aircraft Pairs'
}
export interface PairView {
  filter: PairFilter
  change: (update: Partial<PairFilter>) => void
  pairs: Pair[]
}
