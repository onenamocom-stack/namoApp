/**
 * The Namo AI chats on Consult, one for each kind of Pro (21 Oct 2026,
 * Rahul): a box over each category's list, chat only, marked AI. The key is
 * the server's persona (apps/ai/personas.py); everything a chat says is the
 * server's — this holds only what the screens print around it.
 *
 * The astrologer is the original Namo AI and reads the seeker's chart; the
 * others read only what is typed. All four spend the same free questions.
 */
export const AI_BOTS = {
  Astrologer: {
    key: 'astrologer',
    name: 'bot.astrologer',
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
  Tarot: {
    key: 'tarot',
    name: 'bot.tarot',
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
  'Life Coach': {
    key: 'life_coach',
    name: 'bot.life_coach',
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
  Therapist: {
    key: 'therapist',
    name: 'bot.therapist',
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

/** The chat for a persona key, the astrologer when unknown. */
export function botFor(key) {
  return Object.values(AI_BOTS).find((b) => b.key === key) ?? AI_BOTS.Astrologer
}
