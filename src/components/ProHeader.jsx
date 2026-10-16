import { isPro } from '../side.js'
import { useNavigate } from 'react-router-dom'
import { BackButton, TabHeader, TopBar } from './Chrome.jsx'

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
 * NAMO Desk's header (`/desk`; Namo Consult until 16 Oct 2026). The Online
 * pill that sat here is the page's big Go live button now (Rahul).
 */
export function DeskHeader() {
  const navigate = useNavigate()
  return (
    <header className="topbar flex h-11 items-center gap-3 px-4">
      <BackButton onClick={() => navigate('/dashboard')} />
      <p className="label min-w-0 flex-1 truncate text-center font-bold !text-t1">NAMO Desk</p>
      <span className="w-9 flex-none" aria-hidden="true" />
    </header>
  )
}
