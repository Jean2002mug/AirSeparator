import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { calculationBody, samples, type Scenario, type Results } from './scenario'
import { Status } from './PairResults'
function Filter({
  name,
  all,
  values,
  value,
  onChange,
}: {
  name: string
  all: string
  values: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label>
      {name}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {values.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  )
}
export interface CatalogSelection { type: string; warning: string; region: string; selected: string }
export function ScenariosPage({ catalog, change, onLoad }: { catalog: CatalogSelection; change: (update: Partial<CatalogSelection>) => void; onLoad: (s: Scenario) => void }) {
  const { type, warning, region, selected } = catalog
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState(''),
    [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    Promise.all(
      samples.map(async (s) => {
        const r = await fetch('/api/conflicts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: calculationBody(s.aircraft),
          signal: controller.signal,
        })
        if (!r.ok) throw Error('Scenario status unavailable. Check the engine connection.')
        const result: Results = await r.json()
        return [s.name, result.warningCount] as const
      }),
    )
      .then((entries) => {
        if (!controller.signal.aborted) setCounts(Object.fromEntries(entries))
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Could not retrieve scenario warning statuses.')
      })
    return () => controller.abort()
  }, [retry])
  const visible = samples.filter(
    (s) =>
      (!type || s.type === type) &&
      (!region || s.region === region) &&
      (!warning ||
        (counts[s.name] !== undefined && (counts[s.name] > 0 ? 'Warning' : 'No Warning') === warning)),
  )
  const preview = visible.find((s) => s.name === selected) ?? visible[0]
  return (
    <main className="page scenarios-page">
      <h1 className="sr-only">Scenarios</h1>
      <div className="filters">
        <Filter
          name="Scenario Type"
          all="All Types"
          values={['Conflict', 'No Conflict', 'Mixed']}
          value={type}
          onChange={type => change({type})}
        />
        <Filter
          name="Warning Status"
          all="All"
          values={['Warning', 'No Warning']}
          value={warning}
          onChange={warning => change({warning})}
        />
        <Filter
          name="Region"
          all="All Regions"
          values={['Africa', 'Antarctica', 'Asia', 'Europe', 'North America', 'Oceania', 'South America']}
          value={region}
          onChange={region => change({region})}
        />
      </div>
      {error && (
        <p className="error" role="alert">
          {error} <button onClick={() => setRetry((r) => r + 1)}>Retry</button>
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {['Scenario Name', 'Type', 'Region', 'Aircraft', 'Warning Status'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.name} className={preview === s ? 'previewed' : ''} onClick={() => change({selected: s.name})}>
                <th scope="row"><button className="scenario-choice" aria-pressed={preview === s}
                  onClick={e => { e.stopPropagation(); change({selected: s.name}) }}>{s.name}</button></th>
                <td>{s.type}</td>
                <td>{s.region}</td>
                <td>{s.aircraft.length}</td>
                <td>{counts[s.name] === undefined ? '—' : <Status warning={counts[s.name] > 0} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && <p className="empty">No scenarios match these filters.</p>}
      </div>
      {preview && (
        <section className="panel preview">
          <h2>Scenario Preview</h2>
          <div>
            <h3>
              {preview.name} ({preview.aircraft.length})
            </h3>
            <p>{preview.description}</p>
            <div className="facts">
              <span>
                Type: <b>{preview.type}</b>
              </span>
              <span>
                Aircraft: <b>{preview.aircraft.length}</b>
              </span>
              <span>
                Region: <b>{preview.region}</b>
              </span>
            </div>
            <p className="note">
              {preview.aircraft.map((p) => p.callSign).join(' · ')} · Status at default thresholds
            </p>
          </div>
          <button className="primary" onClick={() => onLoad(preview)}>
            <Play />
            Load Scenario
          </button>
        </section>
      )}
    </main>
  )
}
