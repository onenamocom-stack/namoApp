/* Each weekday's deity, Sunday first (23 Oct 2026, Rahul): Monday Shiva,
   Tuesday Hanuman, Wednesday Ganesh, Thursday Vishnu, Friday Mata, Saturday
   Shani then Hanuman, Sunday Surya then Krishna. Darshan opens on it, and
   Status and Wallpapers put it first. Matched by the console's deity name,
   lower-cased; a name the console does not have is skipped (until the
   console has Surya, Sunday leads with Krishna). The day is India's. */
const DAY_DEITIES = [
  ['surya', 'krishna'],
  ['shiva', 'shiv'],
  ['hanuman'],
  ['ganesh', 'ganesha'],
  ['vishnu'],
  ['mata', 'durga'],
  ['shani', 'hanuman'],
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Today's deity names, lower-cased, in order. */
export function dayDeities(now = new Date()) {
  const day = WEEKDAYS.indexOf(
    new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' }).format(now),
  )
  return DAY_DEITIES[day] ?? []
}

/** Where a name stands among today's deities: 0, 1, ... or -1. */
export function dayRank(name, now = new Date()) {
  return dayDeities(now).indexOf(String(name ?? '').trim().toLowerCase())
}

/** `items` with today's deities first, in the day's order; the rest keep theirs. */
export function dayFirst(items, nameOf = (x) => x, now = new Date()) {
  const ranked = items.map((x, i) => ({ x, i, r: dayRank(nameOf(x), now) }))
  return ranked
    .sort((a, b) => (a.r < 0) - (b.r < 0) || (a.r >= 0 && b.r >= 0 ? a.r - b.r : 0) || a.i - b.i)
    .map((e) => e.x)
}
