import { useId } from 'react'

/**
 * The puja samagri, drawn as objects rather than icons.
 *
 * The mandir used line glyphs for its offerings and they read as a toolbar.
 * A shrine wants brass, so these are modelled: a lit thali is a plate with
 * kumkum and haldi on it, the ghanti has a clapper, the diya has oil in it.
 *
 * Brass is four stops and one highlight, kept in `BRASS` so every prop catches
 * light from the same place. That is the app's one-light-source rule applied
 * to metal instead of to cards — a bell lit from the left next to a thali lit
 * from above is the thing that makes drawn objects look pasted on.
 *
 * Every gradient id runs through `useId`. These render two and three at a time
 * (a prop appears on the rail and again on the shrine) and duplicate ids in a
 * document mean the second instance silently borrows the first one's fill.
 */

const BRASS = {
  hi: '#faeec2',
  lit: '#e8c86a',
  mid: '#c9a227',
  dark: '#8a6a3a',
  edge: 'rgba(48,36,16,.55)',
}

/** Shared brass fill. `v` shifts the whole ramp for a darker or lighter part. */
function Brass({ id, v = 0 }) {
  const stops = [BRASS.hi, BRASS.lit, BRASS.mid, BRASS.dark]
  const shift = (i) => stops[Math.min(stops.length - 1, Math.max(0, i + v))]
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor={shift(0)} />
      <stop offset="38%" stopColor={shift(1)} />
      <stop offset="72%" stopColor={shift(2)} />
      <stop offset="100%" stopColor={shift(3)} />
    </linearGradient>
  )
}

/** A flame. The only animated part of any of these. */
function Flame({ x, y, h = 11, delay = 0, still = false }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy={-h * 0.45} rx={h * 0.6} ry={h * 0.7} fill="#f4b942" opacity=".28" />
      <path
        d={`M0 0c${h * 0.36} -${h * 0.3} ${h * 0.3} -${h * 0.62} 0 -${h}c-${h * 0.3} ${h * 0.38} -${h * 0.36} ${h * 0.7} 0 ${h}Z`}
        fill="#fbd469"
        className={still ? '' : 'animate-flicker'}
        style={{ transformOrigin: '0px 0px', animationDelay: `${delay}s` }}
      />
      <path
        d={`M0 -${h * 0.16}c${h * 0.17} -${h * 0.16} ${h * 0.14} -${h * 0.34} 0 -${h * 0.55}c-${h * 0.14} ${h * 0.21} -${h * 0.17} ${h * 0.39} 0 ${h * 0.55}Z`}
        fill="#fffaf0"
      />
    </g>
  )
}

/**
 * Ghanti — the temple bell. `hanging` gives it its chain and a longer drop for
 * the two that live in the top corners of the shrine; without it you get just
 * the bell, sized for the offering rail.
 */
export function Ghanti({ size = 22, hanging = false }) {
  const id = useId()
  const h = hanging ? 96 : 48
  return (
    <svg
      viewBox={`0 0 44 ${h}`}
      height={hanging ? size : size * 1.05}
      width={hanging ? (size * 44) / h : size}
      style={{ height: hanging ? size : size * 1.05 }}
      className="overflow-visible"
    >
      <defs>
        <Brass id={`b${id}`} />
        <Brass id={`d${id}`} v={1} />
      </defs>
      <g transform={`translate(0 ${hanging ? 0 : -44})`}>
        {/* Chain, and the beads that stop it being a wire. */}
        <path d="M22 0v30" stroke={BRASS.dark} strokeWidth="2" fill="none" />
        {hanging && [8, 16, 24].map((cy) => <circle key={cy} cx="22" cy={cy} r="2.4" fill={`url(#d${id})`} />)}
        {/* Crown and the ring it hangs from. */}
        <circle cx="22" cy="33" r="3.4" fill="none" stroke={BRASS.mid} strokeWidth="2" />
        <path d="M17 38h10l-1.4 5h-7.2Z" fill={`url(#d${id})`} stroke={BRASS.edge} strokeWidth=".7" />
        {/* Body: shoulder, flare, rim. */}
        <path
          d="M22 43c-7.6 0-11.4 6.6-11.4 15.2 0 5.8-2 9.6-3.8 12.4h30.4c-1.8-2.8-3.8-6.6-3.8-12.4C33.4 49.6 29.6 43 22 43Z"
          fill={`url(#b${id})`}
          stroke={BRASS.edge}
          strokeWidth="1.1"
        />
        <path d="M8 66h28" stroke={BRASS.edge} strokeWidth=".9" opacity=".55" fill="none" />
        <path d="M11 57.5h22" stroke={BRASS.edge} strokeWidth=".8" opacity=".4" fill="none" />
        {/* The specular streak. Without it brass reads as mustard. */}
        <path d="M15.5 47c-2.4 3.6-3.2 8.6-3.2 13.6" stroke={BRASS.hi} strokeWidth="2" strokeLinecap="round" fill="none" opacity=".75" />
        <ellipse cx="22" cy="71" rx="15" ry="2.6" fill={`url(#d${id})`} stroke={BRASS.edge} strokeWidth=".9" />
        {/* Clapper. */}
        <path d="M22 72v4" stroke={BRASS.dark} strokeWidth="1.6" fill="none" />
        <circle cx="22" cy="79" r="3.4" fill={`url(#d${id})`} stroke={BRASS.edge} strokeWidth=".8" />
      </g>
    </svg>
  )
}

