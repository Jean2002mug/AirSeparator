import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Plane, X } from 'lucide-react'
import { inRange, type Aircraft } from './scenario'

interface Props {
  original?: Aircraft
  roster: Aircraft[]
  onSave: (aircraft: Aircraft) => void
  onClose: () => void
}

const numericFields = [
  { key: 'latitudeDegrees', label: 'Latitude (°)', min: -90, max: 90 },
  { key: 'longitudeDegrees', label: 'Longitude (°)', min: -180, max: 180 },
  { key: 'altitudeFeet', label: 'Altitude (ft)', min: -2000, max: 60000 },
] as const

export function AircraftForm({ original, roster, onSave, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [values, setValues] = useState({
    callSign: original?.callSign ?? '',
    latitudeDegrees: String(original?.latitudeDegrees ?? ''),
    longitudeDegrees: String(original?.longitudeDegrees ?? ''),
    altitudeFeet: String(original?.altitudeFeet ?? ''),
  })
  const [error, setError] = useState('')
  useEffect(() => {
    const node = dialog.current!
    node.showModal()
    return () => node.close()
  }, [])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!/^[A-Za-z0-9]{1,7}$/.test(values.callSign)) {
      setError('Enter a callsign with 1–7 letters (A–Z) or digits.')
      return
    }
    const callSign = values.callSign.toUpperCase()
    if (roster.some(p => p !== original && p.callSign === callSign)) {
      setError('This callsign already belongs to another aircraft.')
      return
    }
    for (const field of numericFields) {
      if (!inRange(values[field.key], field)) {
        setError(`${field.label} must be between ${field.min} and ${field.max}.`)
        return
      }
    }
    onSave({ callSign, latitudeDegrees: Number(values.latitudeDegrees),
      longitudeDegrees: Number(values.longitudeDegrees), altitudeFeet: Number(values.altitudeFeet) })
  }

  return <dialog ref={dialog} aria-labelledby="form-heading" onCancel={onClose}>
    <form onSubmit={submit}>
      <div className="panel-heading"><h2 id="form-heading"><Plane/> {original ? 'Edit aircraft' : 'Add aircraft'}</h2>
        <button type="button" className="icon-btn" aria-label="Close aircraft form" onClick={onClose}><X/></button></div>
      <div className="form-fields">
        <label>Callsign<input autoFocus required pattern="[A-Za-z0-9]{1,7}" maxLength={7}
          title="1–7 letters or digits" value={values.callSign}
          onChange={e => { setError(''); setValues({ ...values, callSign: e.target.value }) }}/></label>
        {numericFields.map(field => <label key={field.key}>{field.label}
          <input type="number" required step="any" min={field.min} max={field.max} value={values[field.key]}
            onChange={e => { setError(''); setValues({ ...values, [field.key]: e.target.value }) }}/>
          <small>{field.min} to {field.max}</small>
        </label>)}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <div className="form-actions"><button type="button" onClick={onClose}>Cancel</button>
        <button className="primary" type="submit">{original ? 'Save changes' : 'Add aircraft'}</button></div>
    </form>
  </dialog>
}
