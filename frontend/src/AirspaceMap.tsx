import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Crosshair, Map as MapIcon } from 'lucide-react'
import { formatNumber, type Aircraft, type Results } from './scenario'

// Keep aircraft on either side of the antimeridian in the same map view.
function mapPositions(aircraft: Aircraft[]) {
  const longitudes = aircraft.map(p => p.longitudeDegrees).sort((a, b) => a - b)
  let start = longitudes[0]
  let widestGap = -1
  longitudes.forEach((lon, i) => {
    const next = longitudes[(i + 1) % longitudes.length]
    const gap = next - lon + (i === longitudes.length - 1 ? 360 : 0)
    if (gap > widestGap) { widestGap = gap; start = next }
  })
  return aircraft.map(p => L.latLng(p.latitudeDegrees, p.longitudeDegrees + (p.longitudeDegrees < start ? 360 : 0)))
}

function fit(map: L.Map, points: L.LatLng[]) {
  if (points.length) {
    map.fitBounds(L.latLngBounds(points), { paddingTopLeft: [35, 40], paddingBottomRight: [100, 45], maxZoom: 12 })
  }
}

export function AirspaceMap({ aircraft, results }: { aircraft: Aircraft[]; results?: Results }) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const [tilesMissing, setTilesMissing] = useState(false)
  const positions = useMemo(() => mapPositions(aircraft), [aircraft])

  useEffect(() => {
    const element = container.current!
    const view = L.map(element, { zoomControl: false, scrollWheelZoom: false, minZoom: 1 }).setView([37.7, -122.3], 10)
    map.current = view
    let tileLoaded = false
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).on('tileerror', () => { if (!tileLoaded) setTilesMissing(true) })
      .on('tileload', () => { tileLoaded = true; setTilesMissing(false) }).addTo(view)
    L.control.zoom({ position: 'topright' }).addTo(view)
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(view)
    const resize = new ResizeObserver(() => view.invalidateSize())
    resize.observe(element)
    return () => { resize.disconnect(); view.remove(); map.current = null }
  }, [])

  useEffect(() => { if (map.current) fit(map.current, positions) }, [positions])

  useEffect(() => {
    const view = map.current!
    const layer = L.layerGroup().addTo(view)
    const warnings = new Set<string>()
    for (const pair of results?.pairs ?? []) {
      if (pair.status !== 'WARNING') continue
      const a = aircraft.findIndex(p => p.callSign === pair.callSignA)
      const b = aircraft.findIndex(p => p.callSign === pair.callSignB)
      if (a < 0 || b < 0) continue
      warnings.add(pair.callSignA)
      warnings.add(pair.callSignB)
      L.polyline([positions[a], positions[b]], {
        color: '#F6B869', dashArray: '4 7', weight: 2, interactive: false,
      }).addTo(layer)
    }
    aircraft.forEach((plane, i) => {
      const warn = warnings.has(plane.callSign) ? ' is-warning' : ''
      const label = document.createElement('div')
      const altitude = document.createElement('small')
      altitude.textContent = formatNumber(plane.altitudeFeet) + ' ft'
      label.append(plane.callSign, altitude)
      const icon = L.divIcon({ html: '<span aria-hidden="true">✈</span>', className: 'aircraft-marker' + warn,
        iconSize: [28, 28], iconAnchor: [14, 14] })
      L.marker(positions[i], { icon, title: plane.callSign, alt: plane.callSign }).addTo(layer)
        .bindTooltip(label, { permanent: true, direction: 'right', offset: [13, 0], className: 'map-tag' + warn })
    })
    return () => { layer.remove() }
  }, [aircraft, positions, results])

  return <section className="panel map-panel" aria-labelledby="map-title">
    <div className="panel-heading"><h2 id="map-title"><MapIcon/>Airspace map</h2>
      <button className="quiet" onClick={() => map.current && fit(map.current, positions)}><Crosshair/>Fit aircraft</button></div>
    <div className="map-wrap"><div ref={container} className="map" aria-label="Map of simulated aircraft"/>
      {tilesMissing && <span className="tile-notice">Basemap unavailable · aircraft positions shown</span>}</div>
    <div className="map-key"><span><i className="dot blue"/>Aircraft</span>
      <span><i className="dash"/>Warning pair</span><span className="map-units">WGS 84 · degrees</span></div>
  </section>
}
