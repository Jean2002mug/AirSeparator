import { useLayoutEffect, useRef, useState } from 'react'
import { Plane, Plus, Upload } from 'lucide-react'
import { AircraftForm } from './AircraftForm'
import { importCsv, type ImportMode } from './aircraftInput'
import { airlineFor } from './airlines'
import { formatNumber, type MarkerAircraft } from './scenario'

function AirlineCell({ callSign }: { callSign: string }) {
  const airline = airlineFor(callSign)
  const [failed, setFailed] = useState(false)
  return <span className="airline-cell">
    {airline && !failed
      ? <img src={'/airlines/' + airline.code.toLowerCase() + '.svg'} alt={airline.name} title={airline.name} onError={() => setFailed(true)} />
      : <><Plane aria-hidden="true" /><span>{airline?.name ?? 'Unknown'}</span></>}
  </span>
}

export function AircraftTable({
  rows,
  edit,
  remove,
}: {
  rows: MarkerAircraft[]
  edit?: (p: MarkerAircraft) => void
  remove?: (p: MarkerAircraft) => void
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Callsign</th>
            <th>Airline</th>
            <th>Latitude (°)</th>
            <th>Longitude (°)</th>
            <th>Altitude (ft)</th>
            <th>Color</th>
            {edit && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.callSign}>
              <th scope="row">{p.callSign}</th>
              <td><AirlineCell callSign={p.callSign} /></td>
              <td>{p.latitudeDegrees.toFixed(4)}</td>
              <td>{p.longitudeDegrees.toFixed(4)}</td>
              <td>{formatNumber(p.altitudeFeet)}</td>
              <td>
                <i className="swatch" aria-label={p.color} style={{ background: p.color }} />
              </td>
              {edit && (
                <td>
                  <button className="link" aria-label={'Edit ' + p.callSign} onClick={() => edit(p)}>
                    Edit
                  </button>
                  <span className="divider">|</span>
                  <button
                    className="link danger"
                    aria-label={'Remove ' + p.callSign}
                    onClick={() => remove?.(p)}
                  >
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="empty">No aircraft in this list.</p>}
    </div>
  )
}
interface Props {
  user: MarkerAircraft[]
  scenario: MarkerAircraft[]
  limit: number
  add: (p: MarkerAircraft[], mode?: ImportMode) => void
  replace: (original: MarkerAircraft, p: MarkerAircraft) => void
  remove: (p: MarkerAircraft) => void
}
export function AircraftPage({ user, scenario, limit, add, replace, remove }: Props) {
  const [tab, setTab] = useState<'user' | 'scenario'>(user.length ? 'user' : 'scenario')
  const [editing, setEditing] = useState<MarkerAircraft | undefined>(user[0] ?? scenario[0])
  const [notice, setNotice] = useState(''),
    [error, setError] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [mode, setMode] = useState<ImportMode>('merge')
  const [file, setFile] = useState<File>()
  const [busy, setBusy] = useState(false)
  const csvFile = useRef<HTMLInputElement>(null)
  const roster = [...scenario, ...user]
  const latest = useRef({ scenario, user, limit, add })
  useLayoutEffect(() => {
    latest.current = { scenario, user, limit, add }
  })
  async function readFile() {
    if (!file || busy) return
    const input = csvFile.current
    setBusy(true)
    try {
      if (file.size > 128 * 1024) throw Error('Choose a CSV file smaller than 128 KiB.')
      const text = await file.text()
      if (!input || csvFile.current !== input || input.files?.[0] !== file) return
      const current = latest.current
      const imported = importCsv(text, current.scenario, current.user, mode, current.limit)
      current.add(imported, mode)
      setTab('user')
      setEditing(imported[0])
      setError('')
      setNotice('Imported ' + imported.length + ' aircraft.')
      setFile(undefined)
      input.value = ''
      setMode('merge')
    } catch (e) {
      setNotice('')
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  function choose(group: typeof tab) {
    setTab(group)
    setEditing((group === 'user' ? user : scenario)[0])
  }
  return (
    <main className="page aircraft-page">
      <h1 className="sr-only">Aircraft</h1>
      <div className="toolbar">
        <button
          className="primary"
          onClick={() =>
            document.querySelector<HTMLInputElement>('form[aria-label="Add Aircraft"] input')?.focus()
          }
        >
          <Plus />
          Add Aircraft
        </button>
        <button onClick={() => { setImportOpen(!importOpen); setFile(undefined); setMode('merge') }} aria-expanded={importOpen} disabled={busy}>
          <Upload />
          Import from File (CSV)
        </button>
      </div>
      {importOpen && (
        <div className="panel import-panel">
          <label>
            Import aircraft CSV
            <input
              ref={csvFile}
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => { setFile(e.target.files?.[0]); setError(''); setNotice('') }}
            />
          </label>
          <p className="note">
            Use callsign, latitude, longitude and altitude in feet. Color (#RRGGBB) is optional.
          </p>
          <div className="import-actions">
            <label>Import mode
              <select value={mode} disabled={busy} onChange={e => { setMode(e.target.value as ImportMode); setError('') }}>
                <option value="merge">Merge</option><option value="replace">Replace User-Added</option>
              </select>
            </label>
            <button className="primary" disabled={!file || busy} onClick={() => void readFile()}>
              {mode === 'replace' ? 'Replace User-Added' : 'Import CSV'}
            </button>
          </div>
          {mode === 'replace' && <p className="note">Importing will replace all {user.length} user-added aircraft and keep {scenario.length} scenario aircraft.</p>}
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <section className="panel">
        <h2>Aircraft List</h2>
        <div className="tabs" aria-label="Aircraft source">
          <button aria-pressed={tab === 'user'} onClick={() => choose('user')}>
            User Added ({user.length})
          </button>
          <button aria-pressed={tab === 'scenario'} onClick={() => choose('scenario')}>
            Scenario Aircraft ({scenario.length})
          </button>
        </div>
        <AircraftTable
          rows={tab === 'user' ? user : scenario}
          edit={(p) => {
            setEditing(p)
            document.getElementById('edit-panel')?.scrollIntoView({ block: 'nearest' })
          }}
          remove={(p) => {
            remove(p)
            if (editing === p) setEditing(undefined)
            setNotice('Removed ' + p.callSign + '.')
            setError('')
          }}
        />
      </section>
      <div className="form-pair">
        <AircraftForm
          mode="Add"
          roster={roster}
          limit={limit}
          onSave={(p) => {
            add([p])
            setTab('user')
            setEditing(p)
            setNotice('Added ' + p.callSign + '.')
            setError('')
          }}
        />
        <div id="edit-panel">
          <AircraftForm
            key={editing?.callSign ?? 'none'}
            mode="Edit"
            original={editing}
            roster={roster}
            limit={limit}
            onSave={(p) => {
              if (editing) replace(editing, p)
              setEditing(p)
              setNotice('Saved ' + p.callSign + '.')
              setError('')
            }}
            onCancel={() => setEditing(undefined)}
          />
        </div>
      </div>
    </main>
  )
}
