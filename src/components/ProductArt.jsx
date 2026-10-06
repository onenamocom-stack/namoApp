import { useState } from 'react'
import Plate from './Plate.jsx'

/**
 * A product's picture on a card: its cover photo when the console has one,
 * the engraved plate when it does not or the photo fails to load (6 Oct
 * 2026 — the cards drew the plate for every product, real photo or not).
 * Children are the badges laid over it, as on Plate.
 */
export default function ProductArt({ product, className = '', children }) {
  const [broken, setBroken] = useState(false)
  if (!product.image || broken) {
    return (
      <Plate seed={product.id} className={className}>
        {children}
      </Plate>
    )
  }
  return (
    <div className={`relative overflow-hidden bg-white ${className}`}>
      <img
        src={product.image}
        alt={product.name}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {children}
    </div>
  )
}
