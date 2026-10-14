import { useRef } from 'react'

/**
 * Press and hold, as a phone does it (14 Oct 2026: delete a chat or a
 * message). Spread the result on the element. Half a second on a finger,
 * or a right-click on a computer; a finger that moves is a scroll, not a
 * hold. `onHold` gets the original event's target.
 */
export function useLongPress(onHold, ms = 500) {
  const timer = useRef(null)
  const start = useRef(null)
  const held = useRef(false)

  const cancel = () => {
    clearTimeout(timer.current)
    timer.current = null
  }

  return {
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      held.current = false
      start.current = { x: e.clientX, y: e.clientY }
      cancel()
      timer.current = setTimeout(() => {
        held.current = true
        onHold()
      }, ms)
    },
    onPointerMove: (e) => {
      if (!start.current) return
      if (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8) cancel()
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e) => {
      e.preventDefault()
      cancel()
      held.current = true
      onHold()
    },
    // A hold that fired must not also count as a tap.
    onClickCapture: (e) => {
      if (held.current) {
        e.preventDefault()
        e.stopPropagation()
        held.current = false
      }
    },
  }
}
