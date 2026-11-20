import { useState } from 'react'
import { Activity, ArrowLeftRight, ArrowUpDown, ChevronDown, CircleCheck, FlagTriangleRight,
  GitCompareArrows, Layers3, List, Pencil, Plane, Plus, Radar, SlidersHorizontal,
  Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { AircraftForm } from './AircraftForm'
import { AirspaceMap } from './AirspaceMap'
import { formatNumber, inRange, samples, type Aircraft, type Config, type Results, type Thresholds } from './scenario'
import { useApi } from './useApi'

const axes = [
  { key: 'horizontalNm', name: 'Horizontal', unit: 'NM', Icon: ArrowLeftRight },
  { key: 'verticalFeet', name: 'Vertical', unit: 'ft', Icon: ArrowUpDown },
] as const

export default function App() {
  const [aircraft, setAircraft] = useState<Aircraft[]>(samples[0].aircraft)
  const [sample, setSample] = useState('0')
  const [editing, setEditing] = useState<Aircraft | 'new' | null>(null)
  const [inputs, setInputs] = useState<Partial<Record<keyof Thresholds, string>>>({})
  const [attempt, setAttempt] = useState(0)
  const settings = useApi<Config>('/api/config', undefined, true, attempt)
  const config = settings?.data
  const thresholdText = (key: keyof Thresholds) => inputs[key] ?? String(config?.defaults[key] ?? '')
  const thresholds = { horizontalNm: Number(thresholdText('horizontalNm')), verticalFeet: Number(thresholdText('verticalFeet')) }
  const validThresholds = !!config && axes.every(({ key }) => inRange(thresholdText(key), config.limits[key]))
  const validCount = !!config && aircraft.length >= config.limits.aircraft.min && aircraft.length <= config.limits.aircraft.max
  const calculation = useApi<Results>('/api/conflicts', JSON.stringify({ aircraft, thresholds }), validThresholds && validCount, attempt)
  const incompatible = calculation?.data?.pairs.some(p => p.status !== 'WARNING' && p.status !== 'NO_WARNING')
  const results = incompatible ? undefined : calculation?.data
  const error = settings?.error || calculation?.error || (incompatible ? 'The API returned an older status. Rebuild and restart the Sprint 2 server.' : '')
  const pending = !settings || (validThresholds && validCount && !calculation)

  function loadSample(index: string) {
    setSample(index)
    setAircraft(samples[Number(index)].aircraft)
    setInputs({})
  }
  function savePlane(plane: Aircraft) {
    setAircraft(editing === 'new' ? [...aircraft, plane] : aircraft.map(p => p === editing ? plane : p))
    setEditing(null)
    setSample('custom')
  }

  return <>
    <header className="topbar"><div className="topbar-inner">
      <a className="brand" href="#workspace"><span className="brand-icon"><Radar/></span>Air<span>Separator</span></a>
      <nav aria-label="Main navigation"><a href="#workspace">Workspace</a><a href="#results">Pair results</a></nav>
      <div className="connection" role="status"><i className={'dot ' + (error ? 'amber' : config ? 'green' : '')}/>
        {error ? 'Engine issue' : config ? 'Engine connected' : 'Connecting'}</div>
    </div></header>
    <main id="workspace">
      <div className="workspace-heading"><div><h1>Simulation workspace</h1><p>Static aircraft separation analysis</p></div>
        <label className="scenario-select"><span>Sample scenario</span>
          <span className="select-shell"><Layers3/><select value={sample} onChange={e => loadSample(e.target.value)}>
            {sample === 'custom' && <option value="custom" disabled>Custom scenario</option>}
            {samples.map((s, i) => <option key={s.name} value={i}>{s.name} · {s.description}</option>)}
          </select><ChevronDown/></span>
        </label>
      </div>
      {error && <div className="error-banner" role="alert"><TriangleAlert/><span>{error}</span>
        <button onClick={() => setAttempt(n => n + 1)}>Retry</button></div>}
      <section className="metrics" aria-label="Scenario summary">
        {[
          { label: 'Aircraft', count: aircraft.length, Icon: Plane },
          { label: 'Pairs evaluated', count: results?.pairs.length, Icon: GitCompareArrows },
          { label: 'Warning pairs', count: results?.warningCount, Icon: TriangleAlert },
          { label: 'No-warning pairs', count: results && results.pairs.length - results.warningCount, Icon: CircleCheck },
        ].map(({ label, count, Icon }) => <div className={'metric' + (label === 'Warning pairs' && count ? ' warn' : '')} key={label}>
          <div><span>{label}</span><strong>{count ?? '—'}</strong></div><Icon/></div>)}
      </section>
      <div className="workspace-grid">
        <AirspaceMap aircraft={aircraft} results={results}/>
        <div className="sidebar">
          <section className="panel">
            <div className="panel-heading"><h2><Plane/>Aircraft roster</h2>
              <button className="add-btn" disabled={aircraft.length >= (config?.limits.aircraft.max ?? 20)} onClick={() => setEditing('new')}><Plus/>Add aircraft</button></div>
            <ul className="roster">{aircraft.map(p => <li key={p.callSign}>
              <div className="plane-tile"><Plane/></div>
              <div className="plane-info"><strong>{p.callSign}</strong><span>{formatNumber(p.altitudeFeet)} ft</span>
                <small>{formatNumber(p.latitudeDegrees, 4)}°, {formatNumber(p.longitudeDegrees, 4)}°</small></div>
              <div className="row-actions"><button className="icon-btn" title={'Edit ' + p.callSign} aria-label={'Edit ' + p.callSign} onClick={() => setEditing(p)}><Pencil/></button>
                <button className="icon-btn remove" title={'Remove ' + p.callSign} aria-label={'Remove ' + p.callSign}
                  onClick={() => { setAircraft(aircraft.filter(other => other !== p)); setSample('custom') }}><Trash2/></button></div>
            </li>)}</ul>
            {aircraft.length === 0 && <p className="empty">Add aircraft or choose a sample scenario.</p>}
          </section>
          <section className="panel thresholds"><div className="panel-heading"><h2><SlidersHorizontal/>Separation thresholds</h2></div>
            <div className="threshold-fields">{axes.map(({ key, name, unit, Icon }) => {
              const range = config?.limits[key]
              const invalid = !!range && !inRange(thresholdText(key), range)
              return <label key={key}><span><Icon/>{name}</span><span className={'number-box' + (invalid ? ' invalid' : '')}>
                <input type="number" step="any" min={range?.min} max={range?.max} value={thresholdText(key)} disabled={!config}
                  aria-label={name + ' threshold in ' + unit} aria-invalid={invalid} required
                  onChange={e => { setInputs({ ...inputs, [key]: e.target.value }); setSample('custom') }}/><b>{unit}</b></span>
                <small>{range ? `${formatNumber(range.min)}–${formatNumber(range.max)} ${unit}` : 'Loading limits…'}</small></label>
            })}</div>
          </section>
        </div>
      </div>
      <section id="results" className="panel results" aria-labelledby="results-heading">
        <div className="panel-heading"><h2 id="results-heading"><List/>Pairwise separation</h2>
          <span className="quiet-label"><Activity/>{results ? 'Analysis complete' : error ? 'Analysis unavailable' : pending ? 'Calculating…' : 'Awaiting input'}</span></div>
        {results ? <div className="table-scroll"><table><thead><tr><th>Aircraft pair</th><th>Horizontal</th><th>Vertical</th><th>Status</th></tr></thead>
          <tbody>{results.pairs.map(p => <tr key={p.callSignA + '/' + p.callSignB}>
            <td><strong>{p.callSignA}</strong><ArrowLeftRight/><strong>{p.callSignB}</strong></td>
            <td>{formatNumber(p.horizontalNm)} <small>NM</small></td><td>{formatNumber(p.verticalFeet)} <small>ft</small></td>
            <td><span className={'chip ' + (p.status === 'WARNING' ? 'warn' : '')}>{p.status === 'WARNING' ? <FlagTriangleRight/> : <span className="dot"/>}{p.status}</span></td>
          </tr>)}</tbody></table></div> : <p className="empty" role="status">
          {error ? 'Results unavailable.' : !config ? 'Connecting to the separation engine…' : !validCount ? 'Add at least two aircraft to evaluate separation.' :
            !validThresholds ? 'Enter thresholds within the ranges shown.' : 'Evaluating aircraft pairs…'}</p>}
      </section>
      <section className="assistant panel"><span className="assistant-icon"><Sparkles/></span>
        <div><h2>AI Explanation Assistant</h2><p>Educational explanations are planned for Sprint 4.</p></div><span className="sprint-tag">Sprint 4</span></section>
    </main>
    {editing && <AircraftForm original={editing === 'new' ? undefined : editing} roster={aircraft} onSave={savePlane} onClose={() => setEditing(null)}/>}
  </>
}
