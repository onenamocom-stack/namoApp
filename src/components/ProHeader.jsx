import { isPro } from '../side.js'
import { TabHeader, TopBar } from './Chrome.jsx'

/**
 * The header of a consultant screen. In the pro app it is a tab, with the
 * online switch and the chat bubble; in the main app's Dashboard (Phase 16)
 * it is a drill-in with a way back to the Dashboard.
 */
export default function ProHeader({ title }) {
  if (isPro) return <TabHeader />
  return <TopBar title={title} back backTo="/dashboard" />
}
