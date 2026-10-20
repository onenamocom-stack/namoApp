import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Adjust a new profile picture before it uploads (4 Oct 2026, owner's
 * request): drag to place it, slide to zoom, and the circle shows exactly
 * what will be kept. The result is a 640px square JPEG cut from the
 * original in the browser, so only the chosen part is ever uploaded.
 *
 * Also the status photo and a group's photo (21 Oct 2026, Rahul: "Can we
 * edit image here. To focus more or right left up down to set better in
 * this circle"), and two fingers pinch to zoom. `file` is a picked File;
 * `src` is a picture already on hand (a URL, or a data: URL), for
 * adjusting the one you have.
 */
const VIEW = 280 // the circle on screen, px
const OUT = 640 // the saved square, px

export default function AvatarCropper({ file, src, onCancel, onDone, title = 'Adjust your picture', saveLabel = 'Use photo' }) {
  const [img, setImg] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const drag = useRef(null)
  const touches = useRef(new Map()) // pointerId -> {x, y}
  const pinch = useRef(null) // {dist, zoom} when two fingers went down

  useEffect(() => {
    const url = file ? URL.createObjectURL(file) : src
    const image = new Image()
    // A remote picture has to come with CORS, or the canvas cannot read it.
    if (!file && !String(src).startsWith('data:')) image.crossOrigin = 'anonymous'
    image.onload = () => setImg(image)
    image.src = url
    return () => file && URL.revokeObjectURL(url)
  }, [file, src])

  // The image always covers the circle: its shorter side fills it at zoom 1.
  const base = img ? VIEW / Math.min(img.naturalWidth, img.naturalHeight) : 1
  const w = img ? img.naturalWidth * base * zoom : 0
  const h = img ? img.naturalHeight * base * zoom : 0
  const clamp = (p) => ({
    x: Math.min(0, Math.max(VIEW - w, p.x)),
    y: Math.min(0, Math.max(VIEW - h, p.y)),
  })

  // Start centred, and keep the image covering the circle as zoom changes.
  useEffect(() => {
    if (img) setPos((p) => (p.x === 0 && p.y === 0 && zoom === 1 ? clamp({ x: (VIEW - w) / 2, y: (VIEW - h) / 2 }) : clamp(p)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, zoom])

  const spread = () => {
    const [a, b] = [...touches.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function down(e) {
    e.currentTarget.setPointerCapture(e.pointerId)
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touches.current.size === 2) {
      drag.current = null
      pinch.current = { dist: spread(), zoom }
    } else {
      drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    }
  }
  function move(e) {
    if (!touches.current.has(e.pointerId)) return
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && touches.current.size === 2) {
      const next = (pinch.current.zoom * spread()) / (pinch.current.dist || 1)
      setZoom(Math.min(3, Math.max(1, next)))
      return
    }
    if (!drag.current) return
    setPos(clamp({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }))
  }
  function up(e) {
    touches.current.delete(e.pointerId)
    pinch.current = null
    // The finger still down carries on dragging from where it is.
    const [rest] = [...touches.current.values()]
    drag.current = rest ? { x: rest.x - pos.x, y: rest.y - pos.y } : null
  }

  function save() {
    const canvas = document.createElement('canvas')
    canvas.width = OUT
    canvas.height = OUT
    const scale = base * zoom
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, -pos.x / scale, -pos.y / scale, VIEW / scale, VIEW / scale, 0, 0, OUT, OUT)
    canvas.toBlob(
      (blob) => blob && onDone(new File([blob], 'avatar.jpg', { type: 'image/jpeg' })),
      'image/jpeg',
      0.9,
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] mx-auto flex w-full max-w-[420px] flex-col items-center bg-[#140c08] px-6 pb-8 pt-6 text-white">
      <div className="flex w-full items-center justify-between">
        <button type="button" onClick={onCancel} className="text-meta font-semibold text-white/80">
          Cancel
        </button>
        <p className="text-meta font-semibold">{title}</p>
        <button
          type="button"
          onClick={save}
          disabled={!img}
          className="text-meta font-semibold text-[#ffb27a] disabled:opacity-40"
        >
          {saveLabel}
        </button>
      </div>

      <div className="flex flex-1 items-center">
        <div
          className="relative touch-none select-none overflow-hidden rounded-full ring-2 ring-[#ffa05e]"
          style={{ width: VIEW, height: VIEW, cursor: drag.current ? 'grabbing' : 'grab' }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          {img && (
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{ width: w, height: h, left: pos.x, top: pos.y }}
            />
          )}
        </div>
      </div>

      <p className="text-meta text-white/70">Drag to place it. Pinch or slide to zoom.</p>
      <input
        type="range"
        min="1"
        max="3"
        step="0.01"
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        aria-label="Zoom"
        className="mt-4 w-full accent-[#f5782c]"
      />
    </div>,
    document.body,
  )
}
