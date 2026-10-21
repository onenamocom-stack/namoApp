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
  // The seven categories Rahul added on 21 Oct 2026.
  vedic_wisdom: {
    hue: '#b8860b',
    thinking: 'bot.thinking',
    hello: 'bot.vedic_wisdom.hello',
    ask: 'bot.vedic_wisdom.ask',
    suggestions: {
      en: [
        'What does the Gita say about anger?',
        'How do I do my duty without worrying about the result?',
        'What is karma, simply?',
        'How do I deal with the loss of someone close?',
      ],
      hi: [
        'गीता क्रोध के बारे में क्या कहती है?',
        'फल की चिंता किए बिना कर्म कैसे करूँ?',
        'कर्म क्या है, आसान शब्दों में?',
        'किसी अपने को खोने का दुख कैसे सहूँ?',
      ],
    },
  },
  energy_healing: {
    hue: '#8e24aa',
    thinking: 'bot.thinking',
    hello: 'bot.energy_healing.hello',
    ask: 'bot.energy_healing.ask',
    suggestions: {
      en: [
        'I feel drained all the time. What can I do?',
        'How do I balance my chakras?',
        'Teach me a breathing practice for calm.',
        'What is reiki, and can I do it myself?',
      ],
      hi: [
        'हर समय थकान रहती है, क्या करूँ?',
        'अपने चक्र संतुलित कैसे करूँ?',
        'शांति के लिए कोई प्राणायाम बताइए।',
        'रेकी क्या है, क्या मैं ख़ुद कर सकता हूँ?',
      ],
    },
  },
  meditation: {
    hue: '#3949ab',
    thinking: 'bot.thinking',
    hello: 'bot.meditation.hello',
    ask: 'bot.meditation.ask',
    suggestions: {
      en: [
        'Guide me through a five-minute meditation.',
        'My mind keeps wandering. What do I do?',
        'Help me fall asleep.',
        'How do I start a daily practice?',
      ],
      hi: [
        'पाँच मिनट का ध्यान करवाइए।',
        'मन भटकता रहता है, क्या करूँ?',
        'नींद आने में मदद कीजिए।',
        'रोज़ ध्यान की आदत कैसे डालूँ?',
      ],
    },
  },
  puja_seva: {
    hue: '#e65100',
    thinking: 'bot.thinking',
    hello: 'bot.puja_seva.hello',
    ask: 'bot.puja_seva.ask',
    suggestions: {
      en: [
        'How do I do a Satyanarayan puja at home?',
        'What do I need for griha pravesh?',
        'Which mantra for Monday puja?',
        'How do I do Lakshmi puja on Diwali?',
      ],
      hi: [
        'घर पर सत्यनारायण पूजा कैसे करूँ?',
        'गृह प्रवेश के लिए क्या-क्या चाहिए?',
        'सोमवार की पूजा में कौन सा मंत्र?',
        'दिवाली पर लक्ष्मी पूजा कैसे करूँ?',
      ],
    },
  },
  numerology: {
    hue: '#00897b',
    thinking: 'bot.numerology.thinking',
    hello: 'bot.numerology.hello',
    ask: 'bot.numerology.ask',
    suggestions: {
      en: [
        'What is my life path number?',
        'Is my name lucky for me?',
        'Which date is good for my wedding?',
        'Is my mobile number good for me?',
      ],
      hi: [
        'मेरा मूलांक और भाग्यांक क्या है?',
        'क्या मेरा नाम मेरे लिए शुभ है?',
        'शादी के लिए कौन सी तारीख़ अच्छी है?',
        'क्या मेरा मोबाइल नंबर मेरे लिए ठीक है?',
      ],
    },
  },
  telepathy: {
    hue: '#5e35b1',
    thinking: 'bot.thinking',
    hello: 'bot.telepathy.hello',
    ask: 'bot.telepathy.ask',
    suggestions: {
      en: [
        'How do I sharpen my intuition?',
        'I keep dreaming of someone. What does it mean?',
        'How do I trust my gut?',
        'Why do I feel what others feel?',
      ],
      hi: [
        'अपना अंतर्ज्ञान कैसे तेज़ करूँ?',
        'किसी का सपना बार-बार आता है, क्या मतलब है?',
        'अपने मन की आवाज़ पर भरोसा कैसे करूँ?',
        'मुझे दूसरों की भावनाएँ क्यों महसूस होती हैं?',
      ],
    },
  },
  vastu: {
    hue: '#6d4c41',
    thinking: 'bot.thinking',
    hello: 'bot.vastu.hello',
    ask: 'bot.vastu.ask',
    suggestions: {
      en: [
        'My main door faces south. Is that bad?',
        'Where should the puja room be?',
        'Which way should I sleep?',
        'Where do I keep money at home?',
      ],
      hi: [
        'मेरा मुख्य दरवाज़ा दक्षिण में है, क्या यह ठीक है?',
        'पूजा घर किस दिशा में हो?',
        'सोते समय सिर किस दिशा में रखूँ?',
        'घर में पैसा कहाँ रखूँ?',
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
