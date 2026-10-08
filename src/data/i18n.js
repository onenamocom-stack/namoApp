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
  'a.all': { en: 'All', hi: 'सभी' },
  'a.min': { en: '{n} min', hi: '{n} मिनट' },
  'a.loading': { en: 'Loading…', hi: 'लोड हो रहा है…' },
  /* Tarot asked for this before it existed, and printed the key itself. */
  'a.signIn': { en: 'Sign in', hi: 'साइन इन करें' },
  'a.addBirth': { en: 'Add your birth details', hi: 'अपना जन्म विवरण जोड़ें' },
  'a.further': { en: 'Take it further', hi: 'आगे बढ़ें' },

  // ── Rows that appear on more than one screen ─────────────────────────────
  'row.chart': { en: 'Your full chart', hi: 'आपकी पूरी कुंडली' },
  'row.muhuratNote': { en: 'When to start something that matters', hi: 'ज़रूरी काम कब शुरू करें' },

  // ── The twelve rashis, as chips and in headings ──────────────────────────
  /* Display only. The English name is still what goes to the API. */
  'sign.Aries': { en: 'Aries', hi: 'मेष' },
  'sign.Taurus': { en: 'Taurus', hi: 'वृषभ' },
  'sign.Gemini': { en: 'Gemini', hi: 'मिथुन' },
  'sign.Cancer': { en: 'Cancer', hi: 'कर्क' },
  'sign.Leo': { en: 'Leo', hi: 'सिंह' },
  'sign.Virgo': { en: 'Virgo', hi: 'कन्या' },
  'sign.Libra': { en: 'Libra', hi: 'तुला' },
  'sign.Scorpio': { en: 'Scorpio', hi: 'वृश्चिक' },
  'sign.Sagittarius': { en: 'Sagittarius', hi: 'धनु' },
  'sign.Capricorn': { en: 'Capricorn', hi: 'मकर' },
  'sign.Aquarius': { en: 'Aquarius', hi: 'कुंभ' },
  'sign.Pisces': { en: 'Pisces', hi: 'मीन' },

  // ── Home ─────────────────────────────────────────────────────────────────
  /* The two Hindi tab names were Hindi in English too (owner's call, 30 Sep). */
  'home.tab.feed': { en: 'Reels', hi: 'रील्स' },
  'home.tab.today': { en: 'आज का पंचांग', hi: 'आज का पंचांग' },
  'home.tab.darshan': { en: 'आज के दर्शन', hi: 'आज के दर्शन' },
  'home.end': { en: "End of today's feed", hi: 'आज की फ़ीड यहीं तक' },
  'home.reshared': {
    en: 'Reshared to your profile and the feed',
    hi: 'आपकी प्रोफ़ाइल और फ़ीड में रीशेयर हो गया',
  },
  'home.reshareRemoved': { en: 'Reshare removed', hi: 'रीशेयर हटा दिया' },
  'home.saved': { en: 'Saved to your reading list', hi: 'आपकी रीडिंग लिस्ट में सेव हो गया' },
  'home.unsaved': { en: 'Removed from your reading list', hi: 'रीडिंग लिस्ट से हटा दिया' },
  'home.like1': { en: '{n} like', hi: '{n} लाइक' },
  'home.likes': { en: '{n} likes', hi: '{n} लाइक' },
  'home.view1': { en: '{n} view', hi: '{n} व्यू' },
  'home.views': { en: '{n} views', hi: '{n} व्यू' },
  'home.reshare1': { en: '{n} reshare', hi: '{n} रीशेयर' },
  'home.reshares': { en: '{n} reshares', hi: '{n} रीशेयर' },
  'home.more': { en: 'more', hi: 'और पढ़ें' },
  'home.comment1': { en: 'View 1 comment', hi: '1 कमेंट देखें' },
  'home.comments': { en: 'View all {n} comments', hi: 'सभी {n} कमेंट देखें' },
  'home.product1': { en: 'Product in this post', hi: 'इस पोस्ट में प्रोडक्ट' },
  'home.products': { en: '{n} products in this post', hi: 'इस पोस्ट में {n} प्रोडक्ट' },
  'home.off': { en: '{n}% off', hi: '{n}% छूट' },
  'home.resharedBy': { en: '{name} reshared', hi: '{name} ने रीशेयर किया' },
  'home.readingSky': { en: 'Reading the sky.', hi: 'आकाश पढ़ा जा रहा है।' },
  'home.windowsUjjain': { en: 'Windows · Ujjain', hi: 'शुभ-अशुभ समय · उज्जैन' },
  'home.ownPredictions': {
    en: 'Your own predictions, from your birth',
    hi: 'आपके जन्म से बनी, आपकी अपनी भविष्यवाणियाँ',
  },
  'home.panchang': { en: "Today's panchang", hi: 'आज का पंचांग' },
  'home.workingDay': { en: 'Working out the day.', hi: 'दिन की गणना हो रही है।' },
  'home.samvat': { en: 'VS {n}', hi: 'वि.सं. {n}' },
  'home.computedAt': { en: 'Computed at {city}', hi: '{city} के अनुसार गणना' },
  'home.publishedArticle': { en: 'published an article', hi: 'ने एक लेख प्रकाशित किया' },
  'home.readArticle': { en: 'Read article · {n} min', hi: 'लेख पढ़ें · {n} मिनट' },
  'home.namoAcademy': { en: 'Namo Academy', hi: 'नमो अकादमी' },
  'home.continueLearning': { en: 'Continue learning', hi: 'सीखना जारी रखें' },
  'home.resume': { en: 'Resume · {n}% done', hi: 'जारी रखें · {n}% पूरा' },
  'home.startCourse': { en: 'Start course', hi: 'कोर्स शुरू करें' },
  'home.lessons': { en: '{n} lessons', hi: '{n} पाठ' },
  'home.namoShop': { en: 'Namo Shop', hi: 'नमो शॉप' },
  'home.forChart': { en: 'For your chart', hi: 'आपकी कुंडली के लिए' },
  'home.addToCart': { en: 'Add to cart · ₹{price}', hi: 'कार्ट में डालें · ₹{price}' },

  // ── Panchang labels (Home's Today tab) ───────────────────────────────────
  'pc.tithi': { en: 'Tithi', hi: 'तिथि' },
  'pc.nakshatra': { en: 'Nakshatra', hi: 'नक्षत्र' },
  'pc.yoga': { en: 'Yoga', hi: 'योग' },
  'pc.karana': { en: 'Karana', hi: 'करण' },
  'pc.moon': { en: 'Moon', hi: 'चंद्र' },
  'pc.paksha': { en: 'Paksha', hi: 'पक्ष' },
  'pc.rahuKaal': { en: 'Rahu kaal', hi: 'राहु काल' },
  'pc.sunrise': { en: 'Sunrise {time}', hi: 'सूर्योदय {time}' },
  'pc.sunset': { en: 'Sunset {time}', hi: 'सूर्यास्त {time}' },

  // ── Horoscope (and the reading layout /chart shares) ─────────────────────
  'hs.title': { en: 'Daily horoscope', hi: 'दैनिक राशिफल' },
  'hs.moonSign': { en: '{sign} moon', hi: 'चंद्र राशि {sign}' },
  'hs.yours': { en: 'yours', hi: 'आपकी' },
  'hs.day.yesterday': { en: 'Yesterday', hi: 'बीता कल' },
  'hs.day.today': { en: 'Today', hi: 'आज' },
  'hs.day.tomorrow': { en: 'Tomorrow', hi: 'आने वाला कल' },
  'hs.reading': { en: 'Reading {sign} for {date}.', hi: '{date} के लिए {sign} का राशिफल पढ़ा जा रहा है।' },
  'hs.glance': { en: 'Day at a glance', hi: 'दिन एक नज़र में' },
  'hs.overall': { en: 'Overall', hi: 'कुल मिलाकर' },
  'hs.doDont': { en: "Do / Don't", hi: 'क्या करें / क्या न करें' },
  'hs.do': { en: 'Do', hi: 'करें' },
  'hs.dont': { en: "Don't", hi: 'न करें' },
  'hs.windows': { en: 'Windows', hi: 'शुभ-अशुभ समय' },
  'hs.windowsNote': {
    en: 'Auspicious first, then the three to work around.',
    hi: 'पहले शुभ समय, फिर वे तीन जिनसे बचकर चलें।',
  },
  'hs.clockFor': { en: 'Clock times for {place}.', hi: 'समय {place} के अनुसार है।' },
  'hs.powerPressure': { en: 'Power & pressure', hi: 'ताक़त और दबाव' },
  'hs.power': { en: 'Power', hi: 'ताक़त' },
  'hs.pressure': { en: 'Pressure', hi: 'दबाव' },
  'hs.areas': { en: 'Read across {n} areas', hi: '{n} क्षेत्रों में आकलन' },
  'hs.moving': { en: 'What is moving', hi: 'ग्रहों की चाल' },
  'hs.atLength': { en: 'At length', hi: 'विस्तार से' },
  'hs.sitWith': { en: 'Sit with this', hi: 'इस पर सोचें' },
  'hs.yourOwn': { en: 'Your own', hi: 'आपका अपना' },
  'hs.yourOwnNote': {
    en: "This is {sign}'s reading, the same for everyone born with the Moon there. Yours, from the minute and place you were born, is in your chart.",
    hi: 'यह {sign} राशि का राशिफल है, जो उन सबके लिए एक जैसा है जिनका चंद्रमा इस राशि में है। आपका अपना, आपके जन्म के ठीक समय और स्थान से बना, आपकी कुंडली में है।',
  },
  'hs.predictions': { en: 'Your predictions', hi: 'आपकी भविष्यवाणियाँ' },
  'hs.chartNote': { en: 'D1 and every divisional chart', hi: 'D1 और हर वर्ग कुंडली' },
  'hs.askAstrologer': { en: 'Or ask an astrologer', hi: 'या किसी ज्योतिषी से पूछें' },

  // ── Free tools on Home ───────────────────────────────────────────────────
  'tool.horoscope': { en: 'Horoscope', hi: 'राशिफल' },
  'tool.ai': { en: 'Namo AI', hi: 'नमो AI' },
  'tool.tarot': { en: 'Tarot', hi: 'टैरो' },
  'tool.match': { en: 'Matching', hi: 'मिलान' },
  'tool.muhurat': { en: 'Muhurat', hi: 'मुहूर्त' },

  // ── Mandir ───────────────────────────────────────────────────────────────
  'puja.bell': { en: 'Bell', hi: 'घंटी' },
  'puja.flowers': { en: 'Flowers', hi: 'पुष्प' },
  'puja.diya': { en: 'Diya', hi: 'दीया' },
  'puja.dhoop': { en: 'Dhoop', hi: 'धूप' },
  'puja.aarti': { en: 'Aarti', hi: 'आरती' },
  'puja.endAarti': { en: 'End aarti', hi: 'आरती समाप्त' },
  'puja.sangeet': { en: 'Sangeet', hi: 'संगीत' },
  'puja.chooseMurti': { en: 'Choose a murti', hi: 'मूर्ति चुनें' },
  'puja.touchHint': { en: 'Touch the ghanti, diya, dhoop or flowers to offer', hi: 'अर्पण के लिए घंटी, दीया, धूप या पुष्प को छुएँ' },
  'puja.mandirOf': { en: 'Shri {name} Mandir', hi: 'श्री {name} मंदिर' },
  'puja.forDeity': { en: 'For {name}', hi: '{name} के लिए' },
  'puja.murti': { en: 'murti', hi: 'मूर्ति' },
  'puja.rung': { en: 'Ghanti rung', hi: 'घंटी बजी' },
  'puja.offered': { en: 'Pushpanjali offered', hi: 'पुष्पांजलि अर्पित' },
  'puja.diyaLit': { en: 'Diya lit', hi: 'दीया जलाया' },
  'puja.dhoopLit': { en: 'Dhoop lit', hi: 'धूप जलाई' },
  'puja.aartiBegun': { en: 'Aarti begun', hi: 'आरती आरंभ' },
  'puja.aartiEnded': { en: 'Aarti ended', hi: 'आरती समाप्त' },
  'puja.bhajans': { en: 'Bhajans', hi: 'भजन' },
  'puja.mantras': { en: 'Mantras', hi: 'मंत्र' },
  'puja.nowPlaying': { en: 'Now playing', hi: 'अभी बज रहा है' },
  'puja.stopMusic': { en: 'Stop', hi: 'बंद करें' },
  'puja.loadingMusic': { en: 'Loading…', hi: 'लोड हो रहा है…' },
  'puja.noMusic': { en: 'Nothing here yet.', hi: 'अभी यहाँ कुछ नहीं है।' },
  'puja.cantPlay': { en: 'Could not play that. Try again.', hi: 'चल नहीं पाया। फिर कोशिश करें।' },

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

  // ── Profile ──────────────────────────────────────────────────────────────
  'prof.tab.overview': { en: 'Overview', hi: 'सारांश' },
  'prof.tab.settings': { en: 'Settings', hi: 'सेटिंग्स' },
  'prof.member': { en: 'Member', hi: 'सदस्य' },
  'prof.picUpdated': { en: 'Picture updated', hi: 'फ़ोटो बदल गई' },
  'prof.picFailed': { en: 'Could not update that picture.', hi: 'यह फ़ोटो नहीं बदल सकी।' },
  'prof.download': { en: 'Download', hi: 'डाउनलोड' },
  'prof.share': { en: 'Share', hi: 'शेयर' },
  'prof.pdfDone': { en: 'Kundli PDF downloaded', hi: 'कुंडली PDF डाउनलोड हो गई' },
  'prof.linkCopied': { en: 'Chart link copied', hi: 'कुंडली का लिंक कॉपी हो गया' },
  'prof.birthData': { en: 'Birth data', hi: 'जन्म विवरण' },
  'prof.date': { en: 'Date', hi: 'तारीख़' },
  'prof.time': { en: 'Time', hi: 'समय' },
  'prof.place': { en: 'Place', hi: 'स्थान' },
  'prof.notKnown': { en: 'Not known', hi: 'पता नहीं' },
  'prof.everythingElse': { en: 'Everything else', hi: 'और भी' },
  'prof.chartNote': { en: 'Nine placements, plainly written', hi: 'नौ ग्रह, सीधी भाषा में' },
  'prof.matchNote': { en: 'Two charts read against each other', hi: 'दो कुंडलियों का आपस में मिलान' },
  'prof.reports': { en: 'Reports', hi: 'रिपोर्ट' },
  'prof.reportsNote': { en: 'Long-form readings, written once', hi: 'विस्तृत रिपोर्ट, एक बार में लिखी' },
  'prof.premium': { en: 'Premium', hi: 'प्रीमियम' },
  'prof.premiumNote': { en: 'Eros, packs and more questions', hi: 'Eros, पैक और ज़्यादा सवाल' },
  'prof.academyNote': { en: 'Courses, events and e-books', hi: 'कोर्स, इवेंट और ई-बुक' },
  'prof.askStars': { en: 'Ask the Stars', hi: 'तारों से पूछें' },
  'prof.inCart': { en: '{n} in cart', hi: 'कार्ट में {n}' },
  'prof.historyProto': { en: 'Full history — prototype only', hi: 'पूरा इतिहास — अभी सिर्फ़ प्रोटोटाइप' },
  'prof.pastSessions': { en: 'Past sessions', hi: 'पिछले सत्र' },
  'prof.receipt': { en: 'Receipt · {name}', hi: 'रसीद · {name}' },
  'prof.newPost': { en: 'New post', hi: 'नई पोस्ट' },
  'prof.yourPosts': { en: 'Your posts', hi: 'आपकी पोस्ट' },
  'prof.counts': {
    en: '{posts} posts · {followers} followers · {following} following',
    hi: '{posts} पोस्ट · {followers} फ़ॉलोअर · {following} फ़ॉलोइंग',
  },
  'prof.blocked': {
    en: 'Your account is blocked, so you cannot post. Your earlier posts are hidden but nothing has been deleted. Write to us if you think this is wrong.',
    hi: 'आपका खाता ब्लॉक है, इसलिए आप पोस्ट नहीं कर सकते। आपकी पुरानी पोस्ट छिपी हैं, पर कुछ भी डिलीट नहीं हुआ है। अगर आपको लगता है कि यह गलत है, तो हमें लिखें।',
  },
  'prof.blog': { en: 'Blog', hi: 'ब्लॉग' },
  'prof.photo': { en: 'Photo', hi: 'फ़ोटो' },
  'prof.noPosts': {
    en: 'Nothing yet. A photo or something you wrote — it goes in the feed under your name.',
    hi: 'अभी कुछ नहीं। कोई फ़ोटो या आपका लिखा कुछ — वह आपके नाम से फ़ीड में जाएगा।',
  },
  'prof.preferences': { en: 'Preferences', hi: 'पसंद' },
  'prof.croppedOn': {
    en: 'Back to the cropped, screen-filling murti',
    hi: 'फिर से पूरी स्क्रीन भरने वाली, कटी हुई मूर्ति',
  },
  'prof.croppedOff': {
    en: 'Full deity image on — the murti will no longer be cropped',
    hi: 'पूरी मूर्ति चालू — अब मूर्ति कटेगी नहीं',
  },
  'prof.fullImage': { en: 'Full deity image', hi: 'पूरी मूर्ति' },
  'prof.fullImageNote': { en: 'Show the complete murti, uncropped', hi: 'पूरी मूर्ति दिखाएं, बिना काटे' },
  'prof.on': { en: 'On', hi: 'चालू' },
  'prof.off': { en: 'Off', hi: 'बंद' },
  'prof.set.language': { en: 'Language', hi: 'भाषा' },
  /* A prototype row: it names the language you are reading in. */
  'prof.set.languageVal': { en: 'English', hi: 'हिन्दी' },
  'prof.set.notifications': { en: 'Notifications', hi: 'सूचनाएं' },
  'prof.set.notificationsVal': { en: 'Daily at 08:00', hi: 'रोज़ 08:00 बजे' },
  'prof.set.privacy': { en: 'Privacy & data', hi: 'गोपनीयता और डेटा' },
  'prof.set.privacyVal': { en: 'On device', hi: 'डिवाइस पर' },
  'prof.set.help': { en: 'Help & support', hi: 'मदद और सहायता' },

  // ── Influencer tab (3 Oct 2026) ──
  'prof.tab.influencer': { en: 'Influencer', hi: 'इन्फ्लुएंसर' },
  // ── Profile, Instagram-shaped (4 Oct 2026) ──
  'prof.tab.posts': { en: 'Posts', hi: 'पोस्ट' },
  'prof.bioDefault': { en: 'Available', hi: 'उपलब्ध' },
  'a.cancel': { en: 'Cancel', hi: 'रद्द करें' },
  'prof.bioSave': { en: 'Save', hi: 'सेव करें' },
  'prof.tab.saved': { en: 'Saved', hi: 'सेव किए' },
  'prof.tab.kundli': { en: 'Kundli', hi: 'कुंडली' },
  'prof.posts': { en: 'Posts', hi: 'पोस्ट' },
  'prof.followers': { en: 'Followers', hi: 'फ़ॉलोअर' },
  'prof.following': { en: 'Following', hi: 'फ़ॉलो कर रहे' },
  'prof.noFollowers': { en: 'Nobody follows you yet.', hi: 'अभी आपको कोई फ़ॉलो नहीं करता।' },
  'prof.noFollowing': { en: 'You follow nobody yet. Follow an astrologer from their post.', hi: 'आप अभी किसी को फ़ॉलो नहीं करते। किसी ज्योतिषी की पोस्ट से फ़ॉलो करें।' },
  'prof.consultant': { en: 'Astrologer', hi: 'ज्योतिषी' },
  'prof.bioAdd': { en: 'Write about yourself', hi: 'अपने बारे में लिखें' },
  'prof.bioPh': { en: 'Who you are, what you believe, what you are looking for', hi: 'आप कौन हैं, क्या मानते हैं, क्या ढूंढ रहे हैं' },
  'prof.editProfile': { en: 'Edit profile', hi: 'प्रोफ़ाइल बदलें' },
  'prof.shareProfile': { en: 'Share profile', hi: 'प्रोफ़ाइल शेयर करें' },
  'prof.firstPostTitle': { en: 'Share your first post', hi: 'अपनी पहली पोस्ट शेयर करें' },
  'prof.firstPostNote': {
    en: 'A photo or a few lines. Tap + above; it shows here and in the feed.',
    hi: 'एक फ़ोटो या कुछ पंक्तियां। ऊपर + दबाएं; यह यहां और फ़ीड में दिखेगी।',
  },
  'prof.savedEmptyTitle': { en: 'Nothing saved yet', hi: 'अभी कुछ सेव नहीं किया' },
  'prof.savedEmpty': {
    en: 'Tap the bookmark on any post or reel to keep it here.',
    hi: 'किसी भी पोस्ट या रील पर बुकमार्क दबाएं, वह यहां रहेगी।',
  },
  'prof.openChart': { en: 'Open full chart', hi: 'पूरा चार्ट खोलें' },
  'prof.tools': { en: 'Your astrology', hi: 'आपकी ज्योतिष' },
  'prof.settingsTitle': { en: 'Settings', hi: 'सेटिंग्स' },
  'prof.walletNote': { en: 'Balance, add money, history', hi: 'बैलेंस, पैसे जोड़ें, इतिहास' },
  'prof.explore': { en: 'More from Namo', hi: 'Namo पर और' },
  'inf.yourCode': { en: 'Your code', hi: 'आपका कोड' },
  'inf.share': { en: 'Share your link', hi: 'अपना लिंक शेयर करें' },
  'inf.how': {
    en: 'Anyone who opens your link has your code filled in when they sign up. They can also type the code themselves.',
    hi: 'जो भी आपका लिंक खोलेगा, साइन-अप पर आपका कोड अपने-आप भर जाएगा। वे कोड खुद भी डाल सकते हैं।',
  },
  'inf.thisMonth': { en: 'This month', hi: 'इस महीने' },
  'inf.lastMonth': { en: 'Last month', hi: 'पिछले महीने' },
  'inf.lifetime': { en: 'All time', hi: 'अब तक' },
  'inf.signups': { en: 'Joined with your code', hi: 'आपके कोड से जुड़े' },
  'inf.buyers': { en: 'Of them, paid', hi: 'इनमें से भुगतान किया' },
  'inf.rate': { en: '{n}% of the people who joined have paid.', hi: 'जुड़ने वालों में से {n}% ने भुगतान किया है।' },
  'inf.noneYet': { en: 'Nobody has joined with your code in this period yet.', hi: 'इस अवधि में अभी तक कोई आपके कोड से नहीं जुड़ा।' },
  'inf.recent': { en: 'Latest people who joined', hi: 'हाल में जुड़े लोग' },
  'inf.recentEmpty': { en: 'Share your link. Everyone who joins with it appears here.', hi: 'अपना लिंक शेयर करें। इससे जुड़ने वाला हर व्यक्ति यहां दिखेगा।' },
  'inf.joined': { en: 'Joined {d}', hi: '{d} को जुड़े' },
  'inf.paidOn': { en: 'Paid {d}', hi: '{d} को भुगतान' },
  'inf.notYet': { en: 'Not paid yet', hi: 'अभी भुगतान नहीं' },
  'inf.terms': {
    en: 'Paid means they added money to their wallet. Names are not shown. Namo sets what each signup and each paying person is worth, and pays monthly into the bank account in your payout details.',
    hi: 'भुगतान का मतलब है कि उन्होंने वॉलेट में पैसे जोड़े। नाम नहीं दिखाए जाते। हर साइन-अप और भुगतान करने वाले व्यक्ति की रकम Namo तय करता है, और भुगतान हर महीने आपके बैंक खाते में होता है।',
  },
  'inf.failed': { en: 'Could not load your numbers. Open this tab again.', hi: 'आपके आंकड़े नहीं खुल सके। यह टैब फिर से खोलें।' },

  // ── Support (3 Oct 2026) ──
  'sup.title': { en: 'Help and support', hi: 'मदद और सहायता' },
  'sup.lede': {
    en: 'Call, WhatsApp or write to us. Tell us what happened and we will sort it out.',
    hi: 'कॉल करें, WhatsApp करें या लिखें। बताइए क्या हुआ, हम सुलझा देंगे।',
  },
  'sup.call': { en: 'Call', hi: 'कॉल' },
  'sup.email': { en: 'Email', hi: 'ईमेल' },
  'sup.report': { en: 'Report a problem', hi: 'समस्या बताएं' },
  'sup.reportHint': {
    en: 'Your account and app details are added for you, so we can answer without asking twice.',
    hi: 'आपके अकाउंट और ऐप की जानकारी अपने-आप जुड़ जाती है, ताकि हमें दोबारा पूछना न पड़े।',
  },
  'sup.t.money': { en: 'Money or wallet', hi: 'पैसे या वॉलेट' },
  'sup.t.session': { en: 'A session or chat', hi: 'सेशन या चैट' },
  'sup.t.order': { en: 'A shop order', hi: 'दुकान का ऑर्डर' },
  'sup.t.account': { en: 'My account', hi: 'मेरा अकाउंट' },
  'sup.t.other': { en: 'Something else', hi: 'कुछ और' },
  'sup.ref': { en: 'Order or session ID · optional', hi: 'ऑर्डर या सेशन ID · वैकल्पिक' },
  'sup.refPh': { en: 'If you have one', hi: 'अगर आपके पास है' },
  'sup.what': { en: 'What happened', hi: 'क्या हुआ' },
  'sup.whatPh': {
    en: 'When it happened, what you expected, what you saw instead.',
    hi: 'कब हुआ, आप क्या उम्मीद कर रहे थे, और क्या दिखा।',
  },
  'sup.sendEmail': { en: 'Send by email', hi: 'ईमेल से भेजें' },
  'sup.sendWa': { en: 'Send on WhatsApp', hi: 'WhatsApp पर भेजें' },
  'sup.faq': { en: 'Common questions', hi: 'आम सवाल' },
  'sup.q1': {
    en: 'Money left my bank but my wallet did not go up',
    hi: 'बैंक से पैसे कटे पर वॉलेट में नहीं आए',
  },
  'sup.a1': {
    en: 'It usually shows within a few minutes. If it has not after 30 minutes, report it here with the amount and time. We match it against the payment record and add it.',
    hi: 'आमतौर पर कुछ मिनट में दिख जाता है। 30 मिनट बाद भी न आए तो यहां रकम और समय के साथ बताएं। हम पेमेंट रिकॉर्ड से मिलाकर जोड़ देंगे।',
  },
  'sup.q2': { en: 'A session did not connect', hi: 'सेशन कनेक्ट नहीं हुआ' },
  'sup.a2': {
    en: 'A request the consultant does not answer costs nothing, and you pay only for the time a session was running. If you were charged for one that never started, report it with the session time.',
    hi: 'अगर ज्योतिषी जवाब न दें तो कोई पैसा नहीं कटता, और आप सिर्फ चले हुए सेशन के समय का भुगतान करते हैं। अगर बिना शुरू हुए सेशन के पैसे कटे हों, तो सेशन के समय के साथ बताएं।',
  },
  'sup.q3': { en: 'Where is my shop order?', hi: 'मेरा ऑर्डर कहां है?' },
  'sup.a3': {
    en: 'Profile → Orders shows each order and its status. If it looks stuck, report it with the order ID.',
    hi: 'प्रोफ़ाइल → ऑर्डर में हर ऑर्डर और उसकी स्थिति दिखती है। अगर अटका लगे, तो ऑर्डर ID के साथ बताएं।',
  },
  'sup.q4': { en: 'How do I change my birth details?', hi: 'जन्म विवरण कैसे बदलें?' },
  'sup.a4': {
    en: 'Profile → Edit birth details. Every chart is drawn again from the new details.',
    hi: 'प्रोफ़ाइल → जन्म विवरण बदलें। नए विवरण से हर चार्ट फिर से बनता है।',
  },
  'sup.q5': { en: 'How do I delete my account?', hi: 'अकाउंट कैसे डिलीट करें?' },
  'sup.a5': {
    en: 'Write to support@1namo.com from here and say so. We confirm it is you, then remove the account.',
    hi: 'यहां से support@1namo.com पर लिखकर बताएं। हम पुष्टि करके अकाउंट हटा देंगे।',
  },
  'prof.protoOnly': { en: '{what} — prototype only', hi: '{what} — अभी सिर्फ़ प्रोटोटाइप' },
  'prof.account': { en: 'Account', hi: 'खाता' },
  'prof.signedInAs': { en: 'Signed in as {phone}', hi: '{phone} से साइन इन है' },
  'prof.phone': { en: 'Phone', hi: 'फ़ोन' },
  'prof.phoneNote': {
    en: 'Your number is your account. It cannot be changed here.',
    hi: 'आपका नंबर ही आपका खाता है। इसे यहाँ नहीं बदला जा सकता।',
  },
  'prof.orders': { en: 'Your orders', hi: 'आपके ऑर्डर' },
  'prof.ordersNote': { en: 'What you have bought, and where it is', hi: 'आपने क्या खरीदा, और वह कहाँ है' },
  'prof.notifHistory': { en: 'Notification history', hi: 'सूचनाओं का इतिहास' },
  'prof.signingOut': { en: 'Signing out…', hi: 'साइन आउट हो रहा है…' },
  'prof.signOut': { en: 'Sign out', hi: 'साइन आउट' },
  'prof.signOutNote': {
    en: 'You will need the code texted to your number to get back in.',
    hi: 'वापस आने के लिए आपके नंबर पर भेजा गया कोड चाहिए होगा।',
  },

  // ── Consult ──────────────────────────────────────────────────────────────
  /* `{mins}` rather than `{label}` and `{promise}` in Hindi: those two are
     English strings in mock.js. If SESSION changes, change these too. */
  'con.bn.verified.k': { en: 'Verified', hi: 'सत्यापित' },
  'con.bn.verified.t': { en: 'Astrologers you can trust', hi: 'ज्योतिषी जिन पर भरोसा कर सकें' },
  'con.bn.verified.n': {
    en: 'Every expert screened and credential-checked. No exceptions.',
    hi: 'हर विशेषज्ञ की जांच और प्रमाण-पत्रों की पुष्टि। कोई अपवाद नहीं।',
  },
  'con.bn.verified.c': { en: 'See astrologers', hi: 'ज्योतिषी देखें' },
  'con.bn.first.k': { en: 'Today only', hi: 'सिर्फ़ आज' },
  'con.bn.first.t': { en: 'First session at {label}', hi: 'पहला सत्र {mins} मिनट का' },
  'con.bn.first.n': {
    en: '{promise}, any astrologer online.',
    hi: 'असीमित सवाल, कोई भी ऑनलाइन ज्योतिषी।',
  },
  'con.bn.first.c': { en: 'Claim offer', hi: 'ऑफ़र लें' },
  'con.bn.refer.k': { en: 'Refer a friend', hi: 'दोस्त को बुलाएं' },
  'con.bn.refer.t': { en: 'Earn credit per referral', hi: 'हर रेफ़रल पर क्रेडिट पाएं' },
  'con.bn.refer.n': {
    en: 'They get a discount. You get credit toward your next call.',
    hi: 'उन्हें छूट मिलेगी। आपको अगली कॉल के लिए क्रेडिट।',
  },
  'con.bn.refer.c': { en: 'Refer now', hi: 'अभी रेफ़र करें' },
  'con.inviteProto': { en: 'Opening invite — prototype only', hi: 'इनवाइट खुल रहा है — अभी सिर्फ़ प्रोटोटाइप' },
  'con.offerProto': { en: 'Offer — prototype only', hi: 'ऑफ़र — अभी सिर्फ़ प्रोटोटाइप' },
  'con.reviewTitle': { en: 'Review {name}', hi: '{name} को रिव्यू दें' },
  'con.rateNote': { en: 'Rate the session, not the news in it.', hi: 'सत्र को रेटिंग दें, उसमें मिली ख़बर को नहीं।' },
  'con.reviewPh': {
    en: 'What did they actually help you decide? Optional.',
    hi: 'उन्होंने असल में आपको क्या तय करने में मदद की? वैकल्पिक।',
  },
  'con.reviewPosted': { en: 'Review posted', hi: 'रिव्यू पोस्ट हो गया' },
  'con.posting': { en: 'Posting', hi: 'पोस्ट हो रहा है' },
  'con.postReview': { en: 'Post review', hi: 'रिव्यू पोस्ट करें' },
  'con.pickRating': { en: 'Pick a rating first', hi: 'पहले रेटिंग चुनें' },
  'con.st.pending': { en: 'Awaiting reply', hi: 'जवाब का इंतज़ार' },
  'con.st.confirmed': { en: 'Confirmed', hi: 'पक्का' },
  'con.st.completed': { en: 'Done', hi: 'पूरा हुआ' },
  'con.st.declined': { en: 'Declined · refunded', hi: 'अस्वीकार · पैसे वापस' },
  'con.st.cancelled': { en: 'Cancelled', hi: 'रद्द' },
  'con.st.rescheduled': { en: 'Moved', hi: 'समय बदला' },
  'con.st.noShow': { en: 'Missed', hi: 'छूट गया' },
  'con.call': { en: 'Call', hi: 'कॉल' },
  'con.chat': { en: 'Chat', hi: 'चैट' },
  'con.video': { en: 'Video', hi: 'वीडियो' },
  'con.audio': { en: 'Audio', hi: 'ऑडियो' },
  'con.bookSaves': {
    en: 'Booking a slot costs 20% less than the per-minute rate.',
    hi: 'स्लॉट बुक करना प्रति मिनट दर से 20% सस्ता है।',
  },
  'con.searchPh': { en: 'Search by name, concern or language', hi: 'नाम, समस्या या भाषा से खोजें' },
  'con.yourSessions': { en: 'Your sessions', hi: 'आपके सत्र' },
  'con.noSessions': { en: 'No sessions booked yet. Book one from Consult.', hi: 'अभी कोई सत्र बुक नहीं है। कंसल्ट से बुक करें।' },
  'chat.sessions': { en: 'Sessions', hi: 'सत्र' },
  'con.review': { en: 'Review', hi: 'रिव्यू दें' },
  'con.railTitle': { en: '{promise} in {label}', hi: '{mins} मिनट में असीमित सवाल' },
  'con.verified': { en: '{n} verified', hi: '{n} सत्यापित' },
  'con.book': { en: 'Book', hi: 'बुक करें' },
  'con.everySession': {
    en: 'Every session is {label} · {promise}',
    hi: 'हर सत्र {mins} मिनट का · असीमित सवाल',
  },
  'con.person': { en: '{n} person', hi: '{n} व्यक्ति' },
  'con.people': { en: '{n} people', hi: '{n} लोग' },
  'con.perMin': { en: '/min', hi: '/मिनट' },
  'con.new': { en: 'New', hi: 'नए' },
  'con.yrs': { en: '{n} yrs', hi: '{n} साल' },
  'con.practising': { en: 'Practising', hi: 'अभ्यासरत' },
  'con.offline': {
    en: 'Offline right now · you can still book a time',
    hi: 'अभी ऑफ़लाइन · फिर भी समय बुक कर सकते हैं',
  },
  'con.loading': { en: 'Reading the roster.', hi: 'ज्योतिषियों की सूची आ रही है।' },
  'con.noMatch': {
    en: 'Nobody matches that. Clear the search or pick another category.',
    hi: 'कोई नहीं मिला। खोज हटाएं या कोई और श्रेणी चुनें।',
  },
  'con.empty.title': { en: 'Nobody is reading yet', hi: 'अभी कोई ज्योतिषी उपलब्ध नहीं' },
  'con.empty.p1': {
    en: 'No astrologer has been approved. Nothing is hidden from you and no filter is on — the list is empty because the practice is new.',
    hi: 'अभी किसी ज्योतिषी को मंज़ूरी नहीं मिली है। आपसे कुछ छिपाया नहीं गया और कोई फ़िल्टर नहीं लगा है — सूची इसलिए ख़ाली है क्योंकि यह सेवा नई है।',
  },
  'con.empty.p2': {
    en: 'We approve one at a time and read every application. Until somebody clears that, there is nothing here to book.',
    hi: 'हम एक-एक करके मंज़ूरी देते हैं और हर आवेदन पढ़ते हैं। जब तक कोई पास नहीं होता, यहाँ बुक करने को कुछ नहीं है।',
  },
  'con.empty.apply': { en: 'Apply to take sessions', hi: 'सत्र लेने के लिए आवेदन करें' },
  'con.empty.for': {
    en: 'For astrologers, tarot readers and coaches',
    hi: 'ज्योतिषियों, टैरो रीडर और कोच के लिए',
  },

  // ── Shop ─────────────────────────────────────────────────────────────────
  'shop.bn.stones.k': { en: 'Certified', hi: 'प्रमाणित' },
  'shop.bn.stones.t': { en: 'Stones with a lab report', hi: 'लैब रिपोर्ट वाले रत्न' },
  'shop.bn.stones.n': {
    en: 'Every gem, its certificate. No exceptions.',
    hi: 'हर रत्न के साथ उसका प्रमाण-पत्र। कोई अपवाद नहीं।',
  },
  'shop.bn.stones.c': { en: 'See gemstones', hi: 'रत्न देखें' },
  'shop.bn.rudraksha.k': { en: 'Nepali origin', hi: 'नेपाल से' },
  'shop.bn.rudraksha.t': { en: 'Hand-counted rudraksha', hi: 'रुद्राक्ष, हाथ से गिने हुए' },
  'shop.bn.rudraksha.n': { en: '108 beads, knotted one at a time.', hi: '108 मनके, एक-एक करके पिरोए हुए।' },
  'shop.bn.rudraksha.c': { en: 'See rudraksha', hi: 'रुद्राक्ष देखें' },
  'shop.bn.remedies.k': { en: 'Weekly ritual', hi: 'साप्ताहिक अनुष्ठान' },
  'shop.bn.remedies.t': { en: 'Remedy kits under ₹1,500', hi: '₹1,500 से कम के उपाय किट' },
  'shop.bn.remedies.n': {
    en: 'Oil, cloth, mantra card. Nothing you cannot pronounce.',
    hi: 'तेल, कपड़ा, मंत्र कार्ड। ऐसा कुछ नहीं जो आप बोल न सकें।',
  },
  'shop.bn.remedies.c': { en: 'See remedies', hi: 'उपाय देखें' },
  'shop.gone': { en: 'That product is no longer in the shop', hi: 'यह प्रोडक्ट अब दुकान में नहीं है' },
  /* One sentence in four pieces, so the code and "10% back" can be bold. */
  'shop.ref.a': { en: 'Code', hi: 'कोड' },
  'shop.ref.b': {
    en: 'is saved and goes in at checkout. You pay the full price and get',
    hi: 'सेव है और चेकआउट पर अपने-आप लगेगा। आप पूरी कीमत देंगे और डिलीवरी के सात दिन बाद आपके वॉलेट में',
  },
  'shop.ref.c': { en: '10% back', hi: '10% वापस' },
  'shop.ref.d': {
    en: 'in your wallet seven days after delivery — on your first order only.',
    hi: 'आएगा — सिर्फ़ पहले ऑर्डर पर।',
  },
  'shop.searchPh': { en: 'Search stones, maalas and kits', hi: 'रत्न, माला और किट खोजें' },
  'shop.matched': { en: 'Matched to your chart', hi: 'आपकी कुंडली के हिसाब से' },
  'shop.heroSun': {
    en: 'Commonly named for a {sun} sun with Saturn in the 12th. Commonly named is not the same as proven.',
    hi: 'आमतौर पर {sun} सूर्य और 12वें भाव में शनि के लिए बताया जाता है। आमतौर पर बताया जाना, साबित होना नहीं है।',
  },
  'shop.hero': {
    en: 'Commonly named for a Saturn in the 12th. Commonly named is not the same as proven.',
    hi: 'आमतौर पर 12वें भाव में शनि के लिए बताया जाता है। आमतौर पर बताया जाना, साबित होना नहीं है।',
  },
  'shop.addToCart': { en: 'Add to cart', hi: 'कार्ट में डालें' },
  'shop.reviewBuy': { en: 'Review & buy', hi: 'देखें और खरीदें' },
  'shop.item': { en: '{n} item', hi: '{n} आइटम' },
  'shop.items': { en: '{n} items', hi: '{n} आइटम' },
  'shop.opening': { en: 'Opening the shop', hi: 'दुकान खुल रही है' },
  'shop.err': { en: 'We could not reach the shop.', hi: 'दुकान से संपर्क नहीं हो सका।' },
  'shop.errNote': { en: 'Nothing is wrong with your search.', hi: 'आपकी खोज में कोई गड़बड़ी नहीं है।' },
  'shop.retry': { en: 'Try again', hi: 'फिर कोशिश करें' },
  'shop.noMatch': {
    en: 'Nothing matches that. Clear the search, or drop the subcategory.',
    hi: 'कुछ नहीं मिला। खोज हटाएं, या उप-श्रेणी हटा दें।',
  },
  'shop.linked': { en: 'Linked', hi: 'लिंक से' },
  'shop.soldOut': { en: 'Sold out', hi: 'स्टॉक ख़त्म' },
  'shop.namedBy': { en: 'Named by {name}', hi: '{name} का सुझाव' },
  'shop.add': { en: 'Add', hi: 'जोड़ें' },
  'shop.buy': { en: 'Buy', hi: 'खरीदें' },
  'shop.viewCart': { en: 'View cart', hi: 'कार्ट देखें' },
  // The product page (6 Oct 2026)
  'shop.pp.title': { en: 'Product', hi: 'प्रोडक्ट' },
  'shop.pp.toShop': { en: 'Back to the shop', hi: 'दुकान पर वापस' },
  'shop.pp.mrp': { en: 'MRP', hi: 'एमआरपी' },
  'shop.pp.taxes': { en: 'Inclusive of all taxes. Free delivery.', hi: 'सभी टैक्स शामिल। डिलीवरी मुफ़्त।' },
  'shop.pp.few': { en: 'Only {n} left', hi: 'सिर्फ़ {n} बचे हैं' },
  'shop.pp.inStock': { en: 'In stock', hi: 'स्टॉक में है' },
  'shop.pp.share': { en: 'Share', hi: 'शेयर करें' },
  'shop.pp.copied': { en: 'Link copied', hi: 'लिंक कॉपी हो गया' },
  'shop.pp.about': { en: 'About this product', hi: 'इस प्रोडक्ट के बारे में' },
  'shop.pp.faq': { en: 'Questions people ask', hi: 'लोग क्या पूछते हैं' },
  'shop.disclaimer': {
    en: 'A stone is a reminder of your intention, not a cure. Choose the one that speaks to you.',
    hi: 'रत्न आपके संकल्प की याद दिलाता है, इलाज नहीं। वही चुनें जो आपको सही लगे।',
  },

  // ── Academy ──────────────────────────────────────────────────────────────
  'ac.tab.ebooks': { en: 'E-book', hi: 'ई-बुक' },
  'ac.tab.courses': { en: 'Courses', hi: 'कोर्स' },
  'ac.tab.events': { en: 'Events', hi: 'इवेंट' },
  'ac.continue': { en: 'Continue', hi: 'जारी रखें' },
  'ac.progress': { en: 'Progress', hi: 'प्रगति' },
  'ac.resume': { en: 'Resume · watch now', hi: 'जारी रखें · अभी देखें' },
  'ac.allCourses': { en: 'All courses', hi: 'सभी कोर्स' },
  'ac.enrolledIn': { en: 'Enrolled · {title}', hi: 'दाख़िला हो गया · {title}' },
  'ac.enrol': { en: 'Enrol', hi: 'दाख़िला लें' },
  'ac.enrolled': { en: 'Enrolled', hi: 'दाख़िला पक्का' },
  'ac.watch': { en: 'Watch', hi: 'देखें' },
  'ac.webinars': { en: 'Webinars & seminars', hi: 'वेबिनार और सेमिनार' },
  'ac.free': { en: 'Free', hi: 'मुफ़्त' },
  'ac.full': { en: 'Sold out', hi: 'सीटें भर गईं' },
  'ac.seatsLeft': { en: '{n} seats left', hi: '{n} सीटें बाकी' },
  'ac.noCharge': { en: 'No charge', hi: 'कोई शुल्क नहीं' },
  'ac.isFull': { en: 'That one is full', hi: 'यह भर चुका है' },
  'ac.cancelled': { en: 'Enrolment cancelled', hi: 'दाख़िला रद्द' },
  'ac.libErr': { en: 'Could not reach the library. Try again.', hi: 'लाइब्रेरी से संपर्क नहीं हो सका। फिर कोशिश करें।' },
  'ac.noBooks': { en: 'No e-books yet.', hi: 'अभी कोई ई-बुक नहीं।' },
  'ac.yoursToRead': { en: 'Yours to read', hi: 'आपके पढ़ने के लिए' },
  'ac.read': { en: 'Read', hi: 'पढ़ें' },
  'ac.openPdf': { en: 'Open PDF', hi: 'PDF खोलें' },
  'ac.paywallNote': {
    en: 'Yours to read on any device you sign in on.',
    hi: 'जिस भी डिवाइस पर साइन इन करें, वहाँ पढ़ें।',
  },

  // ── Matching ─────────────────────────────────────────────────────────────
  'match.you': { en: 'You', hi: 'आप' },
  'match.them': { en: 'Them', hi: 'वे' },
  'match.sub': { en: 'Ashtakoota, out of 36', hi: 'अष्टकूट, 36 में से' },
  'match.first': { en: 'First chart', hi: 'पहली कुंडली' },
  'match.whoseFirst': { en: 'Whose chart is first?', hi: 'पहली कुंडली किसकी है?' },
  'match.useDetails': { en: 'Use these details', hi: 'यही विवरण लें' },
  'match.useMine': { en: 'Use my own chart', hi: 'मेरी अपनी कुंडली लें' },
  'match.someoneElse': { en: 'Somebody else', hi: 'किसी और की' },
  /* One sentence around a link: "{missing} [Add them]{orTwo}". */
  'match.missing': { en: 'Your own birth details are missing.', hi: 'आपका अपना जन्म विवरण नहीं है।' },
  'match.addThem': { en: 'Add them', hi: 'जोड़ें' },
  'match.orTwo': { en: ', or match two other people.', hi: ', या दो दूसरे लोगों का मिलान करें।' },
  'match.second': { en: 'Second chart', hi: 'दूसरी कुंडली' },
  'match.whoseSecond': { en: 'Whose chart is second?', hi: 'दूसरी कुंडली किसकी है?' },
  'match.read': { en: 'Read the match', hi: 'मिलान देखें' },
  'match.loading': {
    en: 'Reading the two charts against each other.',
    hi: 'दोनों कुंडलियों का मिलान हो रहा है।',
  },
  'match.again': { en: 'Start again', hi: 'फिर से शुरू करें' },
  'match.above': { en: 'Above the traditional pass mark of {n}.', hi: 'पारंपरिक पास अंक {n} से ऊपर।' },
  'match.below': { en: 'Below the traditional pass mark of {n}.', hi: 'पारंपरिक पास अंक {n} से नीचे।' },
  'match.totalNote': {
    en: 'The total is eight separate tests added together, and they are worth reading one by one — a pair can clear the mark and still carry the one dosha that matters.',
    hi: 'कुल अंक आठ अलग-अलग जांचों का जोड़ है, और इन्हें एक-एक करके पढ़ना चाहिए — जोड़ी पास अंक पार करके भी वह एक दोष रख सकती है जो सच में मायने रखता है।',
  },
  'match.and': { en: ' and ', hi: ' और ' },
  'match.noTime1': {
    en: '{names} has no birth time, so noon was used. Every koota below is read off the Moon, which crosses a nakshatra in about a day — with the real time these numbers can change.',
    hi: '{names} का जन्म समय नहीं है, इसलिए दोपहर 12 बजे माना गया। नीचे हर कूट चंद्रमा से पढ़ा गया है, जो लगभग एक दिन में एक नक्षत्र पार करता है — असली समय से ये अंक बदल सकते हैं।',
  },
  'match.noTimeN': {
    en: '{names} have no birth time, so noon was used. Every koota below is read off the Moon, which crosses a nakshatra in about a day — with the real time these numbers can change.',
    hi: '{names} का जन्म समय नहीं है, इसलिए दोपहर 12 बजे माना गया। नीचे हर कूट चंद्रमा से पढ़ा गया है, जो लगभग एक दिन में एक नक्षत्र पार करता है — असली समय से ये अंक बदल सकते हैं।',
  },
  'match.kootas': { en: 'The eight kootas', hi: 'आठ कूट' },
  'match.doshas': { en: 'Doshas', hi: 'दोष' },
  'match.manglik': { en: 'Manglik', hi: 'मांगलिक' },
  'match.none': { en: 'None', hi: 'नहीं' },
  'match.present': { en: 'Present', hi: 'है' },
  'match.cancelledBy': { en: 'Cancelled by {list}.', hi: '{list} से निरस्त।' },
  'match.stops': { en: 'Where this stops', hi: 'इसकी सीमा' },
  'match.stopsNote': {
    en: 'This is a ruleset comparing two Moons. It is the first question an astrologer asks and not the last one they answer, and it says nothing about what either of you wants.',
    hi: 'यह दो चंद्रमाओं की तुलना करने वाले नियमों का समूह है। यह ज्योतिषी का पहला सवाल है, आख़िरी जवाब नहीं, और यह इस बारे में कुछ नहीं कहता कि आप दोनों क्या चाहते हैं।',
  },
  'match.toPerson': { en: 'Take this to a person', hi: 'किसी ज्योतिषी को दिखाएं' },
  'match.toPersonNote': { en: 'A human reads the same two charts', hi: 'एक इंसान वही दो कुंडलियाँ पढ़ेगा' },
  'match.askAbout': { en: 'Ask about it', hi: 'इसके बारे में पूछें' },
  'match.askAboutNote': { en: 'Namo AI, on your own chart', hi: 'नमो AI, आपकी अपनी कुंडली पर' },
  'match.another': { en: 'Match someone else', hi: 'किसी और का मिलान करें' },

  // ── Muhurat ──────────────────────────────────────────────────────────────
  'mu.p.general': { en: 'General work', hi: 'सामान्य काम' },
  'mu.p.generalNote': { en: 'Any start that has no rite of its own', hi: 'कोई भी शुरुआत जिसका अपना संस्कार न हो' },
  'mu.p.vehicle': { en: 'Vehicle', hi: 'वाहन' },
  'mu.p.vehicleNote': { en: 'Taking delivery of a vehicle', hi: 'वाहन की डिलीवरी लेना' },
  'mu.p.property': { en: 'Property', hi: 'संपत्ति' },
  'mu.p.propertyNote': { en: 'Registering or buying', hi: 'रजिस्ट्री या ख़रीद' },
  'mu.p.griha': { en: 'Griha pravesh', hi: 'गृह प्रवेश' },
  'mu.p.grihaNote': { en: 'Entering a new home', hi: 'नए घर में प्रवेश' },
  'mu.p.naming': { en: 'Naming', hi: 'नामकरण' },
  'mu.p.namingNote': { en: 'Namkaran, the naming ceremony', hi: 'नामकरण संस्कार' },
  'mu.p.mundan': { en: 'Mundan', hi: 'मुंडन' },
  'mu.p.mundanNote': { en: 'The first tonsure', hi: 'पहला मुंडन संस्कार' },
  'mu.whatFor': { en: 'What for', hi: 'किस काम के लिए' },
  'mu.where': { en: 'Where', hi: 'कहाँ' },
  'mu.city': { en: 'City', hi: 'शहर' },
  'mu.change': { en: 'Change', hi: 'बदलें' },
  'mu.sunriseNote': {
    en: 'Sunrise moves about two hours across India, and every window below is built from it.',
    hi: 'पूरे भारत में सूर्योदय का समय लगभग दो घंटे तक बदलता है, और नीचे का हर शुभ समय उसी से बनता है।',
  },
  'mu.judged': { en: 'Judged against your zodiac', hi: 'आपकी राशि के हिसाब से' },
  'mu.judge': { en: 'Judge against your zodiac', hi: 'अपनी राशि के हिसाब से देखें' },
  'mu.judgeNote': {
    en: 'Ranks the {label} windows against your own birth chart and keeps only the best quarter of them.',
    hi: '{label} के शुभ समय को आपकी अपनी कुंडली से परखकर केवल सबसे अच्छे एक-चौथाई रखता है।',
  },
  'mu.showAll': { en: 'Show every window', hi: 'सभी शुभ समय दिखाएं' },
  'mu.bestForYou': { en: 'The best {n} for you', hi: 'आपके लिए सबसे अच्छे {n}' },
  'mu.loading': { en: 'Reading {label} windows.', hi: '{label} के शुभ समय देखे जा रहे हैं।' },
  'mu.payTitle': { en: '{label}, judged against your chart', hi: '{label}, आपकी कुंडली के हिसाब से' },
  'mu.payNote': {
    en: 'The {month} windows ranked for your birth, and the one best moment when there is one. Yours to reopen any time.',
    hi: '{month} के शुभ समय आपके जन्म के हिसाब से क्रम में, और अगर कोई हो तो सबसे शुभ क्षण। जब चाहें दोबारा खोलें।',
  },
  'mu.without': { en: 'Show the windows without it', hi: 'इसके बिना शुभ समय दिखाएं' },
  'mu.best': { en: 'Best moment', hi: 'सबसे शुभ क्षण' },
  'mu.nothing': { en: 'Nothing this month', hi: 'इस महीने कुछ नहीं' },
  'mu.nothingNote': {
    en: 'No {label} window in {month}. This is the answer, not a failure — whole months are closed to some rites, and the tradition would rather you waited than picked a bad one. Try the next month.',
    hi: '{month} में {label} का कोई शुभ समय नहीं है। यही जवाब है, कोई गड़बड़ी नहीं — कुछ संस्कारों के लिए पूरे महीने बंद रहते हैं, और परंपरा चाहती है कि आप ग़लत समय चुनने के बजाय इंतज़ार करें। अगला महीना देखें।',
  },
  'mu.windows': { en: 'Windows', hi: 'शुभ समय' },
  'mu.hours': { en: '{n} hours', hi: '{n} घंटे' },
  'mu.sunToSun': { en: 'sunrise to sunrise', hi: 'सूर्योदय से सूर्योदय तक' },
  'mu.localTimes': {
    en: 'Times are local to {place}. A window that ends after midnight is marked +1.',
    hi: 'समय {place} के स्थानीय हैं। आधी रात के बाद ख़त्म होने वाले समय पर +1 लिखा है।',
  },

  // ── Namo AI ──────────────────────────────────────────────────────────────
  'ask.each': { en: '{price} each', hi: '{price} प्रति सवाल' },
  'ask.free': { en: '{n} free', hi: '{n} मुफ़्त' },
  'ask.opening': { en: 'Opening…', hi: 'खुल रहा है…' },
  'home.yourRashifal': { en: 'Your rashifal', hi: 'आपका राशिफल' },
  'ask.thinking': { en: 'Reading your chart…', hi: 'आपकी कुंडली पढ़ रहे हैं…' },
  'ask.title': { en: 'Ask about your chart', hi: 'अपनी कुंडली के बारे में पूछें' },
  'ask.sub': { en: 'Answers read from the minute you were born.', hi: 'जवाब आपके जन्म के ठीक समय से पढ़े जाते हैं।' },
  'ask.readingTheirs': { en: "Reading {name}'s chart", hi: '{name} की कुंडली पढ़ी जा रही है' },
  'ask.readingMine': { en: 'Reading your chart', hi: 'आपकी कुंडली पढ़ी जा रही है' },
  'ask.backToMine': { en: 'Back to mine', hi: 'मेरी कुंडली पर लौटें' },
  'ask.someoneElse': { en: 'Someone else', hi: 'किसी और की' },
  'ask.boost': {
    en: 'Your referral is in. 3 free questions a day start tomorrow.',
    hi: 'आपका रेफ़रल लग गया। कल से रोज़ 3 मुफ़्त सवाल।',
  },
  'ask.ph': { en: 'Message Namo AI', hi: 'नमो AI से पूछें' },
  'ask.perQuestion': { en: '{price} a question from your wallet.', hi: 'आपके वॉलेट से {price} प्रति सवाल।' },
  'ask.freeLeft': { en: '{n} free questions left.', hi: '{n} मुफ़्त सवाल बाकी।' },
  /* One sentence around a link: "{canBeWrong} [pros]{end}". */
  'ask.canBeWrong': { en: 'Namo AI can be wrong —', hi: 'नमो AI गलत हो सकता है —' },
  'ask.pros': { en: 'ask our pros', hi: 'हमारे ज्योतिषियों से पूछें' },
  'ask.end': { en: '.', hi: '।' },

  // ── Premium ──────────────────────────────────────────────────────────────
  'prem.title': { en: 'Go deeper when you want to.', hi: 'जब चाहें, और गहराई में जाएं।' },
  'prem.sub': {
    en: 'Your daily reading stays free. Premium gives you the full reading, at length.',
    hi: 'आपका रोज़ का राशिफल मुफ़्त रहेगा। प्रीमियम में पूरा, विस्तार से पाठ मिलता है।',
  },
  'prem.added': { en: '{name} — added', hi: '{name} — जोड़ा गया' },
  'prem.get': { en: 'Get it', hi: 'लें' },
  'prem.honest': { en: 'The honest part', hi: 'सच्ची बात' },
  'prem.honestNote': {
    en: 'None of this is a payment screen. It is a prototype, nothing is charged, and no report is generated.',
    hi: 'यह कोई भुगतान स्क्रीन नहीं है। यह एक प्रोटोटाइप है, कोई पैसा नहीं कटता, और कोई रिपोर्ट नहीं बनती।',
  },

  // ── Orders ───────────────────────────────────────────────────────────────
  'ord.sub': { en: 'What you have bought', hi: 'आपने क्या खरीदा' },
  'ord.loading': { en: 'Loading.', hi: 'लोड हो रहा है।' },
  'ord.empty': { en: 'Nothing yet.', hi: 'अभी कुछ नहीं।' },
  'ord.toShop': { en: 'Go to the shop', hi: 'दुकान पर जाएं' },
  'ord.moneyBack': { en: 'Returned', hi: 'वापस' },
  'ord.paid': { en: 'Paid', hi: 'चुकाया' },
  // Cash on delivery (6 Oct 2026)
  'ord.codDue': { en: 'Pay in cash on delivery', hi: 'डिलीवरी पर नकद दें' },
  'ord.codPaid': { en: 'Paid in cash', hi: 'नकद चुकाया' },
  'ord.codNone': { en: 'Nothing to pay', hi: 'कुछ नहीं देना' },
  'ord.codFee': { en: 'Cash on delivery fee', hi: 'कैश ऑन डिलीवरी शुल्क' },
  'ord.payWaiting': { en: 'Waiting for payment', hi: 'भुगतान का इंतज़ार' },
  'ord.notPaid': { en: 'Not paid · nothing charged', hi: 'भुगतान नहीं हुआ · कुछ नहीं कटा' },
  'ord.courier': { en: 'Courier', hi: 'कूरियर' },
  /* One sentence around a link: "{notOrders} [wallet]{notOrdersEnd}". */
  'ord.notOrders': {
    en: 'Sessions and questions are not orders — those are in your',
    hi: 'सत्र और सवाल ऑर्डर नहीं हैं — वे आपके',
  },
  'ord.wallet': { en: 'wallet', hi: 'वॉलेट' },
  'ord.notOrdersEnd': { en: '.', hi: ' में हैं।' },
  'ord.st.cancelled': { en: 'Cancelled', hi: 'रद्द' },
  'ord.st.refunded': { en: 'Refunded', hi: 'पैसे वापस' },
  'ord.st.delivered': { en: 'Delivered', hi: 'पहुँच गया' },
  'ord.st.shipped': { en: 'On its way', hi: 'रास्ते में' },
  'ord.st.returned': { en: 'Returned', hi: 'लौट गया' },
  'ord.st.packed': { en: 'Packed', hi: 'पैक हो गया' },
  'ord.st.confirmed': { en: 'Confirmed', hi: 'पक्का' },
  'ord.cb.paid': { en: '{amount} cashback is in your wallet.', hi: '{amount} कैशबैक आपके वॉलेट में आ गया।' },
  'ord.cb.cancelled': {
    en: '{amount} cashback was cancelled when this order came back.',
    hi: 'यह ऑर्डर लौटने पर {amount} कैशबैक रद्द हो गया।',
  },
  'ord.cb.on': { en: '{amount} cashback lands on {day}.', hi: '{amount} कैशबैक {day} को आएगा।' },
  'ord.cb.later': {
    en: '{amount} cashback, seven days after this is delivered.',
    hi: '{amount} कैशबैक, डिलीवरी के सात दिन बाद।',
  },
  'ord.delivery': { en: 'delivery', hi: 'डिलीवरी' },
  'ord.fee': { en: 'Delivery', hi: 'डिलीवरी शुल्क' },
  'ord.track': { en: 'Track parcel', hi: 'पार्सल ट्रैक करें' },
  'ord.step.ordered': { en: 'Ordered', hi: 'ऑर्डर हुआ' },
  'ord.step.packed': { en: 'Packed', hi: 'पैक हुआ' },
  'ord.step.shipped': { en: 'Shipped', hi: 'भेजा गया' },
  'ord.step.delivered': { en: 'Delivered', hi: 'पहुँच गया' },

  // ── Wallet ───────────────────────────────────────────────────────────────
  'wal.available': { en: 'Available balance', hi: 'उपलब्ध बैलेंस' },
  'wal.drawn': {
    en: 'Sessions, question packs and course fees are drawn from here.',
    hi: 'सत्र, सवालों के पैक और कोर्स फ़ीस यहीं से कटते हैं।',
  },
  'wal.working': { en: 'Working…', hi: 'हो रहा है…' },
  'wal.statement': { en: 'Statement', hi: 'स्टेटमेंट' },
  'wal.statementProto': { en: 'Statement — not built yet', hi: 'स्टेटमेंट — अभी बना नहीं' },
  'wal.historyProto': { en: 'Full history — not built yet', hi: 'पूरा इतिहास — अभी बना नहीं' },
  'wal.recent': { en: 'Recent transactions', hi: 'हाल के लेन-देन' },
  'wal.empty': {
    en: 'Nothing has moved through this wallet yet.',
    hi: 'इस वॉलेट में अभी कोई लेन-देन नहीं हुआ।',
  },
  'wal.serverNote': {
    en: "Every figure here is the server's. The balance is a sum of the entries below it, and neither can be edited from this device.",
    hi: 'यहाँ का हर आंकड़ा सर्वर से आता है। बैलेंस नीचे की एंट्रियों का जोड़ है, और इस डिवाइस से इनमें से कुछ भी बदला नहीं जा सकता।',
  },
  'wal.other': { en: 'Or another amount', hi: 'या कोई और रकम' },
  'wal.range': { en: '100 to 1,00,000', hi: '100 से 1,00,000' },
  'wal.opening': { en: 'Opening checkout…', hi: 'भुगतान पेज खुल रहा है…' },
  'wal.continue': { en: 'Continue', hi: 'आगे बढ़ें' },
  'wal.razorpay': {
    en: 'Payment is handled by Razorpay. Your balance updates when they confirm it, which is a moment after you pay.',
    hi: 'भुगतान Razorpay से होता है। उनके पुष्टि करते ही आपका बैलेंस अपडेट होगा, यानी भुगतान के एक पल बाद।',
  },

  // ── Welcome: phone first, the one door in (3 Oct 2026) ───────────────────
  'w.title': {
    en: 'Your kundli, astrologer and mandir darshan in one place',
    hi: 'आपकी कुंडली, ज्योतिषी और मंदिर दर्शन, एक ही जगह',
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
