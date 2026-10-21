/**
 * The AI Pros on Consult (21 Oct 2026, Rahul): a box over each category's
 * list, chat only. Which ones exist, their names, pictures and AI line are
 * the console's (`GET /v1/ai/bots/`); this holds only what the chat screen
 * prints around a conversation, by the AI Pro's key: its welcome (drawn on
 * open, never sent), the questions offered over the box, in English and
 * Hindi. A category added later has no entry here and gets GENERIC.
 *
 * The astrologer is the original Namo AI and reads the seeker's chart; the
 * others read only what is typed.
 */
const COPY = {
  astrologer: {
    hue: '#7c4dff',
    thinking: 'ask.thinking',
    hello: 'bot.astrologer.hello',
    ask: 'bot.astrologer.ask',
    suggestions: {
      en: [
        'Is this a good month to change jobs?',
        'When will I get married?',
        'When is a good window to invest?',
        'Which remedies suit me?',
      ],
      hi: [
        'क्या इस महीने नौकरी बदलना ठीक है?',
        'मेरी शादी कब होगी?',
        'पैसा लगाने का अच्छा समय कब है?',
        'मेरे लिए कौन से उपाय ठीक हैं?',
      ],
    },
  },
  tarot: {
    hue: '#d81b60',
    thinking: 'bot.tarot.thinking',
    hello: 'bot.tarot.hello',
    ask: 'bot.tarot.ask',
    suggestions: {
      en: [
        'Draw three cards for my career.',
        'Will this relationship last?',
        'What should I focus on this month?',
        'Should I take the offer I got?',
      ],
      hi: [
        'मेरे करियर के लिए तीन कार्ड निकालिए।',
        'क्या यह रिश्ता चलेगा?',
        'इस महीने मुझे किस पर ध्यान देना चाहिए?',
        'जो ऑफ़र मिला है, क्या उसे ले लूँ?',
      ],
    },
  },
  life_coach: {
    hue: '#1e9e5a',
    thinking: 'bot.thinking',
    hello: 'bot.life_coach.hello',
    ask: 'bot.life_coach.ask',
    suggestions: {
      en: [
        'I keep putting things off. Where do I start?',
        'Should I switch careers?',
        'How do I get my confidence back?',
        'I want to build a morning routine.',
      ],
      hi: [
        'मैं काम टालता रहता हूँ। कहाँ से शुरू करूँ?',
        'क्या मुझे करियर बदलना चाहिए?',
        'अपना आत्मविश्वास वापस कैसे लाऊँ?',
        'मुझे सुबह की अच्छी आदत बनानी है।',
      ],
    },
  },
  therapist: {
    hue: '#0288d1',
    thinking: 'bot.thinking',
    hello: 'bot.therapist.hello',
    ask: 'bot.therapist.ask',
    suggestions: {
      en: [
        'I feel anxious most days.',
        'I cannot sleep and my mind keeps racing.',
        'My family does not understand me.',
        'I feel lonely.',
      ],
      hi: [
        'ज़्यादातर दिन मन घबराया रहता है।',
        'नींद नहीं आती, दिमाग़ चलता रहता है।',
        'मेरा परिवार मुझे नहीं समझता।',
        'मैं अकेला महसूस करता हूँ।',
      ],
    },
  },
}

const GENERIC = {
  hue: '#f08a24',
  thinking: 'bot.thinking',
  hello: 'bot.generic.hello',
  ask: 'bot.generic.ask',
  suggestions: { en: [], hi: [] },
}

/** What the chat screen shows around an AI Pro's conversation. */
export function copyFor(key) {
  return COPY[key] ?? GENERIC
}

/** The AI line in the reader's language: the console's Hindi if it has one. */
export function aiLine(bot, lang) {
  return (lang === 'hi' && bot?.label_hi) || bot?.label || ''
}
