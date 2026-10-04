import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import { Kicker, PopButton } from '../components/Pop.jsx'
import { isPro } from '../side.js'
import { useStore } from '../store.jsx'

/**
 * Help and support (3 Oct 2026). One page in both apps.
 *
 * No ticket system of our own, by decision: support@1namo.com goes into a
 * helpdesk (Zoho Desk or Freshdesk) that turns every email into a ticket and
 * counts received, answered and resolved. So "Report a problem" writes an
 * email, not a database row — pre-filled with what support always has to ask
 * for (the account, the app, the kind of problem, an order or session id),
 * so the first reply can be an answer instead of a question.
 *
 * The FAQ says only what the app actually does. No support hours are
 * promised here until somebody has decided them.
 */

export const SUPPORT_PHONE = '+91 99580 40508'
export const SUPPORT_EMAIL = 'support@1namo.com'
const PHONE_DIGITS = '919958040508'

const TOPICS = ['sup.t.money', 'sup.t.session', 'sup.t.order', 'sup.t.account', 'sup.t.other']
const FAQ = [1, 2, 3, 4, 5]

export default function Support() {
  const { t, profile, session } = useStore()
  const { state } = useLocation()
  const [topic, setTopic] = useState(TOPICS[0])
  const [ref, setRef] = useState('')
  const [text, setText] = useState('')
  const [open, setOpen] = useState(null)

  const who = [
    profile?.name && profile.name !== 'there' ? profile.name : null,
    profile?.phone ?? null,
    session?.user?.id ? `Account ${session.user.id}` : 'Not signed in',
  ]
    .filter(Boolean)
    .join(' · ')

  const subject = `${isPro ? '[Consultant] ' : ''}${t(topic)}${ref.trim() ? ` · ${ref.trim()}` : ''}`
  const body = [
    text.trim() || '(describe the problem here)',
    '',
    '—',
    `Topic: ${t(topic)}`,
    ref.trim() && `Order or session: ${ref.trim()}`,
    `From: ${who}`,
    `App: ${isPro ? 'consultant (pro.1namo.com)' : 'seeker (1namo.com)'}`,
    state?.from && `Was on: ${state.from}`,
    `Sent: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`,
  ]
    .filter(Boolean)
    .join('\n')

  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  const whatsapp = `https://wa.me/${PHONE_DIGITS}?text=${encodeURIComponent(`${subject}\n\n${body}`)}`

  return (
    <>
      <TopBar title={t('sup.title')} back backTo={isPro ? '/pro/profile/settings' : '/profile/settings'} />

      <section className="px-5 pt-5">
        <p className="text-meta t-body">{t('sup.lede')}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Contact href={`tel:+${PHONE_DIGITS}`} icon="phone" label={t('sup.call')} />
          <Contact href={`https://wa.me/${PHONE_DIGITS}`} icon="chat" label="WhatsApp" />
          <Contact href={`mailto:${SUPPORT_EMAIL}`} icon="send" label={t('sup.email')} />
        </div>
        {/* Written out as well: a tel: or mailto: link does nothing on a
            laptop without a phone app or a mail client. */}
        <p className="mt-3 text-center text-meta tnum t-faint select-all">
          {SUPPORT_PHONE} · {SUPPORT_EMAIL}
        </p>
      </section>

      <section className="px-5 pt-8">
        <Kicker>{t('sup.report')}</Kicker>
        <p className="mt-2 text-meta t-faint">{t('sup.reportHint')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {TOPICS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={topic === k}
              onClick={() => setTopic(k)}
              className="pill text-meta"
            >
              {t(k)}
            </button>
          ))}
        </div>
        <label className="mt-5 block">
          <span className="mb-1.5 block text-meta font-semibold t-heading">{t('sup.ref')}</span>
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder={t('sup.refPh')}
            className="field-line"
            autoCapitalize="none"
            spellCheck="false"
          />
        </label>
        <label className="mt-5 block">
          <span className="mb-1.5 block text-meta font-semibold t-heading">
            {t('sup.what')}
            <span className="ml-0.5 text-live" aria-hidden="true">
              *
            </span>
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={t('sup.whatPh')}
            className="w-full resize-none rounded-2xl border border-rule bg-white px-4 py-3 text-meta text-t1 outline-none placeholder:text-t4 focus:border-gold-fill"
          />
        </label>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {/* No link until there is something to send: an <a> ignores
              `disabled`, so an empty report would still open the mail app. */}
          <PopButton variant="gold" href={text.trim() ? mailto : undefined} disabled={!text.trim()}>
            {t('sup.sendEmail')}
          </PopButton>
          <PopButton variant="ghost" href={text.trim() ? whatsapp : undefined} disabled={!text.trim()}>
            {t('sup.sendWa')}
          </PopButton>
        </div>
      </section>

      <section className="px-5 pt-10">
        <Kicker>{t('sup.faq')}</Kicker>
        <ul className="mt-3">
          {FAQ.map((n) => (
            <li key={n} className="border-b border-rule last:border-b-0">
              <button
                type="button"
                aria-expanded={open === n}
                onClick={() => setOpen(open === n ? null : n)}
                className="flex w-full items-baseline justify-between gap-4 py-4 text-left"
              >
                <span className="text-meta font-semibold t-heading">{t(`sup.q${n}`)}</span>
                <span aria-hidden="true" className="flex-none text-meta t-faint">
                  {open === n ? '▴' : '▾'}
                </span>
              </button>
              {open === n && <p className="animate-fade pb-4 text-meta t-body">{t(`sup.a${n}`)}</p>}
            </li>
          ))}
        </ul>
      </section>

      <div className="h-24" />
    </>
  )
}

function Contact({ href, icon, label }) {
  return (
    <a
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel="noopener noreferrer"
      className="pop-card pop-tap flex flex-col items-center gap-2 px-2 py-4 text-center"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-gold">
        <Icon name={icon} size={20} />
      </span>
      <span className="text-meta font-semibold t-heading">{label}</span>
    </a>
  )
}
