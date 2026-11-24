import { useState } from 'react'
import {
  BookOpen,
  Check,
  ClipboardList,
  Database,
  FileText,
  Info,
  ListChecks,
  ShieldCheck,
} from 'lucide-react'
import logo from './assets/airseparator.svg'
const sections = [
  {
    title: 'Overview',
    icon: Info,
    heading: 'About AirSeparator',
    intro:
      'AirSeparator evaluates aircraft positions and analyzes horizontal and vertical separation to identify potential conflicts.',
    sub: 'Key Capabilities',
    items: [
      'Load and simulate predefined scenarios',
      'Add, edit, import, and remove aircraft',
      'Analyze separation for every aircraft pair',
      'Identify warning and no-warning pairs',
      'Explore explanations of engine results',
    ],
  },
  {
    title: 'How It Works',
    icon: ClipboardList,
    heading: 'How It Works',
    intro: 'Each calculation uses a snapshot of the aircraft in your simulation.',
    sub: 'From positions to results',
    items: [
      'Choose a scenario or enter aircraft coordinates and altitudes.',
      'The C++ engine evaluates every unique pair.',
      'The map and results update after each valid change.',
    ],
  },
  {
    title: 'Separation Rules',
    icon: ListChecks,
    heading: 'Separation Rules',
    intro: 'A warning requires both distances to be strictly below their configured thresholds.',
    sub: 'Thresholds',
    items: [
      'Horizontal: 5 NM by default, adjustable from 0.5 to 20 NM.',
      'Vertical: 1,000 ft by default, adjustable from 100 to 5,000 ft.',
      'Equality on either threshold produces No Warning. Displayed distances may be rounded.',
    ],
  },
  {
    title: 'Data & Assumptions',
    icon: Database,
    heading: 'Data & Assumptions',
    intro: 'All aircraft positions are simulated. Each scenario represents one instant in time.',
    sub: 'Calculation model',
    items: [
      'Positions use latitude and longitude in decimal degrees.',
      'Horizontal separation uses Haversine distance on a sphere of radius 3,440.065 NM.',
      'Vertical separation is the absolute difference in altitude in feet.',
      'Map tiles are supplied by OpenStreetMap.',
    ],
  },
  {
    title: 'User Guide',
    icon: BookOpen,
    heading: 'User Guide',
    intro: 'Start on Simulation to see a sample calculation, then explore your own aircraft.',
    sub: 'Working with a scenario',
    items: [
      'Preview and load examples on Scenarios. User-added aircraft stay in the roster.',
      'On Aircraft, enter a unique callsign, position, altitude, and map color, or import a CSV.',
      'Use 2–20 aircraft to calculate results. Expand Separation thresholds to adjust the limits.',
      'Choose a pair to inspect its distances and status on Simulation or Results.',
    ],
  },
  {
    title: 'Terms of Service',
    icon: FileText,
    heading: 'Terms of Service',
    intro: 'AirSeparator is an educational simulator, not a certified air traffic control tool.',
    sub: 'Intended use',
    items: [
      'Use simulated data for classroom exercises, demonstrations, and software testing.',
      'Use certified systems and procedures for real flight operations.',
      'No Warning describes only this static threshold check; it cannot establish flight safety.',
    ],
  },
]
export function AboutPage() {
  const [index, setIndex] = useState(0),
    s = sections[index]
  return (
    <main className="page aside-layout about-page">
      <aside className="panel side-nav" aria-label="About topics">
        {sections.map((item, i) => (
          <button key={item.title} aria-pressed={index === i} onClick={() => setIndex(i)}>
            <item.icon />
            {item.title}
          </button>
        ))}
      </aside>
      <article>
        <h1>{s.heading}</h1>
        <div className="intro">
          <p>{s.intro}</p>
          <img src={logo} alt="" />
        </div>
        <section className={'panel capabilities' + (index === 0 ? ' overview-list' : '')}>
          <h2>
            <ShieldCheck />
            {s.sub}
          </h2>
          <ul>
            {s.items.map((item) => (
              <li key={item}>
                <Check />
                {item}
              </li>
            ))}
          </ul>
        </section>
        {index === 0 && (
          <>
            <dl className="overview-facts">
              <dt>Key Capabilities</dt>
              <dd>
                Load scenarios, manage aircraft, and inspect separation distances and warnings for every pair.
              </dd>
              <dt>Intended Use</dt>
              <dd>AirSeparator is an educational simulator, not a certified air traffic control tool.</dd>
            </dl>
            <section className="intended">
              <strong>Intended Use</strong>
              <p>AirSeparator is an educational simulator, not a certified air traffic control tool.</p>
            </section>
          </>
        )}
      </article>
    </main>
  )
}
