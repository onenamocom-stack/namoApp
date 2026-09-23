import { useEffect, useState } from 'react'
import { tarotDecks } from '../data/mock.js'
import { TopBar } from '../components/Chrome.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopButton, PopCard, PopTag } from '../components/Pop.jsx'
import { Stub } from '../components/Primitives.jsx'
import { priceLabel, pullCard, tarotState } from '../lib/tarot.js'
import { useStore } from '../store.jsx'

/**
 * Tarot — a guided pull, then the card read against what was asked.
 *
 *   deck → question → (pull) → the reading
 *
 * **The question is typed now, and that reverses the rule this screen was
 * built on.** It used to say: "Nothing is typed: the question stays in
 * their head, which is the whole ritual." That was right while a card
 * answered with a line written months earlier — asking somebody to type
 * into a box that changed nothing would have been theatre. It is wrong
 * now. The reading is written for the question, so the question has to
 * reach the reader (24 Sep 2026, and the partner's flow).
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
const MAX_QUESTION = 200

export default function Tarot() {
  const { showToast, session, sessionReady, lang, t } = useStore()
  const [deck, setDeck] = useState(null)
  const [question, setQuestion] = useState('')
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
    const res = await pullCard({ deck: deck.key, question: question.trim() })
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
            question={question}
            deck={deck}
            tradition={tradition}
            onAgain={() => { setResult(null); setQuestion(''); setStep('question') }}
            onChangeDeck={() => { setResult(null); setQuestion(''); setStep('deck') }}
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

      <section className="border-t border-rule px-5 py-6">
        <Kicker action={t('tarot.askStars')} to="/ask">
          {t('tarot.stuck')}
        </Kicker>
        <p className="mt-2 text-meta t-body">{t('tarot.notDecide')}</p>
      </section>

      <div className="h-8" />

      {step === 'deck' && !result && (
        <Dialog title={t('tarot.whichDeck')} note={t('tarot.whichDeckNote')}>
          <ul className="space-y-2">
            {tarotDecks.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => { setDeck(d); setStep('question') }}
                  className="pop-tap w-full rounded-2xl px-4 py-3.5 text-left"
                >
                  <span className="flex items-baseline gap-3">
                    <span className="caps-sm flex-none gold">{tradition(d)}</span>
                    <span className="min-w-0 flex-1 text-meta t-body">{d.name}</span>
                  </span>
                  <span className="mt-1.5 block caps-sm t-faint">{d.line}</span>
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
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value.slice(0, MAX_QUESTION))}
            rows={3}
            autoFocus
            placeholder={t('tarot.askPlaceholder')}
            aria-label={t('tarot.askTitle')}
            className="w-full resize-none border-b border-rule bg-transparent pb-2 text-body outline-none transition-colors placeholder:text-t4 focus:border-gold t-sub"
          />
          <p className="mt-2 text-right caps-sm t-faint tnum">
            {question.length}/{MAX_QUESTION}
          </p>

          <PopButton
            variant="gold"
            className="mt-4"
            disabled={!question.trim() || pulling}
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

/**
 * The card that came up, then what it says about the question.
 *
 * Six steps, and the last three are this component: **meaning → conclusion
 * → what to do** (agreed with the partner, 24 Sep 2026). The layout is the
 * same for every deck, so a seeker who learns one learns all of them.
 *
 * **A deck whose cards carry their own words wins the last two.** The
 * Bhaktamar cards have a remedy written in the tradition, and a conclusion
 * column is coming; where the card has text, the card's text is what shows,
 * and the model's fills the gap until then. The meaning is always written
 * for the question — that is the part a pre-written line cannot do.
 *
 * The shloka is not a reading at all: it belongs to the card and it is the
 * tradition's words (`src/data/bhaktamar.js` — never rewritten).
 */
function Card({ card, reading, verdict, question, deck, tradition, onAgain, onChangeDeck }) {
  const { t } = useStore()
  const [artFailed, setArtFailed] = useState(false)
  const hasArt = Boolean(card.img) && !artFailed

  const conclusion = card.conclusion || reading.conclusion
  const todo = card.remedy || reading.todo

  return (
    <>
      <PopCard raised className="overflow-hidden">
        {hasArt ? (
          /* The file sits in public/, so BASE_URL resolves it — this app is
             served from a sub-path on GitHub Pages. A deck whose art has
             not been added yet falls back to the plate below. */
          <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#e8e2d8]">
            <img
              src={`${import.meta.env.BASE_URL}cards/${card.img}`}
              alt={card.name}
              onError={() => setArtFailed(true)}
              className="h-full w-full object-cover"
            />
            <span className="absolute left-3 top-3">
              <PopTag>{tradition(deck)}</PopTag>
            </span>
            {card.no && (
              <span className="absolute right-3 top-3">
                <PopTag tone="gold">{card.no}</PopTag>
              </span>
            )}
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
      </PopCard>

      {/* The card's name, and for the yes/no deck its answer — which is the
          whole reason that deck exists, so it leads. */}
      <div className="pop-inset mt-4 p-5 text-center">
        {verdict && <p className="text-title font-light">{verdict}</p>}
        <p className={`caps-sm gold ${verdict ? 'mt-3' : ''}`}>{card.name}</p>
        {card.sub && <p className="mt-1.5 text-meta t-faint">{card.sub}</p>}
      </div>

      {/* What was asked, quoted back small. Without it a reading read later
          is a paragraph with no question attached to it. */}
      {question && (
        <p className="mt-5 text-center text-meta t-faint">“{question}”</p>
      )}

      {/* 4 · what the card means for what was asked */}
      {reading.meaning && (
        <div className="mt-4">
          <p className="caps-sm t-faint">{t('tarot.meaning')}</p>
          <p className="mt-2 whitespace-pre-line text-read t-heading">{reading.meaning}</p>
        </div>
      )}

      {/* 5 · where it lands */}
      {conclusion && (
        <div className="mt-6">
          <p className="caps-sm t-faint">{t('tarot.conclusion')}</p>
          <p className="mt-2 whitespace-pre-line text-read t-sub">{conclusion}</p>
        </div>
      )}

      {/* 6 · the one thing to do. Raised, because it is the only part that
             asks for something. */}
      {todo && (
        <div className="pop-inset mt-6 p-4">
          <p className="caps-sm t-faint">{t('tarot.todo')}</p>
          <p className="mt-1.5 whitespace-pre-line text-meta t-body">{todo}</p>
        </div>
      )}

      {/* The verse comes off the face of the card itself, after the reading:
          the shloka is the card, the reading is what it says today. */}
      {card.sa && (
        <PopCard className="mt-5 p-5">
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
        </PopCard>
      )}

      <PopButton variant="gold" className="mt-6" to="/consult">
        {t('tarot.askReader')}
      </PopButton>

      <div className="mt-3 flex items-center gap-2">
        <PopButton variant="ghost" className="flex-1" full={false} onClick={onAgain}>
          {t('tarot.pullAgain')}
        </PopButton>
        <PopButton variant="ghost" className="flex-1" full={false} onClick={onChangeDeck}>
          {t('tarot.changeDeck')}
        </PopButton>
      </div>

      <p className="mt-6 text-center text-meta t-faint">{t('tarot.prompt')}</p>
    </>
  )
}
