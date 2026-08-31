/**
 * Hindi and English, one key at a time.
 *
 * Keyed by string id, with both languages side by side rather than two parallel
 * files. A missing `hi` is a *valid* state — `t()` falls back to `en` — so the
 * app is never half-broken while the dictionary fills in, and a reviewer can
 * see what still needs a translator without diffing two files.
 *
 * WHAT IS AND IS NOT IN HERE. This covers UI chrome: navigation, buttons,
 * labels, section headings — the words that make the app feel like it is in
 * your language. It does **not** cover the editorial copy in `mock.js`: the
 * readings, the card meanings, the consultant bios. That copy is most of the
 * product's character and machine-translating it would wreck the voice rule at
 * the top of `mock.js`. It needs a person who can write the same blunt register
 * in Hindi.
 *
 * Content that lives in `mock.js` and *is* translated carries its own `Hi`
 * twin on the record (`nameHi`, `traditionHi`) rather than a key in here, so a
 * new deity arrives with its own Hindi name instead of needing an edit in two
 * files.
 *
 * The Sanskrit on a tarot card is never translated. It is not English text in
 * need of a Hindi version; it is the verse.
 */
export const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
]

export const strings = {
  // ── Navigation ───────────────────────────────────────────────────────────
  'nav.home': { en: 'Home', hi: 'होम' },
  'nav.pooja': { en: 'Pooja', hi: 'पूजा' },
  'nav.consult': { en: 'Consult', hi: 'परामर्श' },
  'nav.shop': { en: 'Shop', hi: 'दुकान' },
  'nav.academy': { en: 'Academy', hi: 'अकादमी' },
  'nav.studio': { en: 'Studio', hi: 'स्टूडियो' },
  'nav.goLive': { en: 'Go Live', hi: 'लाइव जाएं' },
  'nav.earnings': { en: 'Earnings', hi: 'कमाई' },
  'nav.profile': { en: 'Profile', hi: 'प्रोफ़ाइल' },

  // ── Common actions ───────────────────────────────────────────────────────
  'a.close': { en: 'Close', hi: 'बंद करें' },
  'a.back': { en: 'Back', hi: 'वापस' },
  'a.messages': { en: 'Messages', hi: 'संदेश' },
  'a.yourProfile': { en: 'Your profile', hi: 'आपकी प्रोफ़ाइल' },
  'a.addMoney': { en: 'Add money', hi: 'पैसे जोड़ें' },
  'a.free': { en: 'Free · no session needed', hi: 'निःशुल्क · सत्र की ज़रूरत नहीं' },

  // ── Free tools on Home ───────────────────────────────────────────────────
  'tool.horoscope': { en: 'Horoscope', hi: 'राशिफल' },
  'tool.ai': { en: 'Ask AI', hi: 'AI से पूछें' },
  'tool.tarot': { en: 'Tarot', hi: 'टैरो' },
  'tool.match': { en: 'Matching', hi: 'मिलान' },

  // ── Mandir ───────────────────────────────────────────────────────────────
  'puja.tag': { en: 'e-puja', hi: 'ई-पूजा' },
  'puja.bell': { en: 'Bell', hi: 'घंटी' },
  'puja.flowers': { en: 'Flowers', hi: 'पुष्प' },
  'puja.diya': { en: 'Diya', hi: 'दीया' },
  'puja.dhoop': { en: 'Dhoop', hi: 'धूप' },
  'puja.aarti': { en: 'Aarti', hi: 'आरती' },
  'puja.endAarti': { en: 'End aarti', hi: 'आरती समाप्त' },
  'puja.sangeet': { en: 'Sangeet', hi: 'संगीत' },
  'puja.chooseMurti': { en: 'Choose a murti', hi: 'मूर्ति चुनें' },
  'puja.murti': { en: 'murti', hi: 'मूर्ति' },
  'puja.rung': { en: 'Ghanti rung', hi: 'घंटी बजी' },
  'puja.offered': { en: 'Pushpanjali offered', hi: 'पुष्पांजलि अर्पित' },
  'puja.diyaLit': { en: 'Diya lit', hi: 'दीया जलाया' },
  'puja.dhoopLit': { en: 'Dhoop lit', hi: 'धूप जलाई' },
  'puja.aartiBegun': { en: 'Aarti begun', hi: 'आरती आरंभ' },
  'puja.aartiEnded': { en: 'Aarti ended', hi: 'आरती समाप्त' },
  'puja.noAudio': {
    en: 'Sangeet — prototype has no audio',
    hi: 'संगीत — प्रोटोटाइप में ध्वनि नहीं है',
  },

  // ── Tarot ────────────────────────────────────────────────────────────────
  'tarot.title': { en: 'Tarot', hi: 'टैरो' },
  'tarot.hold': {
    en: 'Hold the question you actually came with. Not the tidy version.',
    hi: 'वही प्रश्न मन में रखें जिसे लेकर आप आए हैं। सजाया हुआ नहीं।',
  },
  'tarot.pull': { en: 'Pull a card', hi: 'एक कार्ड निकालें' },
  'tarot.another': { en: 'Another', hi: 'एक और' },
  'tarot.topUp': { en: 'Top up to pull', hi: 'निकालने के लिए पैसे जोड़ें' },
  'tarot.askReader': { en: 'Ask a reader', hi: 'पाठक से पूछें' },
  'tarot.shloka': { en: 'Shloka', hi: 'श्लोक' },
  'tarot.askYourself': { en: 'Ask yourself', hi: 'स्वयं से पूछें' },
  'tarot.remedy': { en: 'Remedy', hi: 'उपाय' },
  'tarot.freeLeft': { en: 'free left this week', hi: 'इस सप्ताह निःशुल्क शेष' },
  'tarot.aCard': { en: 'a card', hi: 'प्रति कार्ड' },
  'tarot.freeUsed': {
    en: 'Free cards used · ₹{price} each after that',
    hi: 'निःशुल्क कार्ड समाप्त · उसके बाद ₹{price} प्रति कार्ड',
  },
  'tarot.lastFree': { en: 'Your last free card this week', hi: 'इस सप्ताह का अंतिम निःशुल्क कार्ड' },
  'tarot.oneMore': { en: 'Free card · one more this week', hi: 'निःशुल्क कार्ड · इस सप्ताह एक और' },
  'tarot.prompt': {
    en: 'One card is a prompt, not a reading. A tarot reader will do the other twenty minutes.',
    hi: 'एक कार्ड संकेत है, पूरा पाठ नहीं। बाकी बीस मिनट एक टैरो पाठक ही देगा।',
  },
  'tarot.stuck': { en: 'Still stuck', hi: 'फिर भी उलझन है' },
  'tarot.askStars': { en: 'Ask the stars', hi: 'तारों से पूछें' },
  'tarot.notDecide': {
    en: 'A card will not decide it for you. Neither will a reader, but a reader will at least argue back.',
    hi: 'कार्ड आपके लिए तय नहीं करेगा। पाठक भी नहीं, पर पाठक कम से कम बहस तो करेगा।',
  },

  'tarot.whichDeck': { en: 'Which cards?', hi: 'कौन से कार्ड?' },
  'tarot.whichDeckNote': {
    en: 'Every tradition reads the same moment differently. Pick the one you keep.',
    hi: 'हर परंपरा एक ही क्षण को अलग ढंग से पढ़ती है। वह चुनें जो आपकी है।',
  },
  'tarot.thinkTitle': { en: 'Think of a question', hi: 'एक प्रश्न सोचें' },
  'tarot.thinkNote': {
    en: 'Do not type it. Hold it until the card is face up.',
    hi: 'लिखें नहीं। जब तक कार्ड सामने न आए, उसे मन में रखें।',
  },
  'tarot.changeDeck': { en: 'Change deck', hi: 'डेक बदलें' },
  'tarot.pullAgain': { en: 'Pull again', hi: 'फिर निकालें' },

  // ── Chart systems ────────────────────────────────────────────────────────
  'chart.vedic': { en: 'Vedic', hi: 'वैदिक' },
  'chart.south': { en: 'South Indian', hi: 'दक्षिण भारतीय' },
  'chart.western': { en: 'Western', hi: 'पाश्चात्य' },
  'chart.table': { en: 'Table', hi: 'सूची' },
  'chart.ascendant': { en: 'Ascendant', hi: 'लग्न' },
  'chart.northNote': {
    en: 'Houses are fixed; the number in each is its sign. House 1 is the top diamond.',
    hi: 'भाव स्थिर हैं; हर भाव में लिखी संख्या उसकी राशि है। पहला भाव ऊपर का कोण है।',
  },
  'chart.southNote': {
    en: 'Signs are fixed; the struck box is the ascendant, and houses count clockwise from it.',
    hi: 'राशियाँ स्थिर हैं; कटा हुआ खाना लग्न है, और भाव वहीं से दक्षिणावर्त गिने जाते हैं।',
  },
  'chart.westernNote': {
    en: 'One ring, twelve houses, read anticlockwise from the left.',
    hi: 'एक वृत्त, बारह भाव, बाएँ से वामावर्त पढ़ें।',
  },

  // ── Settings ─────────────────────────────────────────────────────────────
  'set.language': { en: 'Language', hi: 'भाषा' },
  'set.langNote': {
    en: 'Readings and card meanings stay in English for now.',
    hi: 'पाठ और कार्ड के अर्थ फ़िलहाल अंग्रेज़ी में ही रहेंगे।',
  },
}

/**
 * Look a key up, falling back to English, then to the key itself.
 *
 * Returning the key rather than empty string is deliberate: a missing entry
 * shows up as `tarot.pull` on screen, which is obvious in a screenshot. An
 * empty string is an invisible bug.
 *
 * `vars` does `{price}` substitution — the one bit of formatting needed so a
 * sentence with a number in it can be reordered by the translator instead of
 * being concatenated in the component, which no Hindi sentence survives.
 */
export function translate(lang, key, vars) {
  const entry = strings[key]
  let out = entry ? entry[lang] || entry.en : key
  if (vars) for (const k of Object.keys(vars)) out = out.replaceAll(`{${k}}`, vars[k])
  return out
}
