/**
 * A product description with a little formatting (6 Oct 2026, Rahul:
 * "highlighted words or headings, abhi plain text hai").
 *
 * The marks, typed in the console (its toolbar adds them) or the sheet:
 *
 *   ## Heading            a heading          ### Smaller heading
 *   **bold**              bold               *italic*
 *   ==highlighted==       saffron highlight
 *   - point               a bulleted list    1. point   a numbered list
 *   > a line              a quote
 *   a blank line          a new paragraph
 *
 * Built as React elements, never as HTML: whatever is typed renders as
 * text, so a description cannot inject markup or script.
 */
export default function RichText({ text, className = '' }) {
  const blocks = parseBlocks(text || '')
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        if (b.type === 'h2') return <h3 key={i} className="mt-6 text-lead font-semibold t-heading first:mt-0">{inline(b.text)}</h3>
        if (b.type === 'h3') return <h4 key={i} className="mt-5 text-body font-semibold t-heading first:mt-0">{inline(b.text)}</h4>
        if (b.type === 'quote') {
          return (
            <blockquote key={i} className="mt-3 border-l-4 border-gold-fill bg-gold-fill/10 px-3 py-2 text-body italic t-body">
              {inline(b.text)}
            </blockquote>
          )
        }
        if (b.type === 'ul' || b.type === 'ol') {
          const List = b.type === 'ul' ? 'ul' : 'ol'
          return (
            <List key={i} className={`mt-3 space-y-1.5 pl-5 text-body t-body ${b.type === 'ul' ? 'list-disc' : 'list-decimal'}`}>
              {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
            </List>
          )
        }
        return <p key={i} className="mt-3 whitespace-pre-line text-body t-body first:mt-0">{inline(b.text)}</p>
      })}
    </div>
  )
}

function parseBlocks(src) {
  const out = []
  let para = []
  let list = null
  const flushPara = () => {
    if (para.length) out.push({ type: 'p', text: para.join('\n') })
    para = []
  }
  const flushList = () => {
    if (list) out.push(list)
    list = null
  }
  for (const raw of src.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flushPara()
      flushList()
      continue
    }
    let m
    if ((m = line.match(/^###\s+(.*)$/))) {
      flushPara(); flushList(); out.push({ type: 'h3', text: m[1] })
    } else if ((m = line.match(/^##\s+(.*)$/))) {
      flushPara(); flushList(); out.push({ type: 'h2', text: m[1] })
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara(); flushList(); out.push({ type: 'quote', text: m[1] })
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      flushPara()
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] } }
      list.items.push(m[1])
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara()
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] } }
      list.items.push(m[1])
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara()
  flushList()
  return out
}

/* **bold**, ==highlight==, *italic* — in that order of precedence. */
const INLINE = /(\*\*[^*]+\*\*|==[^=]+==|\*[^*\s][^*]*\*)/g

function inline(text) {
  const parts = text.split(INLINE)
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i} className="font-semibold t-heading">{part.slice(2, -2)}</strong>
    if (/^==[^=]+==$/.test(part)) {
      return (
        <mark key={i} className="rounded bg-gold-fill/25 px-1 font-medium text-inherit">
          {part.slice(2, -2)}
        </mark>
      )
    }
    if (/^\*[^*\s][^*]*\*$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

/** The words without the marks — for a share line or a search. */
export function plainText(text) {
  return (text || '')
    .replace(/^#{2,3}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*([-*•]|\d+[.)])\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/==([^=]+)==/g, '$1')
    .replace(/\*([^*\s][^*]*)\*/g, '$1')
}
