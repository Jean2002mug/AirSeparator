import { useState, type FormEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { fields, validateAircraft, type Draft } from './aircraftInput'
import { maxUserAircraft, palette, type MarkerAircraft } from './scenario'
import { suggestedColor } from './airlines'

interface Props {
  mode: 'Add' | 'Edit'
  original?: MarkerAircraft
  roster: MarkerAircraft[]
  limit: number
  userCount: number
  onSave: (p: MarkerAircraft) => void
  onCancel?: () => void
}
function draftOf(p?: MarkerAircraft): Draft {
  return {
    callSign: p?.callSign ?? '',
    latitudeDegrees: String(p?.latitudeDegrees ?? ''),
    longitudeDegrees: String(p?.longitudeDegrees ?? ''),
    altitudeFeet: String(p?.altitudeFeet ?? ''),
    color: p?.color ?? palette[0],
  }
}
export function AircraftForm({ mode, original, roster, limit, userCount, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState(() => draftOf(original))
  const [manualColor, setManualColor] = useState(!!original)
  const [error, setError] = useState('')
  const edit = mode === 'Edit'
  function change(key: keyof Draft, value: string) {
    if (key === 'color') setManualColor(true)
    setDraft({ ...draft, [key]: value, ...(key === 'callSign' && !manualColor ? { color: suggestedColor(value) } : {}) })
    setError('')
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    try {
      if (!edit && userCount >= maxUserAircraft)
        throw Error('You have reached the limit of ' + maxUserAircraft + ' user-added aircraft. Remove an aircraft before adding another.')
      if (!edit && roster.length >= limit)
        throw Error('A calculation supports at most ' + limit + ' aircraft.')
      const p = validateAircraft(draft, new Set(roster.filter((a) => a !== original).map((a) => a.callSign)))
      onSave(p)
      setError('')
      if (!edit) { setDraft(draftOf()); setManualColor(false) }
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <form className="panel aircraft-form" aria-label={mode + ' Aircraft'} onSubmit={submit}>
      <h2>{mode} Aircraft</h2>
      <fieldset disabled={edit && !original}>
        <div className="form-grid">
          <label>
            Callsign <em>*</em>
            <input
              required
              autoCapitalize="characters"
              value={draft.callSign}
              placeholder="e.g., AAL101"
              onChange={(e) => change('callSign', e.target.value)}
            />
          </label>
          {fields.map((f) => (
            <label key={f.key}>
              {f.label} <em>*</em>
              <input
                type="number"
                required
                step="any"
                min={f.min}
                max={f.max}
                value={draft[f.key]}
                placeholder={'e.g., ' + f.example}
                onChange={(e) => change(f.key, e.target.value)}
              />
            </label>
          ))}
          <label>
            Color (map)
            <span className="color-control">
              <i className="swatch" style={{ background: draft.color }} />
              <ChevronDown />
              <input type="color" value={draft.color} onChange={(e) => change('color', e.target.value)} />
            </span>
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button
            type="button"
            onClick={() => {
              setDraft(draftOf(original))
              setManualColor(!!original)
              setError('')
              if (edit) onCancel?.()
            }}
          >
            {edit ? 'Cancel' : 'Clear'}
          </button>
          <button className="primary">{edit ? 'Save Changes' : 'Add Aircraft'}</button>
        </div>
      </fieldset>
      {edit && !original && <p className="note">Select Edit beside an aircraft to change it.</p>}
    </form>
  )
}
