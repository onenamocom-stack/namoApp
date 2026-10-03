import { useEffect, useState } from 'react'
import { tarotDecks } from '../data/mock.js'
import { TopBar } from '../components/Chrome.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopButton, PopCard } from '../components/Pop.jsx'
import { Stub } from '../components/Primitives.jsx'
import { priceLabel, pullCard, tarotState } from '../lib/tarot.js'
import { useStore } from '../store.jsx'

/**
 * Tarot — a guided pull, then the card read against what was asked.
 *
 *   deck → question → (pull) → the reading
 *
 * **The question is held in the head again, not typed** (30 Sep 2026, the
 * owner's call — it was typed from 24 to 30 Sep). The dialog asks the person
 * to think of a yes-or-no question and has no box; the server reads the card
 * as the answer to an unspoken question (`apps/ai/tarot.py`, UNSPOKEN).
 *
 * **The card is dealt by the server** (`apps/ai/tarot_decks.py`). This
 * screen sends a deck and a question; what comes back is a card id, the
 * reading and one remedy. A client that dealt its own card could pull
 * until it liked the answer, and the pull is charged.
 *
 * **The money and the free count are the server's too.** Both used to be
 * here — a rupee constant and two flags in the store's `flags` Set — and
 * the flags did not survive a reload, so "two free a week" was unlimited.
 *
 * Three decks: Bhaktamar (48 painted faces and the shloka), the Vedic
 * Kipper six, and twenty-two cards that answer yes or no. A deck with no
 * art yet falls back to a plate, so adding faces is a file copy.
 */

