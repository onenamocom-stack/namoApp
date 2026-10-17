import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { browse } from '../lib/market.js'
import { useStore } from '../store.jsx'
import Icon from './Icon.jsx'
import { ListingCard, MarketSection } from './MarketCard.jsx'

/**
 * A seller's Shop on their profile (15 Oct 2026, Rahul: "pro and creator
 * profile me product dalne ka provision"): what they sell on the Market,
 * approved only. On your own page, the way to add and manage listings.
 */
export function useSellerListings(sellerId) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!sellerId) return undefined
    let live = true
    browse({ seller: sellerId })
      .then((r) => live && setRows(r))
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [sellerId])
  return rows
}

export default function SellerShop({ rows, own = false }) {
  const navigate = useNavigate()
  const { t } = useStore()
  const open = (row) =>
    navigate(row.kind === 'product' && row.product_id ? `/shop/p/${row.product_id}` : `/shop/l/${row.id}`)
  return (
    <div className="pb-4">
      {own && (
        <div className="px-4 pt-4">
          <button type="button" onClick={() => navigate('/studio/market')}
            className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-gold-fill px-4 py-3 text-left">
            <span className="gold"><Icon name="plus" size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-meta font-semibold t-heading">Add a listing</span>
              <span className="block text-micro t-faint">Downloads, courses, events and products. Manage and see earnings.</span>
            </span>
          </button>
        </div>
      )}
      {rows === null ? null : rows.length === 0 ? (
        <p className="px-6 py-10 text-center text-meta t-faint">
          {own ? 'Nothing on sale yet. What you list shows here once it is approved.' : 'Nothing for sale yet.'}
        </p>
      ) : (
        <MarketSection title={own ? 'On sale now' : 'For sale'}>
          {rows.map((row) => (
            <ListingCard key={row.id} row={row} free={t('ac.free')} onOpen={() => open(row)} />
          ))}
        </MarketSection>
      )}
    </div>
  )
}
