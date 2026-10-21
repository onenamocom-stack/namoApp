/**
 * The AI Pros on Consult (21 Oct 2026, Rahul): a box over each category's
 * list, chat only. Which ones exist, their names, pictures and AI line are
 * the console's (`GET /v1/ai/bots/`); this holds only what the chat screen
 * prints around a conversation, by the AI Pro's key. A category added later
 * has no entry here and gets GENERIC.
 *
 * The astrologer is the original Namo AI and reads the seeker's chart; the
 * others read only what is typed.
 */
const COPY = {
  astrologer: {
    hue: '#7c4dff',
    title: 'ask.title',
    sub: 'ask.sub',
    thinking: 'ask.thinking',
    suggestions: [
      'Is this a good month to change jobs?',
      'What does my chart say about my relationship?',
      'When is a good window to invest?',
      'Which remedies suit me?',
    ],
  },
  tarot: {
    hue: '#d81b60',
    title: 'bot.tarot.title',
    sub: 'bot.tarot.sub',
    thinking: 'bot.tarot.thinking',
    suggestions: [
      'Draw three cards for my career.',
      'Will this relationship last?',
      'What should I focus on this month?',
      'Should I take the offer I got?',
    ],
  },
  life_coach: {
    hue: '#1e9e5a',
    title: 'bot.life_coach.title',
    sub: 'bot.life_coach.sub',
    thinking: 'bot.thinking',
    suggestions: [
      'I keep putting things off. Where do I start?',
      'Should I switch careers at 30?',
      'How do I get my confidence back?',
      'I want to build a morning routine.',
    ],
  },
  therapist: {
    hue: '#0288d1',
    title: 'bot.therapist.title',
    sub: 'bot.therapist.sub',
    thinking: 'bot.thinking',
    suggestions: [
      'I feel anxious most days.',
      'I cannot sleep and my mind keeps racing.',
      'My family does not understand me.',
      'I feel lonely after moving cities.',
    ],
  },
}

const GENERIC = {
  hue: '#f08a24',
  title: 'bot.generic.title',
  sub: 'bot.generic.sub',
  thinking: 'bot.thinking',
  suggestions: [],
}

/** What the chat screen shows around an AI Pro's conversation. */
export function copyFor(key) {
  return COPY[key] ?? GENERIC
}

/** The AI line in the reader's language: the console's Hindi if it has one. */
export function aiLine(bot, lang) {
  return (lang === 'hi' && bot?.label_hi) || bot?.label || ''
}
