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
  'nav.bhakti': { en: 'Bhakti', hi: 'भक्ति' },
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
  'a.wallet': { en: 'Wallet', hi: 'वॉलेट' },
  'a.free': { en: 'Free · no session needed', hi: 'निःशुल्क · सत्र की ज़रूरत नहीं' },

  // ── Free tools on Home ───────────────────────────────────────────────────
  'tool.horoscope': { en: 'Horoscope', hi: 'राशिफल' },
  'tool.ai': { en: 'Namo AI', hi: 'नमो AI' },
  'tool.tarot': { en: 'Tarot', hi: 'टैरो' },
  'tool.match': { en: 'Matching', hi: 'मिलान' },
  'tool.muhurat': { en: 'Muhurat', hi: 'मुहूर्त' },
  'tool.numerology': { en: 'Numerology', hi: 'अंकशास्त्र' },

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
  'tarot.pull': { en: 'Pull a card', hi: 'एक कार्ड निकालें' },
  /* The reading waits behind one tap, under the card and its shloka
     (30 Sep 2026) — the card is looked at before it is explained. */
  'tarot.reveal': { en: 'Reveal my reading', hi: 'मेरा पाठ दिखाएँ' },
  'tarot.shloka': { en: 'Shloka', hi: 'श्लोक' },
  /* The last three steps of the pull, same labels for every deck. */
  'tarot.meaning': { en: 'What the card says', hi: 'कार्ड क्या कहता है' },
  'tarot.conclusion': { en: 'Where it lands', hi: 'निष्कर्ष' },
  'tarot.todo': { en: 'What to do', hi: 'क्या करें' },
  'tarot.freeLeft': { en: 'free left this week', hi: 'इस सप्ताह निःशुल्क शेष' },
  'tarot.aCard': { en: 'a card', hi: 'प्रति कार्ड' },
  'tarot.freeUsed': {
    en: 'Free cards used · ₹{price} each after that',
    hi: 'निःशुल्क कार्ड समाप्त · उसके बाद ₹{price} प्रति कार्ड',
  },
  'tarot.lastFree': { en: 'Your last free card this week', hi: 'इस सप्ताह का अंतिम निःशुल्क कार्ड' },
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
  /* Thought, not typed, since 30 Sep 2026 (owner's call): the dialog has
     no box. A single card answers a closed question, so it asks for one. */
  'tarot.askTitle': { en: 'Think of a question', hi: 'एक प्रश्न सोचें' },
  'tarot.askNote': {
    en: 'One that can be answered yes or no. Hold it in your mind, then pull.',
    hi: 'ऐसा प्रश्न जिसका उत्तर हाँ या ना में हो। उसे मन में रखें, फिर कार्ड निकालें।',
  },
  'tarot.reading': { en: 'Reading the card', hi: 'कार्ड पढ़ा जा रहा है' },

  // ── Settings ─────────────────────────────────────────────────────────────
  'set.language': { en: 'Language', hi: 'भाषा' },
  'set.langNote': {
    en: 'Readings and card meanings stay in English for now.',
    hi: 'पाठ और कार्ड के अर्थ फ़िलहाल अंग्रेज़ी में ही रहेंगे।',
  },

  // ── Welcome: phone first, the one door in (3 Oct 2026) ───────────────────
  'w.title': {
    en: 'Your kundli, horoscope and astrologers — in one place',
    hi: 'आपकी कुंडली, राशिफल और ज्योतिषी — एक ही जगह',
  },
  'w.p.consult': { en: 'Talk to an astrologer', hi: 'ज्योतिषी से बात करें' },
  'w.p.horoscope': { en: 'Daily horoscope', hi: 'आज का राशिफल' },
  'w.p.darshan': { en: 'Darshan & aarti', hi: 'दर्शन और आरती' },
  'w.p.shop': { en: 'Puja samagri', hi: 'पूजा सामग्री' },
  'w.phone': { en: 'Mobile number', hi: 'मोबाइल नंबर' },
  'w.phoneHint': {
    en: 'New here or coming back — same number, same door. We text you a 6-digit code.',
    hi: 'नए हों या पुराने — बस अपना नंबर डालें। हम 6 अंकों का कोड भेजेंगे।',
  },
  'w.send': { en: 'Get code', hi: 'कोड पाएं' },
  'w.sending': { en: 'Sending…', hi: 'भेज रहे हैं…' },
  'w.codeTo': { en: 'Enter the code sent to {phone}', hi: '{phone} पर भेजा गया कोड डालें' },
  'w.code': { en: '6-digit code', hi: '6 अंकों का कोड' },
  'w.verify': { en: 'Verify & continue', hi: 'पुष्टि करें और आगे बढ़ें' },
  'w.verifying': { en: 'Checking…', hi: 'जांच रहे हैं…' },
  'w.change': { en: 'Change number', hi: 'नंबर बदलें' },
  'w.resendIn': { en: 'Resend code in {s}s', hi: '{s} सेकंड में दोबारा भेजें' },
  'w.resend': { en: 'Resend code', hi: 'कोड दोबारा भेजें' },
  'w.resent': { en: 'Sent again.', hi: 'दोबारा भेज दिया।' },
  'w.terms': {
    en: 'By continuing you agree to our',
    hi: 'आगे बढ़कर आप हमारी इन शर्तों से सहमत हैं:',
  },
  'w.termsLink': { en: 'Terms', hi: 'शर्तें' },
  'w.privacyLink': { en: 'Privacy', hi: 'गोपनीयता' },
  'w.consultant': { en: 'Are you an astrologer? Join as a consultant', hi: 'क्या आप ज्योतिषी हैं? परामर्शदाता के रूप में जुड़ें' },

  // ── About you: every birth detail on one page (3 Oct 2026) ───────────────
  'd.title': { en: 'A little about you', hi: 'अपने बारे में बताएं' },
  'd.hint': {
    en: 'Your kundli is made from these. You can change them later in Profile.',
    hi: 'आपकी कुंडली इन्हीं से बनती है। बाद में प्रोफ़ाइल से बदल सकते हैं।',
  },
  'd.editHint': {
    en: 'Your kundli is made from these. Change one and every chart is redrawn.',
    hi: 'आपकी कुंडली इन्हीं से बनती है। कुछ भी बदलें, हर चार्ट फिर से बनेगा।',
  },
  'd.editTitle': { en: 'Edit birth details', hi: 'जन्म विवरण बदलें' },
  'd.name': { en: 'Your name', hi: 'आपका नाम' },
  'd.namePh': { en: 'Full name', hi: 'पूरा नाम' },
  'd.gender': { en: 'Gender', hi: 'लिंग' },
  'd.male': { en: 'Male', hi: 'पुरुष' },
  'd.female': { en: 'Female', hi: 'महिला' },
  'd.other': { en: 'Other', hi: 'अन्य' },
  'd.date': { en: 'Date of birth', hi: 'जन्म तिथि' },
  'd.time': { en: 'Time of birth', hi: 'जन्म समय' },
  'd.timeUnknown': { en: "I don't know my birth time", hi: 'मुझे जन्म का समय नहीं पता' },
  'd.timeUnknownNote': {
    en: 'You still get your planets and moon sign. Lagna and houses appear once you add the time.',
    hi: 'ग्रह और चंद्र राशि फिर भी मिलेंगे। लग्न और भाव समय जोड़ने पर दिखेंगे।',
  },
  'd.place': { en: 'Place of birth', hi: 'जन्म स्थान' },
  'd.placePh': { en: 'Search city, town or village', hi: 'शहर, कस्बा या गाँव खोजें' },
  'd.email': { en: 'Email · optional', hi: 'ईमेल · वैकल्पिक' },
  'd.referral': { en: 'Have a referral code?', hi: 'रेफ़रल कोड है?' },
  'd.save': { en: 'Make my kundli', hi: 'मेरी कुंडली बनाएं' },
  'd.saveEdit': { en: 'Save', hi: 'सेव करें' },
  'd.saving': { en: 'Saving…', hi: 'सेव हो रहा है…' },
  'd.missing': { en: 'Fill in: {list}', hi: 'भरें: {list}' },

  // ── The one-time reveal after sign-up ────────────────────────────────────
  'r.making': { en: 'Making your kundli…', hi: 'आपकी कुंडली बन रही है…' },
  'r.ready': { en: 'Welcome, {name}', hi: 'स्वागत है, {name}' },
  'r.readySub': { en: 'Your kundli is ready', hi: 'आपकी कुंडली तैयार है' },
  'r.sun': { en: 'Sun', hi: 'सूर्य' },
  'r.moon': { en: 'Moon', hi: 'चंद्र' },
  'r.rising': { en: 'Lagna', hi: 'लग्न' },
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
