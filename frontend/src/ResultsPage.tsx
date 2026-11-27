import { useState } from 'react'
import { Activity, List, MessageSquareText, Plane } from 'lucide-react'
import { AircraftTable } from './AircraftPage'
import { EmptyPairs, Interpretation, Metrics, PairControls, PairTable } from './PairResults'
import { cardFor, type Card, type PairView } from './pairView'
import { formatMeasurement, type MarkerAircraft, type Pair, type Results, type Thresholds } from './scenario'

const views = [
  { name: 'Pairwise Results', Icon: Activity },
  { name: 'Aircraft List', Icon: Plane },
  { name: 'Summary', Icon: List },
  { name: 'AI Interpretation', Icon: MessageSquareText },
]
interface Props {
  view: PairView
  onCard: (card: Card) => void
  aircraft: MarkerAircraft[]
  title: string
  results?: Results
  pair?: Pair
  select: (p: Pair) => void
  thresholds: Thresholds
  message: string
}
export function ResultsPage({ aircraft, title, results, pair, select, thresholds, message, view: pairView, onCard }: Props) {
  const [view, setView] = useState(views[0].name)
  return (
    <main className="page aside-layout results-page">
      <aside className="panel results-side">
        <h2>Results Actions</h2>
        <div className="side-nav">
          {views.map(({ name, Icon }) => (
            <button key={name} aria-pressed={view === name} onClick={() => setView(name)}>
              <Icon />
              {name}
            </button>
          ))}
        </div>
        <h3>Aircraft List</h3>
        <ul className="simple-list">
          {aircraft.map((p) => (
            <li key={p.callSign}>{p.callSign}</li>
          ))}
        </ul>
      </aside>
      <div className="results-body">
        <h1>
          {view === 'Pairwise Results' ? 'Pairwise Separation Results' : view} – {title}
        </h1>
        <Metrics count={aircraft.length} results={results}
          active={view === 'Aircraft List' ? 'Aircraft' : view === 'Pairwise Results' ? cardFor(pairView.filter.status) : undefined}
          onChoose={card => { onCard(card); setView(card === 'Aircraft' ? 'Aircraft List' : 'Pairwise Results') }} />
        {view === 'Pairwise Results' && <PairControls view={pairView} total={results?.pairs.length} />}
        {view === 'Aircraft List' ? (
          <AircraftTable rows={aircraft} />
        ) : !results ? (
          <p className="empty">{message}</p>
        ) : view === 'Pairwise Results' ? (
          <div className="results-split">
            {pair ? <PairTable pairs={pairView.pairs} selected={pair} onSelect={select} /> : <EmptyPairs view={pairView}/>}
            <Interpretation key={JSON.stringify([pair, thresholds, aircraft, title])} pair={pair} thresholds={thresholds} aircraft={aircraft} />
          </div>
        ) : view === 'Summary' ? (
          <section className="panel">
            <h2>Calculation Summary</h2>
            <p>
              {results.warningCount} of {results.pairs.length} pairs have both distances below the configured
              thresholds.
            </p>
            <dl>
              <dt>Horizontal threshold</dt>
              <dd>{formatMeasurement(thresholds.horizontalNm)} NM</dd>
              <dt>Vertical threshold</dt>
              <dd>{formatMeasurement(thresholds.verticalFeet)} ft</dd>
            </dl>
          </section>
        ) : (
          <Interpretation key={JSON.stringify([pair, thresholds, aircraft, title])} pair={pair} thresholds={thresholds} aircraft={aircraft} />
        )}
      </div>
    </main>
  )
}
