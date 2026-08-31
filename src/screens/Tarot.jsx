import { useState } from 'react'
import { TAROT_PRICE, tarotDecks } from '../data/mock.js'
import { TopBar } from '../components/Chrome.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopButton, PopCard, PopTag } from '../components/Pop.jsx'
import { Stub } from '../components/Primitives.jsx'
import { useStore } from '../store.jsx'

/**
 * Tarot — a guided pull, then the card.
 *
 * The screen used to lay everything out at once: deck pills, a card back and a
 * pull button all visible before you had decided anything. A reading is a
 * sequence, so this is a sequence — two dialogs, then the card.
 *
 *   deck → question → (pull) → card
 *
 * The dialogs are modal on purpose. "Think of a question" is the only step
 * that asks the seeker to do something the app cannot check, and a prompt you
 * can scroll past is a prompt nobody follows. Nothing is typed: the question
 * stays in their head, which is the whole ritual.
 *
 * Five decks by tradition rather than one Western pack. Bhaktamar is the odd
 * one: 48 painted faces out of `public/cards/`, plus the shloka in Sanskrit,
 * IAST and English, a question and a remedy per card. The other four are six
 * cards of drawn artwork each. Everything optional on a card is gated on the
 * field being present, so the two shapes share one renderer.
 *
 * **Price is never shown before a card has been pulled.** Leading with "₹11
 * after your free ones" sells before the thing has been handed over.
 *
 * The free pulls are two flags on the store's `flags` Set rather than a
 * counter, because `flags` is a Set of strings and that is the hatch this app
 * already has. Paid pulls go through `spend()`, which refuses and toasts when
 * the wallet is short.
 *
 * ponytail: "weekly" is a pair of flags, not a dated window. Nothing here
 * persists across a reload, so a real week boundary needs a clock *and* a store
 * that remembers — add both together or neither.
 */
const FREE_PULLS = 2
const FREE_KEYS = ['tarot:free1', 'tarot:free2']