/** Marigold. Three rings of petals, because two looks like a daisy. */
export function Marigold({ size = 22 }) {
  const id = useId()
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className="overflow-visible">
      <defs>
        <radialGradient id={`m${id}`}>
          <stop offset="0%" stopColor="#f7b733" />
          <stop offset="70%" stopColor="#e8871e" />
          <stop offset="100%" stopColor="#c25e10" />
        </radialGradient>
      </defs>
      {[
        { r: 13, n: 12, rx: 3.4, ry: 5.2, o: 0, fill: '#d2700f' },
        { r: 9.5, n: 10, rx: 3.1, ry: 4.4, o: 18, fill: `url(#m${id})` },
        { r: 5.6, n: 8, rx: 2.7, ry: 3.4, o: 24, fill: '#f6c04a' },
      ].map((ring) => (
        <g key={ring.r}>
          {Array.from({ length: ring.n }, (_, i) => {
            const a = (360 / ring.n) * i + ring.o
            return (
              <ellipse
                key={i}
                cx="16"
                cy={16 - ring.r}
                rx={ring.rx}
                ry={ring.ry}
                fill={ring.fill}
                transform={`rotate(${a} 16 16)`}
              />
            )
          })}
        </g>
      ))}
      <circle cx="16" cy="16" r="3.4" fill="#b8560c" />
      <circle cx="14.8" cy="14.8" r="1.1" fill="#f9d68a" opacity=".8" />
    </svg>
  )
}

/** A single diya. Oil in the bowl, and a flame only when it is lit. */
export function Diya({ size = 22, lit = false }) {
  const id = useId()
  return (
    <svg viewBox="0 0 34 26" width={size} height={(size * 26) / 34} className="overflow-visible">
      <defs>
        <Brass id={`b${id}`} />
      </defs>
      {lit && <ellipse cx="17" cy="14" rx="15" ry="10" fill="#f4b942" opacity=".22" />}
      {/* Bowl, with the pinched spout the wick sits in. */}
      <path
        d="M2.5 14h29c0 6-6.5 10-14.5 10S2.5 20 2.5 14Z"
        fill={`url(#b${id})`}
        stroke={BRASS.edge}
        strokeWidth="1.1"
      />
      <path d="M2.5 14h29" stroke={BRASS.edge} strokeWidth="1" fill="none" />
      <ellipse cx="17" cy="14" rx="13" ry="2.6" fill="#6f5322" opacity=".55" />
      <path d="M7 17.5c1.4 3 5 5 10 5" stroke={BRASS.hi} strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".6" />
      {/* Wick, laid over the lip. */}
      <path d="M17 14.4l0-3.4" stroke="#5d4522" strokeWidth="1.6" strokeLinecap="round" />
      {lit && <Flame x={17} y={11} h={10} />}
    </svg>
  )
}

