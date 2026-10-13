"""What a person picks at sign-up (13 Oct 2026, docs/06 Phase 15a).

Each interest is a key the app shows by name, and the words that mark a post
as about it, in English and Hindi. The personal feed (`content/ranking.py`)
lifts a post whose caption, body, title or hashtags carry one of the reader's
words. Posts carry no topic of their own, so the words are the match.
"""

INTERESTS = {
    "bhakti": ["bhakti", "bhajan", "kirtan", "aarti", "puja", "pooja", "darshan", "भक्ति", "भजन", "आरती", "पूजा", "दर्शन"],
    "astrology": ["astrology", "kundli", "horoscope", "rashifal", "rashi", "jyotish", "ज्योतिष", "कुंडली", "राशिफल", "राशि"],
    "yoga": ["yoga", "asana", "pranayama", "योग", "आसन", "प्राणायाम"],
    "meditation": ["meditation", "dhyan", "dhyana", "mindfulness", "ध्यान"],
    "mantra": ["mantra", "jaap", "japa", "chant", "मंत्र", "जाप"],
    "ayurveda": ["ayurveda", "ayurvedic", "आयुर्वेद"],
    "festivals": ["festival", "diwali", "navratri", "holi", "janmashtami", "shivratri", "vrat", "त्योहार", "दिवाली", "नवरात्रि", "होली", "व्रत"],
    "temples": ["temple", "mandir", "tirth", "yatra", "मंदिर", "तीर्थ", "यात्रा"],
    "scripture": ["gita", "ramayan", "ramayana", "mahabharat", "katha", "pravachan", "गीता", "रामायण", "कथा", "प्रवचन"],
    "jain": ["jain", "jainism", "mahavir", "navkar", "bhaktamar", "जैन", "महावीर", "नवकार", "भक्तामर"],
    "vastu": ["vastu", "वास्तु"],
    "numerology": ["numerology", "अंक ज्योतिष"],
}

MIN_PICK = 3
MAX_PICK = 5
