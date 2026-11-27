import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import logo from './assets/airseparator.svg'
import { AircraftPage } from './AircraftPage'
import { SimulationPage } from './SimulationPage'
import { ScenariosPage, type CatalogSelection } from './ScenariosPage'
import { ResultsPage } from './ResultsPage'
import { AboutPage } from './AboutPage'
import {
  calculationBody,
  maxTotalAircraft,
  inRange,
  pairId,
  type MarkerAircraft,
  type Scenario,
  type Config,
  type Results,
  type Thresholds,
} from './scenario'
import { useApi } from './useApi'
import { defaultFilter, visiblePairs, type PairFilter, type Card } from './pairView'
import { readSession, sessionKey } from './session'

const pages = ['Simulation', 'Aircraft', 'Scenarios', 'Results', 'About'] as const
type Page = (typeof pages)[number]
function currentPage(): Page {
  return pages.find((p) => '#' + p.toLowerCase() === window.location.hash) ?? 'Simulation'
}
function initialTheme() {
  try {
    const saved = localStorage.getItem('airseparator-theme')
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    /* Storage can be disabled. */
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
export default function App() {
  const [page, setPage] = useState(currentPage),
    [theme, setTheme] = useState(initialTheme)
  const [saved] = useState(readSession)
  const [sample, setSample] = useState(saved.sample)
  const [scenario, setScenario] = useState(saved.scenario),
    [user, setUser] = useState<MarkerAircraft[]>(saved.user)
  const [catalog, setCatalog] = useState(saved.catalog)
  const updateCatalog = (update: Partial<CatalogSelection>) => setCatalog(c => ({...c, ...update}))
  useEffect(() => {
    try { sessionStorage.setItem(sessionKey, JSON.stringify({name:sample.name, scenario, user, catalog})) }
    catch { /* Navigation still retains the in-memory workspace if storage is disabled. */ }
  }, [sample, scenario, user, catalog])
  const [filter, setFilter] = useState(defaultFilter)
  const [showRoster, setShowRoster] = useState(true)
  const aircraft = useMemo(() => [...scenario, ...user], [scenario, user])
  const [inputs, setInputs] = useState<Partial<Record<keyof Thresholds, string>>>({})
  const [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0)
  const settings = useApi<Config>('/api/config', undefined, true, attempt)
  const config = settings?.data
  const values = {
    horizontalNm: inputs.horizontalNm ?? String(config?.defaults.horizontalNm ?? ''),
    verticalFeet: inputs.verticalFeet ?? String(config?.defaults.verticalFeet ?? ''),
  }
  const thresholds = { horizontalNm: Number(values.horizontalNm), verticalFeet: Number(values.verticalFeet) }
  const validThresholds =
    !!config &&
    inRange(values.horizontalNm, config.limits.horizontalNm) &&
    inRange(values.verticalFeet, config.limits.verticalFeet)
  const limit = config?.limits.aircraft.max ?? maxTotalAircraft
  const validCount = aircraft.length >= (config?.limits.aircraft.min ?? 2) && aircraft.length <= limit
  const calc = useApi<Results>(
    '/api/conflicts',
    calculationBody(aircraft, thresholds),
    validThresholds && validCount,
    attempt,
  )
  const results = calc?.data
  const pairs = useMemo(() => visiblePairs(results?.pairs ?? [], filter), [results, filter])
  function changeFilter(update: Partial<PairFilter>) {
    setFilter(previous => ({ ...previous, ...update }))
    setShowRoster(false)
  }
  function chooseCard(card: Card) {
    setShowRoster(card === 'Aircraft')
    setFilter(previous => ({ ...previous,
      scope: card === 'Aircraft Pairs' ? 'nearby' : previous.scope,
      status: card === 'Warning Pairs' ? 'WARNING' : card === 'No-Warning Pairs' ? 'NO_WARNING' : 'any' }))
  }
  const view = { filter, change: changeFilter, pairs }
  const pair =
    pairs.find((p) => pairId(p) === selected) ?? pairs.find((p) => p.status === 'WARNING') ?? pairs[0]
  useEffect(() => {
    if (results && selected && !pairs.some(p => pairId(p) === selected)) setSelected('')
  }, [results, pairs, selected])
  const apiError = settings?.error || calc?.error
  const message = apiError
    ? 'Engine results unavailable.'
    : !config
      ? 'Connecting to the engine…'
      : !validCount
        ? 'Use ' + (config?.limits.aircraft.min ?? 2) + '–' + limit + ' aircraft to calculate separation.'
        : !validThresholds
          ? 'Enter thresholds within the displayed ranges.'
          : 'Calculating separation…'
  useEffect(() => {
    const change = () => {
      setPage(currentPage())
      setError('')
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  useEffect(() => {
    document.title = page + ' · AirSeparator'
  }, [page])
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('airseparator-theme', theme)
    } catch {
      /* Session theme still works. */
    }
  }, [theme])
  function load(s: Scenario) {
    const duplicate = user.find((p) => s.aircraft.some((a) => a.callSign === p.callSign))
    if (duplicate || user.length + s.aircraft.length > limit) {
      setError(
        duplicate
          ? 'Rename or remove your aircraft ' + duplicate.callSign + ' before loading this scenario.'
          : 'Loading ' + s.name + ' would give ' + s.aircraft.length + ' scenario + ' + user.length + ' user-added aircraft. The limit is ' + limit + '. Remove ' + (user.length + s.aircraft.length - limit) + ' aircraft to load it.',
      )
      return
    }
    setSample(s)
    updateCatalog({selected: s.name})
    setScenario(s.aircraft)
    setInputs({})
    setError('')
    setSelected('')
    window.location.hash = 'simulation'
  }
  const choose = (p: NonNullable<typeof pair>) => setSelected(pairId(p))
  return (
    <>
      <a
        className="skip"
        href="#page-content"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('page-content')?.focus()
        }}
      >
        Skip to content
      </a>
      <header>
        <div className="header-inner">
          <a className="brand" href="#simulation">
            <img src={logo} alt="" />
            <span>
              <b>AirSeparator</b>
              <small>Aircraft Separation Simulator</small>
            </span>
          </a>
          <nav aria-label="Main navigation">
            {pages.map((p) => (
              <a key={p} aria-current={p === page ? 'page' : undefined} href={'#' + p.toLowerCase()}>
                {p}
              </a>
            ))}
          </nav>
          <button
            className="theme-switch"
            aria-label={'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <Sun />
            <Moon />
          </button>
        </div>
      </header>
      <div id="page-content" tabIndex={-1}>
        {(error || apiError) && (
          <div role="alert" className="banner">
            {error || apiError}{' '}
            <button
              onClick={() => {
                setError('')
                if (apiError) setAttempt((n) => n + 1)
              }}
            >
              {apiError ? 'Retry' : 'Dismiss'}
            </button>
          </div>
        )}
        {page === 'Simulation' && (
          <SimulationPage
            aircraft={aircraft}
            scenario={sample}
            scenarioAircraft={scenario}
            view={view}
            showRoster={showRoster}
            onCard={chooseCard}
            load={load}
            results={results}
            pair={pair}
            select={choose}
            thresholds={thresholds}
            values={values}
            config={config}
            change={(key, v) => setInputs({ ...inputs, [key]: v })}
            message={message}
          />
        )}
        {page === 'Aircraft' && (
          <AircraftPage
            user={user}
            scenario={scenario}
            limit={limit}
            add={(rows, mode) => setUser(current => mode === 'replace' ? rows : [...current, ...rows])}
            replace={(old, p) => {
              const setter = user.includes(old) ? setUser : setScenario
              setter((list) => list.map((a) => (a === old ? p : a)))
            }}
            remove={(p) => {
              const setter = user.includes(p) ? setUser : setScenario
              setter((list) => list.filter((a) => a !== p))
            }}
          />
        )}
        {page === 'Scenarios' && <ScenariosPage catalog={catalog} change={updateCatalog} onLoad={load} />}
        {page === 'Results' && (
          <ResultsPage
            view={view}
            onCard={chooseCard}
            aircraft={aircraft}
            title={sample.name + ' (' + aircraft.length + ')'}
            results={results}
            pair={pair}
            select={choose}
            thresholds={thresholds}
            message={message}
          />
        )}
        {page === 'About' && <AboutPage />}
      </div>
    </>
  )
}
