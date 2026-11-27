import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Crosshair, Plane } from 'lucide-react'
import { formatNumber, type MarkerAircraft, type Pair, type Results } from './scenario'
import { airlineFor } from './airlines'

// Choose the smallest longitude span, including when a pair straddles the antimeridian.
function positionsOf(aircraft: MarkerAircraft[]) {
  const longitudes = aircraft.map((p) => p.longitudeDegrees).sort((a, b) => a - b)
  let start = longitudes[0],
    widest = -1
  longitudes.forEach((lon, i) => {
    const next = longitudes[(i + 1) % longitudes.length]
    const gap = next - lon + (i === longitudes.length - 1 ? 360 : 0)
    if (gap > widest) {
      widest = gap
      start = next
    }
  })
  const offset = longitudes.length && aircraft[0].longitudeDegrees < start ? -360 : 0
  return aircraft.map((p) =>
    L.latLng(p.latitudeDegrees, p.longitudeDegrees + offset + (p.longitudeDegrees < start ? 360 : 0)),
  )
}
function fit(view: L.Map, points: L.LatLng[]) {
  const wide = view.getSize().x > 650
  if (points.length)
    view.fitBounds(L.latLngBounds(points), {
      paddingTopLeft: [wide ? 62 : 24, 44],
      paddingBottomRight: [wide ? 185 : 78, 50],
      maxZoom: 12,
      animate: false,
    })
}
function ticks(min: number, max: number, count: number) {
  const raw = (max - min) / count,
    power = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 5, 10].find((n) => n * power >= raw) ?? 10) * power
  const list: number[] = []
  if (step > 0 && Number.isFinite(step))
    for (let i = Math.ceil(min / step); i <= Math.floor(max / step); i++) list.push(i * step)
  return list
}
interface Tick {
  pos: number
  label: string
}
function detailContent(p: MarkerAircraft) {
  const content = document.createElement('div')
  content.className = 'marker-details'
  const name = document.createElement('strong')
  name.textContent = p.callSign
  content.append(name)
  const airline = airlineFor(p.callSign)
  for (const line of [airline?.name, 'Latitude ' + p.latitudeDegrees + '°', 'Longitude ' + p.longitudeDegrees + '°',
    'Altitude ' + formatNumber(p.altitudeFeet) + ' ft', 'Color ' + p.color]) {
    if (!line) continue
    const detail = document.createElement('div')
    detail.textContent = line
    content.append(detail)
  }
  return content
}
export function AirspaceMap({
  aircraft,
  scenarioAircraft, scenarioName,
  results,
  selected,
}: {
  aircraft: MarkerAircraft[]
  scenarioAircraft: MarkerAircraft[]
  scenarioName: string
  results?: Results
  selected?: Pair
}) {
  const box = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null)
  const [grid, setGrid] = useState<{ x: Tick[]; y: Tick[] }>({ x: [], y: [] })
  const [tileError, setTileError] = useState(false)
  const [height, setHeight] = useState(() => window.innerWidth > 620 ? 450 : 300)
  const [hover, setHover] = useState(true)
  const focusedScenario = useRef<string | undefined>(undefined)
  const points = useMemo(() => positionsOf(aircraft), [aircraft])
  const localPoints = useMemo(() => scenarioAircraft.length ? points.slice(0, scenarioAircraft.length) : points.slice(0, 1), [points, scenarioAircraft])
  useEffect(() => {
    const view = L.map(box.current!, {
      zoomControl: false,
      scrollWheelZoom: false,
      minZoom: 1,
      zoomSnap: 0.25,
    }).setView([45, -73], 8)
    map.current = view
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    })
      .on('tileerror', () => setTileError(true))
      .on('tileload', () => setTileError(false))
      .addTo(view)
    L.control.zoom({ position: 'bottomleft' }).addTo(view)
    function axes() {
      const b = view.getBounds(),
        mid = b.getCenter()
      const x = ticks(b.getWest(), b.getEast(), 7).map((lon) => ({
        pos: view.latLngToContainerPoint([mid.lat, lon]).x,
        label: formatNumber(L.Util.wrapNum(lon, [-180, 180]), 3) + '°',
      }))
      const y = ticks(b.getSouth(), b.getNorth(), 5).map((lat) => ({
        pos: view.latLngToContainerPoint([lat, mid.lng]).y,
        label: formatNumber(lat, 3) + '°',
      }))
      setGrid({ x, y })
    }
    view.on('moveend zoomend resize', axes)
    axes()
    const observer = new ResizeObserver(() => view.invalidateSize())
    observer.observe(box.current!)
    return () => {
      observer.disconnect()
      view.remove()
      map.current = null
    }
  }, [])
  useEffect(() => {
    if (!points.length) { focusedScenario.current = undefined; return }
    if (map.current && focusedScenario.current !== scenarioName) {
      fit(map.current, localPoints)
      focusedScenario.current = scenarioName
    }
  }, [localPoints, points, scenarioName])
  useEffect(() => {
    const view = map.current!,
      layer = L.layerGroup().addTo(view)
    for (const pair of results?.pairs ?? []) {
      const warning = pair.status === 'WARNING'
      if (!warning && pair !== selected) continue
      const a = aircraft.findIndex((p) => p.callSign === pair.callSignA),
        b = aircraft.findIndex((p) => p.callSign === pair.callSignB)
      if (a >= 0 && b >= 0)
        L.polyline([points[a], points[b]], {
          color: warning ? '#ff5545' : '#8bcaf6',
          dashArray: warning ? '5 6' : undefined,
          weight: 2.5,
          interactive: false,
        }).addTo(layer)
    }
    return () => { layer.remove() }
  }, [aircraft, points, results, selected])
  useEffect(() => {
    const view = map.current!, layer = L.layerGroup().addTo(view)
    const popup = L.popup({autoPan: false, closeButton: false, offset: [0, -12], className:'aircraft-popup'})
    let pinned: L.Marker | undefined
    const close = () => { pinned = undefined; view.closePopup(popup) }
    view.on('click', close)
    function escape(e: KeyboardEvent) { if (e.key === 'Escape') close() }
    view.getContainer().addEventListener('keydown', escape)
    const markers = aircraft.map((p, i) => {
      const jet = document.createElement('span')
      jet.textContent = '✈︎'
      jet.style.color = p.color
      const label = document.createElement('div')
      label.append(p.callSign)
      const altitude = document.createElement('small')
      altitude.textContent = formatNumber(p.altitudeFeet) + ' ft'
      label.append(altitude)
      const m = L.marker(points[i], {
        icon: L.divIcon({
          html: jet,
          className: 'aircraft-marker',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        alt: p.callSign,
      }).addTo(layer)
      const element = m.getElement()!
      element.setAttribute('aria-label', p.callSign + ', aircraft details')
      const show = () => popup.setLatLng(m.getLatLng()).setContent(detailContent(p)).openOn(view)
      const hideTransient = () => { if (!pinned) view.closePopup(popup) }
      if (hover) m.on('mouseover', () => { if (!pinned) show() }).on('mouseout', hideTransient)
      element.addEventListener('focus', () => {
        window.setTimeout(() => {
          if (!pinned && document.activeElement === element) show()
        }, 0)
      })
      element.addEventListener('blur', hideTransient)
      const toggle = () => { if (pinned === m) close(); else { pinned = m; show() } }
      m.on('click', toggle)
      element.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggle() }
      })
      return { m, label, color: p.color }
    })
    function placeLabels() {
      const occupied: L.Bounds[] = []
      for (const { m, label, color } of markers) {
        const pt = view.latLngToContainerPoint(m.getLatLng())
        const size = view.getSize()
        const available = L.bounds([24, 4], [size.x - 4, size.y - 28])
        const candidates = [0, 12, -12, 36, -36, 64, -64].flatMap((shift) =>
          (['right', 'left'] as const).map((direction) => {
            const left = pt.x + (direction === 'right' ? 17 : -100)
            const bounds = L.bounds([left, pt.y + shift - 19], [left + 83, pt.y + shift + 19])
            return { direction, shift, bounds }
          }),
        )
        const best =
          candidates.find(
            (c) => available.contains(c.bounds) && !occupied.some((b) => b.intersects(c.bounds)),
          ) ?? candidates[0]
        occupied.push(best.bounds)
        m.unbindTooltip().bindTooltip(label, {
          permanent: true,
          direction: best.direction,
          offset: [best.direction === 'right' ? 12 : -12, best.shift],
          className: 'map-tag',
          opacity: 1,
        })
        m.getTooltip()?.getElement()?.style.setProperty('--marker', color)
      }
    }
    placeLabels()
    view.on('zoomend moveend resize', placeLabels)
    return () => {
      view.off('zoomend moveend resize', placeLabels)
      view.off('click', close)
      view.getContainer().removeEventListener('keydown', escape)
      close()
      layer.remove()
    }
  }, [aircraft, points, hover])
  return (
    <section className="map-section" aria-label="Interactive airspace map">
    <div className="chart" style={{'--map-height': height + 'px'} as CSSProperties}>
      <div className="map" ref={box} aria-label="Map of simulated aircraft" />
      <div className="grid-overlay" aria-hidden="true">
        {grid.x.map((t) => (
          <i className="meridian" key={t.label + t.pos} style={{ left: t.pos }}>
            <span>{t.label}</span>
          </i>
        ))}
        {grid.y.map((t) => (
          <i className="parallel" key={t.label} style={{ top: t.pos }}>
            <span>{t.label}</span>
          </i>
        ))}
      </div>
      <span className="axis-lat">Latitude (°)</span>
      <span className="axis-lon">Longitude (°)</span>
      <details className="legend" open={window.innerWidth > 620}>
        <summary>Legend</summary>
        <div>
          <span>
            <Plane /> Aircraft
          </span>
          <span>
            <i className="line" /> Selected pair
          </span>
          <span>
            <i className="line dashed" /> Warning pair
          </span>
        </div>
      </details>
      <button
        className="fit"
        onClick={() => map.current && fit(map.current, points)}
        aria-label="Fit map to aircraft"
        title="Fit aircraft"
      >
        <Crosshair />
      </button>
      {tileError && <small className="tile-error">Some map tiles are unavailable.</small>}
    </div>
    <div className="map-tools">
      <label className="hover-option"><input type="checkbox" checked={hover} onChange={e => setHover(e.target.checked)} />Show aircraft details on hover</label>
      <label>Map height<input type="range" min={260} max={700} step={10} value={height} aria-valuetext={height + ' pixels'} onChange={e => setHeight(+e.target.value)} /></label>
      <label>Focus map<select aria-label="Focus map" value="" onChange={e => {
        const choice = e.target.value
        const target = choice === 'scenario' ? localPoints : choice === 'pair' ? points.filter((_,i) => [selected?.callSignA,selected?.callSignB].includes(aircraft[i].callSign)) :
          points.filter((_,i) => 'aircraft-' + aircraft[i].callSign === choice)
        if (map.current) fit(map.current, target)
      }}>
        <option value="">Choose focus…</option><option value="scenario" disabled={!localPoints.length}>Local group</option>
        <option value="pair" disabled={!selected}>Selected pair</option>
        {aircraft.map(p => <option value={'aircraft-' + p.callSign} key={p.callSign}>{p.callSign}</option>)}
      </select></label>
    </div>
    </section>
  )
}
