import { useState } from 'react'
import { AirspaceMap } from './AirspaceMap'
import { Analysis, EmptyPairs, Metrics, PairControls, PairTable } from './PairResults'
import { cardFor, type Card, type PairView } from './pairView'
import {
  formatNumber,
  samples,
  type Config,
  type MarkerAircraft,
  type Pair,
  type Results,
  type Scenario,
  type Thresholds,
} from './scenario'

interface Props {
  aircraft: MarkerAircraft[]
  scenario: Scenario
  scenarioAircraft: MarkerAircraft[]
  view: PairView
  showRoster: boolean
  onCard: (card: Card) => void
  load: (s: Scenario) => void
  results?: Results
  pair?: Pair
  select: (p: Pair) => void
  thresholds: Thresholds
  values: Record<keyof Thresholds, string>
  change: (k: keyof Thresholds, v: string) => void
  config?: Config
  message: string
}
export function SimulationPage({
  aircraft,
  scenario,
  scenarioAircraft, view, showRoster, onCard,
  load,
  results,
  pair,
  select,
  thresholds,
  values,
  change,
  config,
  message,
}: Props) {
  const [rosterOpen, setRosterOpen] = useState(showRoster)
  const [pairsOpen, setPairsOpen] = useState(true)
  function activate(card: Card) {
    onCard(card)
    setRosterOpen(card === 'Aircraft')
    setPairsOpen(card !== 'Aircraft')
  }
  return (
    <main className="page simulation">
      <h1 className="sr-only">Simulation</h1>
      <aside className="sim-side">
        <section className="panel">
          <h2>Scenario</h2>
          <label>
            Selected Scenario
            <select
              value={scenario.name}
              onChange={(e) => load(samples.find((s) => s.name === e.target.value)!)}
            >
              {samples.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.aircraft.length})
                </option>
              ))}
            </select>
          </label>
        </section>
        <details className="panel fold roster" open={rosterOpen}>
          <summary onClick={e => { e.preventDefault(); setRosterOpen(!rosterOpen) }}>Aircraft List ({aircraft.length})</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Callsign</th>
                  <th>Altitude (ft)</th>
                </tr>
              </thead>
              <tbody>
                {aircraft.map((p) => (
                  <tr key={p.callSign}>
                    <th scope="row">
                      <i className="swatch" style={{ background: p.color }} />
                      {p.callSign}
                    </th>
                    <td>{formatNumber(p.altitudeFeet)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <details className="panel fold thresholds">
          <summary>Separation thresholds</summary>
          <div className="threshold-fields">
            {(['horizontalNm', 'verticalFeet'] as const).map((key, i) => (
              <label key={key}>
                {i ? 'Vertical (ft)' : 'Horizontal (NM)'}
                <input
                  type="number"
                  required
                  step="any"
                  disabled={!config}
                  min={config?.limits[key].min}
                  max={config?.limits[key].max}
                  value={values[key]}
                  onChange={(e) => change(key, e.target.value)}
                />
                <small>
                  {config &&
                    formatNumber(config.limits[key].min) + '–' + formatNumber(config.limits[key].max)}
                </small>
              </label>
            ))}
          </div>
        </details>
      </aside>
      <div className="sim-body">
        <Metrics count={aircraft.length} results={results} active={showRoster ? 'Aircraft' : cardFor(view.filter.status)} onChoose={activate} />
        <AirspaceMap aircraft={aircraft} scenarioAircraft={scenarioAircraft} scenarioName={scenario.name} results={results} selected={pair} />
        <details className="panel fold pair-fold" open={pairsOpen}>
          <summary onClick={e => { e.preventDefault(); setPairsOpen(!pairsOpen) }}>Pair Results ({results ? view.pairs.length : '—'} displayed)</summary>
          <PairControls view={{...view, change: update => { view.change(update); setRosterOpen(false) }}} total={results?.pairs.length} />
          {results && pair ? (
            <div className="pair-detail">
              <PairTable pairs={view.pairs} selected={pair} onSelect={select} />
              <Analysis pair={pair} thresholds={thresholds} />
            </div>
          ) : results ? <EmptyPairs view={view}/> : (
            <p className="empty" role="status">
              {message}
            </p>
          )}
        </details>
      </div>
    </main>
  )
}
