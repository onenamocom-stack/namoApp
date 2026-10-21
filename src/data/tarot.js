// The tarot decks, out of mock.js (21 Oct 2026) so the Bhaktamar text loads
// with the Tarot screen and not with every first page. Voice rules: mock.js.

import { bhaktamarCards } from './bhaktamar.js'
import { yesNoCards } from './yesno.js'

/* ==========================================================================
   TAROT - two free pulls a week, then priced per card.

   THE PRICE AND THE FREE COUNT ARE NOT HERE ANY MORE, since 24 Sep 2026.
   Both are the server's (TAROT_PRICE_PAISE, TAROT_FREE_WEEKLY) and arrive
   on the pull's response. A price the client holds is a price the client
   can be wrong about, and a free count the client holds was unlimited: the
   two flags that held it did not survive a reload.
   ========================================================================== */

/**
 * Three decks, as of 24 Sep 2026. Rider-Waite, Sufi Path and Lotus Path are
 * deleted: each was six authored lines with no art, and the pull is a real
 * reading now rather than a line lookup, so a deck with nothing painted
 * behind it is a name in a list.
 *
 * `key` is what the SERVER knows the deck by. It draws the card — the
 * client sends a deck and a question and nothing else (rule 3), so the
 * card list here exists to render art and a name, never to choose.
 *
 * `img` files live in `public/cards/`. Bhaktamar's 48 are there; the other
 * two decks name theirs on the same pattern and fall back to a plate until
 * the files are dropped in, so adding art is a copy, not a code change.
 */
export const tarotDecks = [
  {
    id: 'dk5', key: 'bhaktamar', name: 'Bhaktamar', tradition: 'Jain', traditionHi: 'जैन',
    line: 'Forty-eight cards, one for each shloka of the stotra. The only deck here with a painted face.',
    cards: bhaktamarCards,
  },
  /* The Vedic Kipper six are not here yet: the faces are being drawn, and a
     deck in the picker with no art behind it is a promise the screen cannot
     keep. The card list is in backend-django/apps/ai/tarot_decks.py, out of
     the live map, waiting for the same day. */
  {
    id: 'dk6', key: 'yesno', name: 'Yes or No', tradition: 'Classical', traditionHi: 'शास्त्रीय',
    line: 'Twenty-seven cards for a closed question. Nine say yes, nine say no, nine say wait.',
    cards: yesNoCards,
  },
]