export default function Tarot() {
  const { showToast, hasFlag, toggleFlag, spend, spending, balance, lang, t } = useStore()
  const [deck, setDeck] = useState(null)
  const [card, setCard] = useState(null)
  const [step, setStep] = useState('deck')
  const [showConsultDialog, setShowConsultDialog] = useState(false)
  const [consultName, setConsultName] = useState('')

  const usedFree = FREE_KEYS.filter(hasFlag).length
  const freeLeft = FREE_PULLS - usedFree
  const paying = freeLeft <= 0
  /* `balance` is paise and TAROT_PRICE is rupees, so the comparison needs the
     hundred. `balance` is also null until the wallet loads, and null fails
     this test — which disables the button rather than offering a pull that
     would be refused a moment later. */
  const canAfford = !paying || balance >= TAROT_PRICE * 100
  const tradition = (d) => (lang === 'hi' ? d.traditionHi : d.tradition)

  const pull = async () => {
    // Two a week are free; after that each card is charged. spend() is a
    // promise now — without the await, `!promise` is always false and every
    // pull would go through, paid or not.
    if (paying) {
      if (!(await spend(TAROT_PRICE, `Tarot · ${deck.name}`))) return
    } else {
      toggleFlag(FREE_KEYS[usedFree])
      showToast(t(freeLeft === 1 ? 'tarot.lastFree' : 'tarot.oneMore'))
    }

    const pool = deck.cards.filter((c) => c.id !== card?.id)
    setCard(pool[Math.floor(Math.random() * pool.length)])
    setStep('card')
  }

  return (
    <>
      <TopBar
        title={t('tarot.title')}
        back
        backTo="/home"
        /* Only once a card exists. Before that the screen has sold nothing. */
        sub={
          card
            ? paying
              ? `₹${TAROT_PRICE} ${t('tarot.aCard')}`
              : `${freeLeft} ${t('tarot.freeLeft')}`
            : null
        }
      />

      <section className="px-5 py-6">
        {card ? (
          <Card
            card={card}
            deck={deck}
            tradition={tradition}
            canAfford={canAfford}
            onAgain={() => setStep('question')}
            onChangeDeck={() => setStep('deck')}
            onConsult={() => setShowConsultDialog(true)}
          />
        ) : (
          /* The face-down deck, waiting behind whichever dialog is open. It is
             not an empty state — it is the thing the dialogs are about. */
          <div className="text-center">
            <Plate
              seed={`back-${deck?.id ?? 'x'}`}
              variant="contour"
              className="mx-auto aspect-[3/4] w-2/3"
            />
          </div>
        )}
      </section>

      <section className="border-t border-rule px-5 py-6">
        <Kicker action={t('tarot.askStars')} to="/ask">
          {t('tarot.stuck')}
        </Kicker>
        <p className="mt-2 text-meta t-body">{t('tarot.notDecide')}</p>
      </section>

      <div className="h-8" />

      {showConsultDialog && (
        <Dialog
          title={t('tarot.bookReader') || 'Book a tarot reader'}
          onBack={() => {
            setShowConsultDialog(false)
            setConsultName('')
          }}
        >
          <input
            type="text"
            placeholder={t('a.name') || 'Your name'}
            value={consultName}
            onChange={(e) => setConsultName(e.target.value)}
            className="w-full rounded-lg border border-stroke bg-surface px-3 py-2 text-body placeholder-t-faint focus:border-ink focus:outline-none"
          />
          <PopButton
            variant="gold"
            className="mt-4 w-full"
            onClick={() => {
              if (!consultName.trim()) {
                showToast(t('a.fieldRequired') || 'Please enter a name')
                return
              }
              showToast(`Booking request sent for ${consultName}`)
              setShowConsultDialog(false)
              setConsultName('')
            }}
          >
            {t('tarot.requestBooking') || 'Request booking'}
          </PopButton>
          <p className="mt-3 text-center text-meta t-faint text-sm">
            {t('tarot.bookingNote') || 'A tarot reader will contact you shortly'}
          </p>
        </Dialog>
      )}

      {step === 'deck' && (
        <Dialog title={t('tarot.whichDeck')} note={t('tarot.whichDeckNote')}>
          <ul className="space-y-2">
            {tarotDecks.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => {
                    setDeck(d)
                    setCard(null)
                    setStep('question')
                  }}
                  className="pop-tap flex w-full items-baseline gap-3 rounded-2xl px-4 py-3.5 text-left"
                >
                  <span className="caps-sm flex-none gold">{tradition(d)}</span>
                  <span className="min-w-0 flex-1 text-meta t-body">{d.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </Dialog>
      )}

      {step === 'question' && (
        <Dialog
          title={t('tarot.thinkTitle')}
          note={t('tarot.thinkNote')}
          onBack={() => setStep(card ? 'card' : 'deck')}
        >
          <p className="text-read t-heading">{t('tarot.hold')}</p>
          <PopButton
            variant="gold"
            className="mt-6"
            disabled={!canAfford || spending}
            onClick={pull}
          >
            {spending
              ? '…'
              : paying
                ? `${t('tarot.pull')} · ₹${TAROT_PRICE}`
                : t('tarot.pull')}
          </PopButton>
          {/* Only someone who has already paid once sees the terms here. */}
          {paying && (
            <p className="mt-3 text-center caps-sm t-faint">
              {t('tarot.freeUsed', { price: TAROT_PRICE })}
            </p>
          )}
          {!canAfford && (
            <PopButton variant="ghost" to="/wallet" className="mt-3">
              {t('a.addMoney')}
            </PopButton>
          )}
        </Dialog>
      )}
    </>
  )
}

/**
 * A step in the flow.
 *
 * Centred rather than a bottom sheet: a sheet reads as "more of this screen",
 * and these are a question the screen is asking you. No close button on the
 * first step — there is no tarot screen behind it to return to yet, and a
 * dialog you can dismiss into an empty screen is a dead end.
 */
function Dialog({ title, note, onBack, children }) {
  const { t } = useStore()
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center px-5">
      <div className="absolute inset-0 animate-fade bg-ink opacity-40" />
      <div className="glass-panel no-scrollbar relative max-h-[86%] w-full animate-fade-rise overflow-y-auto rounded-3xl p-6 shadow-xl">
        <p className="caps t-heading">{title}</p>
        {note && <p className="mt-2 text-meta t-faint">{note}</p>}
        <div className="mt-5">{children}</div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mx-auto mt-5 block caps-sm t-faint"
          >
            {t('a.back')}
          </button>
        )}
      </div>
    </div>
  )
}

