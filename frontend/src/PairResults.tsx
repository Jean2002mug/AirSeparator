import { useState } from 'react'
import { Check, TriangleAlert, MessageSquareText, Send } from 'lucide-react'
import { minNearbyNm, type Card, type PairView, type PairFilter } from './pairView'
import { formatMeasurement as fmt, pairId, calculationBody, type Aircraft, type Pair, type Results, type Thresholds } from './scenario'

export function Status({ warning }: { warning: boolean }) {
  return (
    <span className={'status ' + (warning ? 'warning' : 'no-warning')}>
      {warning ? <TriangleAlert /> : <Check />}
      {warning ? 'Warning' : 'No Warning'}
    </span>
  )
}
export function Metrics({ count, results, active, onChoose }: { count: number; results?: Results; active?: Card; onChoose: (card: Card) => void }) {
  const cards = [
    ['Aircraft', count],
    ['Aircraft Pairs', results?.pairs.length],
    ['Warning Pairs', results?.warningCount],
    ['No-Warning Pairs', results && results.pairs.length - results.warningCount],
  ] as const
  return (
    <div className="metrics" aria-label="Separation summary">
      {cards.map(([label, value]) => (
        <button type="button" key={label} className="metric" aria-pressed={active === label} onClick={() => onChoose(label)}>
          <span>{label}</span>
          <strong>{value ?? '—'}</strong>
        </button>
      ))}
    </div>
  )
}
export function PairControls({ view, total }: { view: PairView; total?: number }) {
  const { filter, change, pairs } = view
  const [draft, setDraft] = useState(String(filter.radius))
  const valid = draft.trim() !== '' && Number.isFinite(Number(draft)) && Number(draft) >= minNearbyNm
  return <div className="pair-controls">
    <div className="scope-switch" aria-label="Pair display">
      <button aria-pressed={filter.scope === 'nearby'} onClick={() => change({scope:'nearby'})}>Nearby</button>
      <button aria-pressed={filter.scope === 'all'} onClick={() => change({scope:'all'})}>All Pairs</button>
    </div>
    {filter.scope === 'nearby' && <label>Radius (NM)
      <input type="number" min={minNearbyNm} step="any" value={draft} aria-invalid={!valid} onChange={e => {
        const value = e.target.value
        setDraft(value)
        if (value.trim() && Number.isFinite(+value) && +value >= minNearbyNm) change({radius: +value})
      }} />
    </label>}
    <label>Status<select value={filter.status} onChange={e => change({status: e.target.value as PairFilter['status']})}>
      <option value="any">All statuses</option><option value="WARNING">Warning</option><option value="NO_WARNING">No Warning</option>
    </select></label>
    {total !== undefined && <span className="pair-count" role="status">{pairs.length} displayed · {total} evaluated</span>}
    {filter.scope === 'nearby' && !valid && <small className="error">Enter at least {minNearbyNm} NM. Using {filter.radius} NM.</small>}
  </div>
}
export function EmptyPairs({ view }: { view: PairView }) {
  const { scope, status, radius } = view.filter
  return <p className="empty" role="status">No {status === 'WARNING' ? 'warning ' : status === 'NO_WARNING' ? 'no-warning ' : ''}pairs
    {scope === 'nearby' ? ' within ' + radius + ' NM. Choose All Pairs or adjust the filters.' : ' match this filter.'}</p>
}
export function PairTable({
  pairs,
  selected,
  onSelect,
}: {
  pairs: Pair[]
  selected?: Pair
  onSelect: (p: Pair) => void
}) {
  return (
    <div className="table-wrap">
      <table className="pair-table">
        <thead>
          <tr>
            <th>Pair</th>
            <th>Horizontal (NM)</th>
            <th>Vertical (ft)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((p) => (
            <tr
              key={pairId(p)}
              className={(p.status === 'WARNING' ? 'warning-row ' : '') + (p === selected ? 'chosen' : '')}
            >
              <td>
                <button className="pair-choice" onClick={() => onSelect(p)} aria-pressed={p === selected}>
                  {p.callSignA} – {p.callSignB}
                </button>
              </td>
              <td>{fmt(p.horizontalNm)}</td>
              <td>{fmt(p.verticalFeet)}</td>
              <td>
                <Status warning={p.status === 'WARNING'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export function explanation(p: Pair, t: Thresholds) {
  if (p.status === 'WARNING')
    return (
      'Both the horizontal distance (' +
      fmt(p.horizontalNm) +
      ' NM) and vertical distance (' +
      fmt(p.verticalFeet) +
      ' ft) are below the configured thresholds.'
    )
  const outside = []
  if (p.horizontalNm >= t.horizontalNm) outside.push('horizontal distance (' + fmt(p.horizontalNm) + ' NM)')
  if (p.verticalFeet >= t.verticalFeet) outside.push('vertical distance (' + fmt(p.verticalFeet) + ' ft)')
  return (
    'The ' +
    outside.join(' and ') +
    (outside.length === 2 ? ' are' : ' is') +
    ' at or above the corresponding threshold.'
  )
}
export function Analysis({ pair, thresholds }: { pair: Pair; thresholds: Thresholds }) {
  return (
    <section className="analysis">
      <h3>
        Pair Analysis: {pair.callSignA} – {pair.callSignB}
      </h3>
      <p>{explanation(pair, thresholds)}</p>
      <dl>
        <dt>Distances</dt>
        <dd>
          {fmt(pair.horizontalNm)} NM horizontal · {fmt(pair.verticalFeet)} ft vertical
        </dd>
        <dt>Thresholds</dt>
        <dd>
          {fmt(thresholds.horizontalNm)} NM horizontal · {fmt(thresholds.verticalFeet)} ft vertical
        </dd>
        <dt>Status</dt>
        <dd>
          <Status warning={pair.status === 'WARNING'} />
        </dd>
      </dl>
    </section>
  )
}
export function explanationLabel(source: unknown) {
  switch (source) {
    case 'gemini': return 'Live AI (Gemini)'
    case 'mock':
    case 'fallback': return 'Response'
    case 'boundary': return 'Simulator scope'
    default: return 'Source unavailable'
  }
}

export function Interpretation({ pair, thresholds, aircraft }: { pair?: Pair; thresholds: Thresholds; aircraft: Aircraft[] }) {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<{question: string; text: string; label: string}[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function ask(text: string) {
    if (!pair || loading) return
    const selected = [pair.callSignA, pair.callSignB].map(name => aircraft.find(a => a.callSign === name))
    if (selected.some(a => !a)) return
    setLoading(true)
    setError('')
    try {
      const body = JSON.parse(calculationBody(selected as Aircraft[], thresholds))
      if (text) body.question = text
      if (text) body.context = messages.slice(-3).map(message => ({question: message.question, answer: message.text}))
      const response = await fetch('/api/ai/explain', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)})
      const data = await response.json()
      if (!response.ok) throw Error(data.error || 'AI explanation is unavailable.')
      const label = explanationLabel(data.source)
      setMessages(previous => [...previous, {question:text, text:data.explanation, label}].slice(-6))
      setQuestion('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI explanation is unavailable.')
    } finally { setLoading(false) }
  }
  return (
    <section className="panel interpretation">
      <h3>
        <MessageSquareText />
        AI Interpretation
      </h3>
      {pair && (
        <p>
          <strong>
            {pair.callSignA} – {pair.callSignB}
          </strong>
          <br />
          {explanation(pair, thresholds)} The limits are {fmt(thresholds.horizontalNm)} NM and{' '}
          {fmt(thresholds.verticalFeet)} ft.
        </p>
      )}
      <p className="note">Ask about aviation concepts, the warning rule or the selected pair. AI answers are educational and can make mistakes. The C++ engine determines the results.</p>
      <button type="button" disabled={!pair || loading} onClick={() => void ask('')}>Explain Pair</button>
      {messages.map((message, i) => <div className="ai-message" key={i}>
        {message.question && <p><strong>You</strong> {message.question}</p>}
        <p><strong>{message.label}</strong> {message.text}</p>
      </div>)}
      {loading && <p role="status">Generating explanation…</p>}
      {error && <p role="alert" className="error"><strong>AI unavailable</strong> {error}</p>}
      <form onSubmit={e => {e.preventDefault(); if (question.trim()) void ask(question.trim())}}>
        <fieldset disabled={!pair || loading}>
        <input aria-label="AI follow-up question" placeholder="Ask a follow-up question…" maxLength={500} value={question} onChange={e => setQuestion(e.target.value)} />
        <button aria-label="Send question" disabled={!question.trim()}>
          <Send />
        </button>
      </fieldset>
      </form>
    </section>
  )
}