export default function Tarot() {
  const { showToast, session, sessionReady, lang, t } = useStore()
  const [deck, setDeck] = useState(null)
  const [step, setStep] = useState('deck')
  const [pulling, setPulling] = useState(false)
  const [result, setResult] = useState(null)
  const [refusal, setRefusal] = useState(null)
  const [state, setState] = useState(null)

  const tradition = (d) => (lang === 'hi' ? d.traditionHi : d.tradition)

  /* What is free and what a card costs, before anything is drawn — so the
     pull button can say which of the two it is about to spend. */
  useEffect(() => {
    if (!sessionReady || !session) return
    tarotState().then((res) => setState(res.ok ? res : null))
  }, [sessionReady, session])

  const freeLeft = state?.free_left ?? null
  const paying = freeLeft === 0

  const pull = async () => {
    setPulling(true)
    setRefusal(null)
    const res = await pullCard({ deck: deck.key, question: '' })
    setPulling(false)

    if (!res.ok) {
      setRefusal(res)
      // A refusal the server meant carries its own sentence; the screen
      // does not write one of its own (backend/INSTRUCTIONS.md §2).
      showToast(res.reason)
      return
    }

    setResult(res)
    setState({ free_left: res.free_left, price_paise: res.price_paise })
    setStep('card')
    if (res.charged_paise === 0 && res.free_left === 0) showToast(t('tarot.lastFree'))
  }

  /* The card as this screen's own data knows it: the art and, for
     Bhaktamar, the shloka. The server sent the id; everything else is
     already in the bundle. */
  const drawn = result
    ? deck.cards.find((c) => c.id === result.card.id) ?? { id: result.card.id, name: result.card.name }
    : null

  return (
    <>
      <TopBar
        title={t('tarot.title')}
        back
        backTo="/home"
        sub={
          freeLeft === null
            ? null
            : freeLeft > 0
              ? `${freeLeft} ${t('tarot.freeLeft')}`
              : `${priceLabel(state.price_paise)} ${t('tarot.aCard')}`
        }
      />

      <section className="px-5 py-6">
        {result ? (
          <Card
            card={drawn}
            reading={result}
            verdict={result.card.verdict}
            deck={deck}
          />
        ) : (
          /* The face-down deck, waiting behind whichever dialog is open. It
             is not an empty state — it is the thing the dialogs are about. */
          <div className="text-center">
            <Plate
              seed={`back-${deck?.id ?? 'x'}`}
              variant="contour"
              className="mx-auto aspect-[3/4] w-2/3"
            />
            {pulling && (
              <p className="mt-5 text-meta t-faint">{t('tarot.reading')}</p>
            )}
          </div>
        )}
      </section>

      {/* Not under a yes/no answer: the partner's sheet is the whole of that
          reading, and this was app copy, not the sheet (30 Sep 2026). */}
      {deck?.key !== 'yesno' && (
        <section className="border-t border-rule px-5 py-6">
          <Kicker action={t('tarot.askStars')} to="/ask">
            {t('tarot.stuck')}
          </Kicker>
          <p className="mt-2 text-meta t-body">{t('tarot.notDecide')}</p>
        </section>
      )}

      <div className="h-8" />

      {step === 'deck' && !result && (
        <Dialog title={t('tarot.whichDeck')} note={t('tarot.whichDeckNote')}>
          <ul className="space-y-2">
            {tarotDecks.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => { setDeck(d); setStep('question') }}
                  className="pop-tap flex w-full items-center gap-3 rounded-2xl border border-rule bg-white px-4 py-3.5 text-left shadow-sm active:bg-surface2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-3">
                      <span className="caps-sm flex-none gold">{tradition(d)}</span>
                      <span className="min-w-0 flex-1 text-body font-semibold text-t1">{d.name}</span>
                    </span>
                    <span className="mt-1 block text-meta text-t2">{d.line}</span>
                  </span>
                  <span aria-hidden="true" className="flex-none text-lead text-gold">›</span>
                </button>
              </li>
            ))}
          </ul>
        </Dialog>
      )}

      {step === 'question' && !result && (
        <Dialog
          title={t('tarot.askTitle')}
          note={t('tarot.askNote')}
          onBack={() => setStep('deck')}
        >
          <PopButton
            variant="gold"
            className="mt-2"
            disabled={pulling}
            onClick={pull}
          >
            {pulling
              ? '…'
              : paying
                ? `${t('tarot.pull')} · ${priceLabel(state.price_paise)}`
                : t('tarot.pull')}
          </PopButton>

          {/* Only somebody who has spent the free ones sees the terms. */}
          {paying && (
            <p className="mt-3 text-center caps-sm t-faint">
              {t('tarot.freeUsed', { price: Math.round(state.price_paise / 100) })}
            </p>
          )}
          {refusal?.needs_money && (
            <PopButton variant="ghost" to="/wallet" className="mt-3">
              {t('a.addMoney')}
            </PopButton>
          )}
          {refusal?.code === 'signed_out' && (
            <PopButton variant="ghost" to="/onboarding" className="mt-3">
              {t('a.signIn') || 'Sign in'}
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
      {/* Solid white, not `glass-panel`: over the scrim the frosted panel
          read as grey, and the choices in it looked switched off (3 Oct). */}
      <div className="no-scrollbar relative max-h-[86%] w-full animate-fade-rise overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
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

/**
 * The card that came up, then what it says about the question.
 *
 * **In this order since 30 Sep 2026, the owner's:** the card, its name, its
 * shloka — and only then "Reveal my reading", behind which sit the answer
 * and the three parts (meaning → conclusion → what to do). The card is
 * looked at before it is explained. "Ask a reader", "Pull again" and
 * "Change deck" are gone from under it: a pull is one question, answered.
 *
 * **A deck whose cards carry their own words wins the last two.** The
 * meaning is always written for the question — the part a pre-written line
 * cannot do. The shloka is not a reading at all: it belongs to the card and
 * it is the tradition's words (`src/data/bhaktamar.js` — never rewritten).
 */
function Card({ card, reading, verdict, deck }) {
  const { t } = useStore()
  const [artFailed, setArtFailed] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const hasArt = Boolean(card.img) && !artFailed

  /* The card wins wherever the deck has words of its own; the model fills
     the rest. The CONCLUSION is the model's on every deck — the only part
     that can turn on what was typed. */
  /* The YES/NO deck is its sheet and nothing else (30 Sep 2026, owner's
     call): verdict, its sentence, the meaning, the shloka. No model text,
     no "where it lands", no "what to do" — none of it was on the sheet. */
  const sheetOnly = deck.key === 'yesno'
  const meaning = card.meaning || (sheetOnly ? null : reading.meaning)
  const conclusion = sheetOnly ? null : reading.conclusion || card.conclusion
  const todo = sheetOnly ? null : card.todo || reading.todo

  return (
    <>
      <PopCard raised className="overflow-hidden">
        {hasArt ? (
          /* The file sits in public/, so BASE_URL resolves it. A deck whose
             art has not been added yet falls back to the plate below. */
          <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#e8e2d8]">
            <img
              src={`${import.meta.env.BASE_URL}cards/${card.img}`}
              alt={card.name}
              onError={() => setArtFailed(true)}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <Plate
            seed={card.id}
            variant="engraving"
            className="!rounded-none aspect-[3/4] w-full !shadow-none"
          />
        )}
      </PopCard>

      {/* The name, directly under the card. */}
      <div className="mt-4 text-center">
        <p className="caps-sm gold">{card.name}</p>
        {card.sub && <p className="mt-1.5 text-meta t-faint">{card.sub}</p>}
      </div>

      {/* The shloka, under the name — the card's own verse, before any reading. */}
      {card.sa && (
        <PopCard className="mt-4 p-5">
          <p className="caps-sm t-faint">
            {/* Only Bhaktamar's cards are numbered verses of the stotra; on any
                other deck a number here would claim a verse that does not exist. */}
            {t('tarot.shloka')}{deck.key === 'bhaktamar' ? ` ${card.no}` : ''}
          </p>
          <p lang="sa" className="mt-2 text-read leading-relaxed t-body">
            {card.sa}
          </p>
          {card.iast && <p className="mt-2 text-meta italic t-faint">{card.iast}</p>}
          {card.en && (
            <>
              <Stub className="my-4" />
              <p className="text-meta t-sub">{card.en}</p>
            </>
          )}
        </PopCard>
      )}

      {!revealed ? (
        <PopButton variant="gold" className="mt-6" onClick={() => setRevealed(true)}>
          {t('tarot.reveal')}
        </PopButton>
      ) : (
        <div className="animate-fade">
          {/* The card's meaning first, THEN the result (30 Sep 2026, owner's
              call): what the card is, before what it says to you. */}
          {meaning && (
            <div className="mt-6">
              <p className="caps-sm t-faint">{t('tarot.meaning')}</p>
              <p className="mt-2 whitespace-pre-line text-read t-heading">{meaning}</p>
            </div>
          )}

          {/* The yes/no deck's result — the CARD's, off the deck sheet; the
              model never gets to overturn it. */}
          {(verdict || card.verdictLine) && (
            <div className="pop-inset mt-6 p-5 text-center">
              {verdict && <p className="text-title font-semibold">{verdict}</p>}
              {card.verdictLine && <p className="mt-1.5 text-meta t-sub">{card.verdictLine}</p>}
            </div>
          )}

          {conclusion && (
            <div className="mt-6">
              <p className="caps-sm t-faint">{t('tarot.conclusion')}</p>
              <p className="mt-2 whitespace-pre-line text-read t-sub">{conclusion}</p>
            </div>
          )}

          {todo && (
            <div className="pop-inset mt-6 p-4">
              <p className="caps-sm t-faint">{t('tarot.todo')}</p>
              <p className="mt-1.5 whitespace-pre-line text-meta t-body">{todo}</p>
              {card.remedy && (
                <p className="mt-3 whitespace-pre-line text-meta t-sub">{card.remedy}</p>
              )}
            </div>
          )}

          {!sheetOnly && <p className="mt-6 text-center text-meta t-faint">{t('tarot.prompt')}</p>}
        </div>
      )}
    </>
  )
}