/** The pulled card: face, verse, meaning, then consult flow. Sequential experience. */
function Card({ card, deck, tradition, canAfford, onAgain, onChangeDeck, onConsult }) {
  const { t } = useStore()
  return (
    <>
      <PopCard raised className="overflow-hidden">
        {card.img ? (
          /* A painted deck. Only the Bhaktamar cards have faces; the file sits
             in public/ so BASE_URL, not the bundler, resolves it — GitHub Pages
             serves this app from a sub-path. */
          <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#e8e2d8]">
            <img
              src={`${import.meta.env.BASE_URL}cards/${card.img}`}
              alt={card.name}
              className="h-full w-full object-cover"
            />
            <span className="absolute left-3 top-3">
              <PopTag>{tradition(deck)}</PopTag>
            </span>
            <span className="absolute right-3 top-3">
              <PopTag tone="gold">{card.no}</PopTag>
            </span>
          </div>
        ) : (
          <Plate
            seed={card.id}
            variant="engraving"
            className="!rounded-none aspect-[3/4] w-full !shadow-none"
          >
            <span className="absolute left-3 top-3">
              <PopTag>{tradition(deck)}</PopTag>
            </span>
          </Plate>
        )}

        {/* The verse comes straight off the face, before any reading of it —
            the shloka is the card, the meaning is our gloss on it. */}
        {card.sa && (
          <div className="border-t border-stroke p-5">
            <p className="caps-sm t-faint">
              {t('tarot.shloka')} {card.no}
            </p>
            <p lang="sa" className="mt-2 text-read leading-relaxed t-body">
              {card.sa}
            </p>
            <p className="mt-2 text-meta italic t-faint">{card.iast}</p>
            {card.en && (
              <>
                <Stub className="my-4" />
                <p className="text-meta t-sub">{card.en}</p>
              </>
            )}
          </div>
        )}
      </PopCard>

      {/* What the card means: title, the line under it, the virtue it asks for. */}
      <div className="pop-inset mt-4 p-5 text-center">
        <p className="caps-sm gold">{card.name}</p>
        {card.sub && <p className="mt-1.5 text-meta t-faint">{card.sub}</p>}
        <Stub className="my-4" />
        <p className="text-read t-heading">{card.line}</p>
        {card.virtue && <p className="mt-4 caps-sm t-faint">{card.virtue}</p>}
      </div>

      {card.ask && (
        <div className="pop-inset mt-4 p-4">
          <p className="caps-sm t-faint">{t('tarot.askYourself')}</p>
          <p className="mt-1.5 text-meta t-heading">{card.ask}</p>
          <Stub className="my-4" />
          <p className="caps-sm t-faint">{t('tarot.remedy')}</p>
          <p className="mt-1.5 text-meta t-body">{card.remedy}</p>
        </div>
      )}

      <PopButton variant="gold" className="mt-6" onClick={onConsult}>
        {t('tarot.askReader') || 'Consult with a reader'}
      </PopButton>

      <div className="mt-3 flex items-center gap-2">
        <PopButton
          variant="ghost"
          className="flex-1"
          full={false}
          disabled={!canAfford}
          onClick={onAgain}
        >
          {canAfford ? t('tarot.pullAgain') : t('tarot.topUp')}
        </PopButton>
        <PopButton variant="ghost" className="flex-1" full={false} onClick={onChangeDeck}>
          {t('tarot.changeDeck')}
        </PopButton>
      </div>

      <p className="mt-6 text-center text-meta t-faint">{t('tarot.prompt')}</p>
    </>
  )
}
