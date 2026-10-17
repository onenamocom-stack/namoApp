import { useEffect, useState } from 'react'
import { callAstro, housesFrom } from '../lib/astro.js'
import { ChartNorth } from './ChartSquare.jsx'
import { Loader } from './Cosmos.jsx'

/**
 * The client's kundli, for their consultant (17 Oct 2026, Rahul): opened
 * from a live chat or call, over it, with a ✕. The server answers only the
 * consultant of that session and only while it is live
 * (`GET /v1/astro/client-chart/`).
 */
export default function ClientKundli({ sessionId, onClose }) {
  const [res, setRes] = useState(null)

  useEffect(() => {
    let live = true
    callAstro('clientChart', { session: sessionId }).then((r) => live && setRes(r))
    return () => {
      live = false
    }
  }, [sessionId])

  const client = res?.client ?? null
  const houses = res?.ok ? housesFrom(res.data, res.time_known !== false) : null

  return (
    <div className="absolute inset-0 z-[60] flex flex-col bg-white text-t1">
      <header className="flex flex-none items-center gap-3 border-b border-stroke px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block caps t-heading">{client?.name ? `${client.name}’s kundli` : 'Kundli'}</span>
          {client && (
            <span className="mt-0.5 block truncate caps-sm t-faint">
              {[client.birth_date, client.birth_time ?? 'Time not known', client.birth_place].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-lead t-heading hover:bg-surface"
        >
          ✕
        </button>
      </header>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {res === null ? (
          <Loader label="Opening their kundli" className="py-10" />
        ) : res.ok ? (
          <div className="flex justify-center">
            <ChartNorth size={300} houses={houses} />
          </div>
        ) : (
          <p className="text-meta t-body">{res.reason}</p>
        )}
      </div>
    </div>
  )
}
