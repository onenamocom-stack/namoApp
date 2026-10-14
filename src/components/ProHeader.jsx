import { isPro } from '../side.js'
import { useNavigate } from 'react-router-dom'
import { BackButton, TabHeader, TopBar } from './Chrome.jsx'
import PresenceToggle from './PresenceToggle.jsx'

/**
 * The header of a consultant screen. In the pro app it is a tab, with the
 * online switch and the chat bubble; in the main app's Dashboard (Phase 16)
 * it is a drill-in with a way back to the Dashboard.
 */
export default function ProHeader({ title }) {
  if (isPro) return <TabHeader />
  return <TopBar title={title} back backTo="/dashboard" />
}

/**
 * Namo Consult's header (`/desk`, Phase 16): its name, and the online
 * switch, which is the reason the screen exists.
 */
export function DeskHeader() {
  const navigate = useNavigate()
  // Not TopBar: its 72px sides clip the Online pill.
  return (
    <header className="topbar flex h-11 items-center gap-3 px-4">
      <BackButton onClick={() => navigate('/dashboard')} />
      <p className="label min-w-0 flex-1 truncate font-bold !text-t1">Namo Consult</p>
      <PresenceToggle />
    </header>
  )
}