/** Dhoop — three sticks in a holder, smoking once lit. */
export function Dhoop({ size = 22, lit = false }) {
  const id = useId()
  return (
    <svg viewBox="0 0 30 34" width={(size * 30) / 34} height={size} className="overflow-visible">
      <defs>
        <Brass id={`b${id}`} />
      </defs>
      {[-6, 0, 6].map((dx, i) => (
        <g key={dx}>
          <path
            d={`M15 27L${15 + dx * 1.5} 5`}
            stroke="#7a5a30"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx={15 + dx * 1.5} cy="5" r="1.5" fill={lit ? '#ff7a1a' : '#4b3a20'} />
          {lit && (
            <circle cx={15 + dx * 1.5} cy="5" r="3" fill="#ff9a3c" opacity=".3">
              <animate attributeName="opacity" values=".15;.45;.15" dur="2.4s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
            </circle>
          )}
        </g>
      ))}
      <path d="M6 27h18l-2 5H8Z" fill={`url(#b${id})`} stroke={BRASS.edge} strokeWidth="1" />
      <ellipse cx="15" cy="27" rx="9" ry="2.2" fill={BRASS.lit} stroke={BRASS.edge} strokeWidth=".9" />
    </svg>
  )
}

/**
 * The aarti thali.
 *
 * Seen from slightly above, which is the only angle that reads as a plate
 * being held out. On it: the five-wick lamp in the middle, kumkum and haldi,
 * rice, and a marigold — the things actually on a thali, because a bare brass
 * disc looked like a coin.
 */
export function Thali({ size = 86, lit = false }) {
  const id = useId()
  return (
    <svg viewBox="0 0 120 56" width={size} height={(size * 56) / 120} className="overflow-visible">
      <defs>
        <Brass id={`b${id}`} />
        <Brass id={`d${id}`} v={1} />
        <radialGradient id={`g${id}`} cx="50%" cy="35%">
          <stop offset="0%" stopColor="#fff3cf" stopOpacity=".9" />
          <stop offset="100%" stopColor="#fff3cf" stopOpacity="0" />
        </radialGradient>
      </defs>

      {lit && <ellipse cx="60" cy="30" rx="58" ry="26" fill={`url(#g${id})`} />}

      {/* Plate: rim, well, and the dotted border a thali always has. */}
      <ellipse cx="60" cy="40" rx="56" ry="14" fill={`url(#d${id})`} stroke={BRASS.edge} strokeWidth="1.3" />
      <ellipse cx="60" cy="38" rx="47" ry="11" fill={`url(#b${id})`} />
      <ellipse cx="60" cy="37.5" rx="38" ry="8.4" fill="none" stroke={BRASS.dark} strokeWidth=".8" opacity=".5" />
      {Array.from({ length: 22 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 22
        return (
          <circle
            key={i}
            cx={60 + Math.cos(a) * 51}
            cy={40 + Math.sin(a) * 12.4}
            r=".9"
            fill={BRASS.dark}
            opacity=".55"
          />
        )
      })}
      <path d="M18 42c6 4 20 6 34 6" stroke={BRASS.hi} strokeWidth="2" strokeLinecap="round" fill="none" opacity=".55" />

      {/* Kumkum and haldi, left and right of the lamp. */}
      <ellipse cx="30" cy="35" rx="6" ry="3" fill="#8e1b1b" />
      <ellipse cx="30" cy="33.6" rx="5" ry="2.4" fill="#c62828" />
      <ellipse cx="90" cy="35" rx="6" ry="3" fill="#b98407" />
      <ellipse cx="90" cy="33.6" rx="5" ry="2.4" fill="#f0b820" />
      {/* Akshat. */}
      <ellipse cx="44" cy="33" rx="4.6" ry="2.3" fill="#efe7d6" />
      <ellipse cx="44" cy="32.2" rx="3.6" ry="1.7" fill="#fbf7ee" />

      {/* The marigold on the rim. */}
      <g transform="translate(69 24) scale(.62)">
        <Marigold size={26} />
      </g>

      {/* The five-wick lamp, and its flames. */}
      <path d="M46 30h28c0 4.6-5.4 7.6-14 7.6S46 34.6 46 30Z" fill={`url(#d${id})`} stroke={BRASS.edge} strokeWidth="1" />
      <ellipse cx="60" cy="30" rx="14" ry="3.2" fill={BRASS.lit} stroke={BRASS.edge} strokeWidth=".8" />
      {[50, 55, 60, 65, 70].map((x) => (
        <path key={x} d={`M${x} 30v-3`} stroke="#5d4522" strokeWidth="1.4" strokeLinecap="round" />
      ))}
      {lit && [50, 55, 60, 65, 70].map((x, i) => <Flame key={x} x={x} y={27} h={11} delay={i * 0.13} />)}
    </svg>
  )
}
