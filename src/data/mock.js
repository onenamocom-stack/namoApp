// All data in this prototype is hardcoded. No network calls anywhere in the app.
//
// VOICE RULES for every string in this file — the design fails without them:
//   second person, present tense, imperative. Short declarative sentences.
//   No hedging, no emoji, no exclamation marks. Range from practical
//   ("reach out to the person you have been avoiding") to cryptic
//   ("be the absence of want"). Blunt, occasionally unkind.
// Warm supportive copy over this layout would make it read as a template.
//
// The one exception is `bhaktamar.js`: scripture, transliteration and remedies
// carried over verbatim. Those are not ours to rewrite.

import { bhaktamarCards } from './bhaktamar.js'

export const user = {
  name: 'Ananya',
  sunSign: 'Scorpio',
  moonSign: 'Pisces',
  risingSign: 'Leo',
  birthDate: '14 November 1996',
  birthTime: '04:35 AM',
  birthPlace: 'Pune, Maharashtra, India',
  walletBalance: 1240,
  initials: 'A',
}

/* ══════════════════════════════════════════════════════════════════════════
   DAY — three days of readings. The horoscope body is the first thing on the
   home screen; everything else on TODAY is subordinate to it.
   ══════════════════════════════════════════════════════════════════════════ */

export const days = {
  yesterday: {
    key: 'yesterday',
    label: 'Yesterday',
    date: 'Sunday, 2 August',
    headline: 'You were right to wait.',
    body: 'The morning asked more of you than it gave back. Whatever you left unsaid at lunch was the correct call. It would have landed badly and you knew it.',
    // Shown above the reading on any day that is not today, so the tense of
    // the copy is never a surprise.
    context: 'Looking back.',
    // The one instruction. On yesterday it is framed as a review.
    focus: 'Note what you avoided, and why.',
    focusLabel: 'Looking back',
    mood: 'Restless',
    luckyColour: 'Rust',
    luckyNumber: 3,
    // "Day at a Glance" — three plain readings, no icons, no scores out of ten.
    glance: [
      { key: 'Mood', value: 'Restless' },
      { key: 'Energy', value: 'Low until dusk' },
      { key: 'Theme', value: 'Restraint' },
    ],
    intensity: 42,
    do: ['Finish the thing from Thursday', 'Eat before the call', 'Let the silence sit'],
    dont: ['Reopen the argument', 'Check what they posted', 'Promise a date you cannot keep'],
    gettingAlong: [
      { sign: 'Capricorn', note: 'They will not flatter you. Useful today.' },
      { sign: 'Cancer', note: 'Same weather, different room.' },
    ],
    friction: [{ sign: 'Aries', note: 'Too fast for the mood you are in.' }],
    transits: [
      {
        id: 't-y1',
        title: 'Moon square Saturn',
        window: '2 Aug, evening',
        weight: 'Passing',
        body: 'A heavy few hours around dusk. Low energy was the transit, not a verdict on you.',
      },
    ],
    reflections: [
      'Name the thing you avoided. Then name why.',
      'What did the silence cost you, and was it worth it.',
    ],
    power: 'Reading the room before you spoke. It saved you a conversation.',
    pressure: 'Filling every silence. Two of them did not need you.',
    ratings: { love: 3, career: 2, health: 4, money: 3 },
  },
  today: {
    key: 'today',
    label: 'Today',
    date: 'Monday, 3 August',
    headline: 'Say less than you want to.',
    body: 'Mercury softens the noise around a decision you have been circling for weeks. The person you are negotiating with is closer to yes than they look. Do not talk them out of it.',
    context: null,
    focus: 'Say the plain version of the thing.',
    focusLabel: 'Do this',
    mood: 'Reflective',
    luckyColour: 'Deep teal',
    luckyNumber: 7,
    glance: [
      { key: 'Mood', value: 'Reflective' },
      { key: 'Energy', value: 'Steady' },
      { key: 'Theme', value: 'Precision' },
    ],
    intensity: 68,
    do: ['Send the plain version', 'Ask once, then stop', 'Take the long walk'],
    dont: ['Explain yourself twice', 'Decide before noon', 'Mistake quiet for rejection'],
    gettingAlong: [
      { sign: 'Virgo', note: 'They will edit you. Let them.' },
      { sign: 'Pisces', note: 'You do not have to finish your sentences.' },
    ],
    friction: [{ sign: 'Gemini', note: 'Three ideas, none of them landing.' }],
    transits: [
      {
        id: 't-t1',
        title: 'Venus enters your 7th house',
        window: '3 Aug — 27 Aug',
        weight: 'Moderate',
        body: 'Partnership matters soften. A good window for repair conversations and for contracts you have been rereading.',
      },
      {
        id: 't-t2',
        title: 'Mercury direct in Cancer',
        window: 'Until 11 Aug',
        weight: 'Background',
        body: 'Old messages resurface. Answer the one you have been pretending not to see.',
      },
    ],
    reflections: [
      'What are you waiting to be given permission for.',
      'Who benefits from you staying vague.',
    ],
    power: 'Your instinct for reading a room. Use it in the conversation you have been avoiding.',
    pressure: 'Wanting the outcome guaranteed before you begin. Nothing today will offer that.',
    ratings: { love: 4, career: 5, health: 3, money: 4 },
  },
  tomorrow: {
    key: 'tomorrow',
    label: 'Tomorrow',
    date: 'Tuesday, 4 August',
    headline: 'Protect the first two hours.',
    body: 'Mars moves into your 3rd house and the pace picks up sharply. Front-load anything that needs care. By afternoon you will be reacting rather than choosing.',
    context: 'Keep the morning clear.',
    focus: 'Front-load the day.',
    focusLabel: 'Do this',
    mood: 'Charged',
    luckyColour: 'Gold',
    luckyNumber: 1,
    glance: [
      { key: 'Mood', value: 'Charged' },
      { key: 'Energy', value: 'Front-loaded' },
      { key: 'Theme', value: 'Speed' },
    ],
    intensity: 81,
    do: ['Start before you feel ready', 'Say the number out loud', 'Close one open loop'],
    dont: ['Agree to three things by noon', 'Reply while angry', 'Book the evening'],
    gettingAlong: [
      { sign: 'Aries', note: 'Finally a matching tempo.' },
      { sign: 'Leo', note: 'They will take the room. Let them, and use the cover.' },
    ],
    friction: [{ sign: 'Taurus', note: 'They are not slow. You are early.' }],
    transits: [
      {
        id: 't-m1',
        title: 'Mars enters your 3rd house',
        window: '4 Aug — 19 Sep',
        weight: 'Strong',
        body: 'Conversations get sharper and faster. Useful for negotiation. Dangerous for old arguments.',
      },
    ],
    reflections: [
      'What would you start if nobody asked how it went.',
      'Be the absence of want, for one hour.',
    ],
    power: 'Speed. For one day, your first instinct is the correct one.',
    pressure: 'Saying yes to three things before noon. Pick one.',
    ratings: { love: 3, career: 5, health: 3, money: 5 },
  },
}

export const today = days.today

/* ══════════════════════════════════════════════════════════════════════════
   CHART — table view is the primary; the wheel is the alternate. Every row
   drills into a placement page.
   ══════════════════════════════════════════════════════════════════════════ */

export const placements = [
  {
    id: 'sun',
    glyph: '☉',
    body: 'Sun',
    sign: 'Scorpio',
    house: 4,
    degree: '22° 14′',
    line: 'You do not do small talk and you do not pretend to.',
    detail:
      'The Sun in the 4th house puts your centre of gravity indoors. You build the room before you build the career, and you are unusually hard to move once the room is right. In Scorpio it means privacy is not shyness — it is a filter, and you apply it early.',
    keywords: ['Private', 'Rooted', 'Unbudgeable'],
  },
  {
    id: 'moon',
    glyph: '☽',
    body: 'Moon',
    sign: 'Pisces',
    house: 8,
    degree: '03° 47′',
    line: 'You feel other people’s weather before they announce it.',
    detail:
      'An 8th-house Moon recovers slowly and in private. You process by disappearing, which the people around you read as withdrawal. It is not. Tell them the difference once, plainly, and stop apologising for the pattern.',
    keywords: ['Porous', 'Slow to recover', 'Nocturnal'],
  },
  {
    id: 'asc',
    glyph: 'Asc',
    body: 'Rising',
    sign: 'Leo',
    house: 1,
    degree: '11° 02′',
    line: 'You are read as confident before you have said anything.',
    detail:
      'Leo rising means you are handed authority you did not ask for. It works in rooms and costs you in friendships, where people wait for you to go first because they assume you want to.',
    keywords: ['Presented', 'Warm front', 'Assumed capable'],
  },
  {
    id: 'mercury',
    glyph: '☿',
    body: 'Mercury',
    sign: 'Scorpio',
    house: 4,
    degree: '29° 51′',
    line: 'You ask the question under the question.',
    detail:
      'Mercury at the last degree of a sign is impatient with the obvious. You skip the preamble, which reads as sharp. It is not unkindness. It is a refusal to spend time on the part everyone already knows.',
    keywords: ['Investigative', 'Terse', 'Impatient'],
  },
  {
    id: 'venus',
    glyph: '♀',
    body: 'Venus',
    sign: 'Sagittarius',
    house: 5,
    degree: '08° 33′',
    line: 'You want to be interested more than you want to be comfortable.',
    detail:
      'Venus in the 5th wants the thing to stay a little unfinished. You are drawn to people who are going somewhere, which is thrilling for two years and a logistics problem in the third.',
    keywords: ['Curious', 'Restless', 'Generous'],
  },
  {
    id: 'mars',
    glyph: '♂',
    body: 'Mars',
    sign: 'Libra',
    house: 3,
    degree: '17° 26′',
    line: 'You argue politely and win late.',
    detail:
      'Mars in Libra does not raise its voice. It waits, restates the other side better than they did, and then moves. The cost is delay — you will sit on a decision for a month to keep a room calm.',
    keywords: ['Strategic', 'Deferring', 'Verbal'],
  },
  {
    id: 'jupiter',
    glyph: '♃',
    body: 'Jupiter',
    sign: 'Taurus',
    house: 10,
    degree: '05° 19′',
    line: 'Your luck arrives through work, slowly, and it holds.',
    detail:
      'A 10th-house Jupiter in Taurus does not do windfalls. It does compounding. Reputation is your actual asset and it grows in years, not quarters. Protect it accordingly.',
    keywords: ['Compounding', 'Public', 'Slow'],
  },
  {
    id: 'saturn',
    glyph: '♄',
    body: 'Saturn',
    sign: 'Cancer',
    house: 12,
    degree: '14° 08′',
    line: 'The thing you are hardest on is the thing nobody sees.',
    detail:
      'Saturn in the 12th audits you in private. You hold a standard for your inner life that you would never impose on anyone else, and you call the gap between them a character flaw. It is not. It is the placement.',
    keywords: ['Self-auditing', 'Hidden', 'Severe'],
  },
]

export const chartHouses = [
  { house: 1, sign: 'Leo', planets: ['Ke'] },
  { house: 2, sign: 'Virgo', planets: [] },
  { house: 3, sign: 'Libra', planets: ['Ma'] },
  { house: 4, sign: 'Scorpio', planets: ['Su', 'Me'] },
  { house: 5, sign: 'Sagittarius', planets: ['Ve'] },
  { house: 6, sign: 'Capricorn', planets: [] },
  { house: 7, sign: 'Aquarius', planets: ['Ra'] },
  { house: 8, sign: 'Pisces', planets: ['Mo'] },
  { house: 9, sign: 'Aries', planets: [] },
  { house: 10, sign: 'Taurus', planets: ['Ju'] },
  { house: 11, sign: 'Gemini', planets: [] },
  { house: 12, sign: 'Cancer', planets: ['Sa'] },
]

/* ══════════════════════════════════════════════════════════════════════════
   PEOPLE — friend list → synastry breakdown → invite.
   ══════════════════════════════════════════════════════════════════════════ */

export const people = [
  {
    id: 'p1',
    name: 'Kabir',
    initials: 'K',
    sun: 'Capricorn',
    moon: 'Virgo',
    rising: 'Scorpio',
    since: 'Since Mar 2025',
    verdict: 'Blunt in the same direction.',
    score: 78,
    axes: [
      { key: 'Ease', value: 82, note: 'Neither of you needs the small talk.' },
      { key: 'Friction', value: 64, note: 'You both wait for the other to concede first.' },
      { key: 'Attraction', value: 71, note: 'Sun trine Sun. Steady, not electric.' },
      { key: 'Endurance', value: 88, note: 'Saturn contacts. This one outlasts things.' },
    ],
    aspects: [
      { title: 'Your Saturn on their Sun', line: 'You are the reality check. They asked for it once and regret it monthly.' },
      { title: 'Their Mercury square your Moon', line: 'They explain. You wanted to be sat with. Say that out loud.' },
    ],
    advice: 'Stop testing whether they will leave. They have answered.',
  },
  {
    id: 'p2',
    name: 'Rhea',
    initials: 'R',
    sun: 'Gemini',
    moon: 'Aries',
    rising: 'Sagittarius',
    since: 'Since Nov 2024',
    verdict: 'Fun, and expensive.',
    score: 62,
    axes: [
      { key: 'Ease', value: 74, note: 'Nothing is ever awkward for long.' },
      { key: 'Friction', value: 81, note: 'Three plans, none confirmed. Every time.' },
      { key: 'Attraction', value: 86, note: 'Mars contacts. Loud and immediate.' },
      { key: 'Endurance', value: 38, note: 'Nothing in the chart asks either of you to stay.' },
    ],
    aspects: [
      { title: 'Their Mars opposite your Venus', line: 'You want to be chosen. They want to be moving. Both are true.' },
      { title: 'Your Moon square their Sun', line: 'They read your quiet as a mood. It is a recovery.' },
    ],
    advice: 'Enjoy it in short formats. Do not co-sign anything.',
  },
  {
    id: 'p3',
    name: 'Ishaan',
    initials: 'I',
    sun: 'Taurus',
    moon: 'Pisces',
    rising: 'Cancer',
    since: 'Since Jan 2026',
    verdict: 'Slower than you. That is the point.',
    score: 84,
    axes: [
      { key: 'Ease', value: 90, note: 'Moon trine Moon. You recover the same way.' },
      { key: 'Friction', value: 32, note: 'Almost none, which you will misread as boredom.' },
      { key: 'Attraction', value: 66, note: 'Warm rather than urgent.' },
      { key: 'Endurance', value: 85, note: 'Fixed signs. Neither of you exits cleanly.' },
    ],
    aspects: [
      { title: 'Their Venus trine your Moon', line: 'They are kind to you without being asked. Notice it before it stops.' },
      { title: 'Your Mars square their Saturn', line: 'You push, they brace. Neither of you is wrong. Change the pace.' },
    ],
    advice: 'You are waiting for a spark that this one produces as heat instead.',
  },
  {
    id: 'p4',
    name: 'Priya',
    initials: 'P',
    sun: 'Leo',
    moon: 'Aquarius',
    rising: 'Virgo',
    since: 'Since Aug 2023',
    verdict: 'You perform for each other.',
    score: 55,
    axes: [
      { key: 'Ease', value: 48, note: 'Both of you are managing the impression.' },
      { key: 'Friction', value: 70, note: 'Two people who need the last word.' },
      { key: 'Attraction', value: 74, note: 'Rising conjunct Sun. You look good together.' },
      { key: 'Endurance', value: 52, note: 'Held up by history rather than fit.' },
    ],
    aspects: [
      { title: 'Their Moon opposite your Sun', line: 'They need distance to feel close. Do not chase into it.' },
      { title: 'Your Mercury square their Mercury', line: 'You are having two different arguments at the same volume.' },
    ],
    advice: 'Have one unimpressive conversation and see what is left.',
  },
]

/* ══════════════════════════════════════════════════════════════════════════
   NOTIFICATIONS — one or two sentences. Aphoristic. This is the thing people
   screenshot, so it carries more of the brand than any screen does.
   ══════════════════════════════════════════════════════════════════════════ */

export const notifications = [
  { id: 'n1', time: 'Today, 08:00', text: 'Say the plain version of the thing.' },
  { id: 'n2', time: 'Today, 07:12', text: 'Venus entered your 7th house. Someone is about to be easier to talk to. It is not permanent.' },
  { id: 'n3', time: 'Yesterday, 08:00', text: 'You are not indecisive. You are waiting to be told it is allowed.' },
  { id: 'n4', time: 'Yesterday, 19:30', text: 'Kabir opened your chart. Read into that whatever you like.' },
  { id: 'n5', time: 'Sat, 08:00', text: 'Be the absence of want.' },
  { id: 'n6', time: 'Fri, 08:00', text: 'A good day to reach out to someone you have been avoiding. You know which one.' },
  { id: 'n7', time: 'Thu, 08:00', text: 'Nothing is being withheld from you. It is simply not ready.' },
]

/* ══════════════════════════════════════════════════════════════════════════
   READ — the content layer carried over from the previous layout: posts,
   long reads, short video, live rooms.
   ══════════════════════════════════════════════════════════════════════════ */

export const posts = [
  {
    id: 'po1',
    consultantId: 'a1',
    consultant: 'Ritu Kashyap',
    initials: 'RK',
    role: 'Vedic astrologer',
    time: '2h',
    text: 'For the people messaging me at midnight: a difficult transit is a forecast, not a sentence. Rain is coming. You still choose whether to carry an umbrella or cancel the trip.',
    likes: 1842,
    comments: 96,
    shares: 41,
    saved: false,
  },
  {
    id: 'po2',
    consultantId: 'a3',
    consultant: 'Meher Bano',
    initials: 'MB',
    role: 'Tarot reader',
    time: '5h',
    text: 'Today’s pull for the collective: Eight of Cups. Something you built is no longer something you want. That is allowed.',
    plate: 'Eight of Cups',
    likes: 3120,
    comments: 214,
    shares: 88,
    saved: true,
  },
  {
    id: 'po3',
    consultantId: 'a6',
    consultant: 'Simran Kaur',
    initials: 'SK',
    role: 'Life coach',
    time: '9h',
    text: 'Four clients this week described the same thing: they know the decision, they are waiting for someone to approve it. Consider this your approval.',
    likes: 967,
    comments: 52,
    shares: 23,
    saved: false,
  },
  {
    id: 'po4',
    consultantId: 'a5',
    consultant: 'Yogesh Pandit',
    initials: 'YP',
    role: 'Numerologist',
    time: '1d',
    text: 'A business name is not a lucky charm. It is a promise you have to keep saying out loud for ten years. Pick one you can stand to hear.',
    likes: 512,
    comments: 31,
    shares: 12,
    saved: false,
  },
]

export const reads = [
  {
    id: 'b1',
    consultantId: 'a1',
    consultant: 'Ritu Kashyap',
    initials: 'RK',
    title: 'Saturn Return: what actually happens at 29',
    excerpt:
      'Everyone warns you about it and nobody explains it. A plain reading of the transit, what it asks of you, and the three places it lands hardest.',
    readTime: '8 min',
    views: '42.1k',
    date: '1 Aug',
    tag: 'Transits',
    body: [
      'Everyone tells you the Saturn return is coming. Almost nobody tells you what it actually does, which is why it arrives feeling like a personal failure rather than a scheduled transit.',
      'Saturn takes roughly twenty-nine and a half years to go around the sun. At some point between twenty-eight and thirty-one it returns to the degree it occupied when you were born, and stays in the neighbourhood for about two years. That is the whole mechanism. There is nothing mystical about the timing.',
      'What it asks is narrow and consistent: it audits the structures you built on borrowed assumptions. The career you chose because it was legible to your parents. The relationship that works as long as nobody raises the real question. The city you moved to for one job you no longer have.',
      'It lands hardest in three places. The first is work, because that is where most people have accepted a default. The second is the relationship you have already privately decided about. The third is your relationship to your own authority — whether you are still waiting for someone to tell you it is allowed.',
      'The advice everyone gives is to endure it. That is half right. What actually shortens it is being the one who ends things, rather than waiting to be ended. Saturn does not reward patience. It rewards accuracy.',
    ],
  },
  {
    id: 'b2',
    consultantId: 'a4',
    consultant: 'Dr. Nandita Rao',
    initials: 'NR',
    title: 'Grief, rituals and the 8th house',
    excerpt:
      'Where clinical psychology and astrology actually agree: ritual gives loss a shape. What to do when the shape keeps changing.',
    readTime: '7 min',
    views: '31.5k',
    date: '29 Jul',
    tag: 'Wellness',
    body: [
      'Clinical psychology and astrology agree on almost nothing. They agree on this: ritual gives loss a shape, and shapeless loss is the kind that does not move.',
      'The 8th house is the traditional territory of death, inheritance and everything else you do not get to choose. Read plainly, it is the part of a chart that describes how you metabolise what happens to you rather than what you make happen.',
      'In practice, people arrive with the same problem stated two ways. Either the ritual stopped working, or there was never one to begin with. The first group has a funeral, an anniversary, a set of gestures that used to hold — and now feel like theatre. The second has nothing but the date.',
      'What helps is not a better ritual. It is accepting that the shape has to keep changing, because you keep changing, and a rite built for the person you were at the moment of the loss will not fit the person you are three years later.',
      'Make one small enough to repeat. Big rituals fail because you cannot face them twice.',
    ],
  },
  {
    id: 'b3',
    consultantId: 'a2',
    consultant: 'Dev Malhotra',
    initials: 'DM',
    title: 'Reading your Moon sign without the jargon',
    excerpt:
      'Your Moon is not a mood board. A working guide to the placement that governs how you recover from things.',
    readTime: '5 min',
    views: '18.7k',
    date: '27 Jul',
    tag: 'Basics',
    body: [
      'Your Moon sign gets described as your emotional nature, which is vague enough to be useless. Here is a working definition: the Moon is how you recover.',
      'Not what upsets you — that is most of the chart. Recovery. What you reach for when the day has already gone wrong, and how long it takes before you are available to other people again.',
      'A water Moon recovers by withdrawing and processing in private, which the people around you will read as withdrawal, because it is. An air Moon recovers by talking it into a shape. An earth Moon recovers by doing something with a visible result. A fire Moon recovers by moving.',
      'The useful part is not the label. It is that recovery styles are not interchangeable, and most conflict about feelings is actually conflict about method — one person wants to be talked through it and the other needs an hour alone, and both read the other as withholding.',
      'Tell someone how you recover once, plainly, before the next time you need to. It is a much shorter conversation in advance than during.',
    ],
  },
  {
    id: 'b4',
    consultantId: 'a6',
    consultant: 'Simran Kaur',
    initials: 'SK',
    title: 'The messy middle of a career change',
    excerpt:
      'The year after you quit is not a gap. It is the work. A structure for the part nobody posts about.',
    readTime: '6 min',
    views: '17.4k',
    date: '24 Jul',
    tag: 'Career',
    body: [
      'The year after you quit is not a gap. It is the work. Nobody posts about it because there is no photograph of it.',
      'The structure that helps is boring: name the thing you are actually optimising for, give the search a deadline, and separate the money question from the meaning question so they stop contaminating each other.',
      'Most people conflate those two and then wonder why every option feels wrong. A job can be a bridge without being a betrayal of the plan. Deciding that in advance removes about half the anguish.',
      'Expect the middle to be long, and expect to be worse company during it. Both are normal, and neither is evidence that the decision was wrong.',
      'The people who come out of it well are the ones who set a review date and kept it, rather than the ones who waited to feel certain.',
    ],
  },
]

export const clips = [
  {
    id: 'r1',
    consultantId: 'a1',
    consultant: 'Ritu Kashyap',
    initials: 'RK',
    caption: 'Your Saturn return is not a punishment. It is an audit.',
    audio: 'Original audio · Ritu Kashyap',
    duration: '0:48',
    views: '312k',
    likes: '24.1k',
    comments: '1.1k',
  },
  {
    id: 'r2',
    consultantId: 'a3',
    consultant: 'Meher Bano',
    initials: 'MB',
    caption: 'Pull one card before you reply to that message. Here is how.',
    audio: 'Original audio · Meher Bano',
    duration: '1:12',
    views: '186k',
    likes: '15.7k',
    comments: '642',
  },
  {
    id: 'r3',
    consultantId: 'a2',
    consultant: 'Dev Malhotra',
    initials: 'DM',
    caption: 'Three compatibility myths that keep good people apart.',
    audio: 'Original audio · Dev Malhotra',
    duration: '0:36',
    views: '97.4k',
    likes: '8.9k',
    comments: '410',
  },
  {
    id: 'r4',
    consultantId: 'a4',
    consultant: 'Dr. Nandita Rao',
    initials: 'NR',
    caption: 'Grief does not have stages. It has weather.',
    audio: 'Original audio · Dr. Nandita Rao',
    duration: '1:04',
    views: '441k',
    likes: '52.3k',
    comments: '2.8k',
  },
  {
    id: 'r5',
    consultantId: 'a5',
    consultant: 'Yogesh Pandit',
    initials: 'YP',
    caption: 'Pick your launch date like you pick a wedding date.',
    audio: 'Original audio · Yogesh Pandit',
    duration: '0:52',
    views: '64.2k',
    likes: '5.1k',
    comments: '288',
  },
]

export const liveSessions = [
  {
    id: 'l1',
    consultantId: 'a1',
    consultant: 'Ritu Kashyap',
    initials: 'RK',
    topic: 'Saturn transit Q&A — ask anything',
    viewers: '1.2k',
    startedAgo: '18 min',
    live: true,
    tag: 'Astrology',
  },
  {
    id: 'l2',
    consultantId: 'a3',
    consultant: 'Meher Bano',
    initials: 'MB',
    topic: 'Live card pulls for career blocks',
    viewers: '834',
    startedAgo: '5 min',
    live: true,
    tag: 'Tarot',
  },
  {
    id: 'l3',
    consultantId: 'a4',
    consultant: 'Dr. Nandita Rao',
    initials: 'NR',
    topic: 'Sleep, anxiety and the 8am spiral',
    viewers: '2.6k',
    startedAgo: '41 min',
    live: true,
    tag: 'Wellness',
  },
  {
    id: 'l4',
    consultantId: 'a6',
    consultant: 'Simran Kaur',
    initials: 'SK',
    topic: 'Quitting well — a live workshop',
    viewers: null,
    startsIn: 'Today, 19:00',
    live: false,
    tag: 'Coaching',
  },
]

export const liveChat = [
  { id: 'lc1', name: 'Kabir', initials: 'K', text: 'Does this apply if Saturn is retrograde natally?' },
  { id: 'lc2', name: 'Priya', initials: 'P', text: 'third time you have answered my question. thank you' },
  { id: 'lc3', name: 'Anon', initials: 'A', text: 'joining late — what house are we on' },
  { id: 'lc4', name: 'Rhea', initials: 'R', text: 'the umbrella line got me' },
  { id: 'lc5', name: 'Ishaan', initials: 'I', text: 'can you look at 1994 births next' },
]

/* ══════════════════════════════════════════════════════════════════════════
   CONSULT
   ══════════════════════════════════════════════════════════════════════════ */

export const categories = ['Astrologer', 'Tarot', 'Life Coach', 'Therapist', 'Numerologist']

export const consultants = [
  {
    id: 'a1',
    name: 'Ritu Kashyap',
    initials: 'RK',
    category: 'Astrologer',
    specialization: 'Vedic astrology · Career & timing',
    languages: ['Hindi', 'English'],
    rating: 4.9,
    reviewCount: 2148,
    experience: '12 yrs',
    price: 1499,
    online: true,
    followers: '84.2k',
    bio: 'I read charts the way a doctor reads a scan. Pattern first, prescription second. Twelve years, mostly career timing and relocation. I will not tell you what you want to hear, and I will not leave you without a next step.',
    credentials: ['Jyotish Visharad', 'ICAS Certified', '10k+ sessions'],
    slots: ['20 min'],
    reviews: [
      { id: 'r1', name: 'Kabir S.', rating: 5, ago: '2 days ago', text: 'She called the job change window down to the fortnight. Direct, no upselling, no fear talk.' },
      { id: 'r2', name: 'Priya M.', rating: 5, ago: '1 week ago', text: 'Second session. She remembers the chart and the context, which is rarer than it should be.' },
      { id: 'r3', name: 'Anonymous', rating: 4, ago: '3 weeks ago', text: 'Very useful on timing. Wish the call had run longer.' },
    ],
    content: [
      { id: 'p1', title: 'Saturn Return explained', type: 'Video', views: '42.1k' },
      { id: 'p2', title: 'When to sign a contract', type: 'Read', views: '11.2k' },
      { id: 'p3', title: 'Relocation & the 4th house', type: 'Video', views: '7.8k' },
      { id: 'p4', title: 'Reading a career dasha', type: 'Read', views: '5.1k' },
    ],
  },
  {
    id: 'a2',
    name: 'Dev Malhotra',
    initials: 'DM',
    category: 'Astrologer',
    specialization: 'KP system · Relationships',
    languages: ['English', 'Punjabi', 'Hindi'],
    rating: 4.7,
    reviewCount: 963,
    experience: '8 yrs',
    price: 999,
    online: false,
    followers: '31.5k',
    bio: 'KP practitioner working mostly with relationship and family questions. Sessions stay calm and specific. We look at the chart, we look at what you can change, and we stop there.',
    credentials: ['KP Astrology Diploma', '5k+ sessions'],
    slots: ['20 min'],
    reviews: [
      { id: 'r1', name: 'Sneha R.', rating: 5, ago: '4 days ago', text: 'Gentle and clear. Did not push a single remedy on me.' },
      { id: 'r2', name: 'Arjun T.', rating: 4, ago: '2 weeks ago', text: 'Took a while to get to the point but the reading was solid.' },
    ],
    content: [
      { id: 'p1', title: 'Moon sign, plainly', type: 'Read', views: '18.7k' },
      { id: 'p2', title: 'Compatibility myths', type: 'Video', views: '9.9k' },
      { id: 'p3', title: 'Reading the 7th lord', type: 'Read', views: '4.3k' },
    ],
  },
  {
    id: 'a3',
    name: 'Meher Bano',
    initials: 'MB',
    category: 'Tarot',
    specialization: 'Tarot · Decision clarity',
    languages: ['English', 'Urdu'],
    rating: 4.8,
    reviewCount: 1420,
    experience: '6 yrs',
    price: 899,
    online: true,
    followers: '52.0k',
    bio: 'Tarot as a thinking tool, not a fortune machine. Most clients arrive with a decision half-made and leave with it fully made. I take notes so you do not have to.',
    credentials: ['Certified Tarot Reader', 'Somatic Coaching L1', '4k+ sessions'],
    slots: ['20 min'],
    reviews: [
      { id: 'r1', name: 'Tara V.', rating: 5, ago: '1 day ago', text: 'Left with an actual decision instead of more anxiety.' },
      { id: 'r2', name: 'Ishaan G.', rating: 5, ago: '9 days ago', text: 'She asks better questions than the cards do, honestly.' },
    ],
    content: [
      { id: 'p1', title: 'Three spreads for career blocks', type: 'Video', views: '9.3k' },
      { id: 'p2', title: 'Reversals are not doom', type: 'Read', views: '6.6k' },
      { id: 'p3', title: 'A daily one-card habit', type: 'Video', views: '12.1k' },
    ],
  },
  {
    id: 'a4',
    name: 'Dr. Nandita Rao',
    initials: 'NR',
    category: 'Therapist',
    specialization: 'Clinical psychology · Grief & anxiety',
    languages: ['English', 'Kannada', 'Hindi'],
    rating: 4.9,
    reviewCount: 604,
    experience: '15 yrs',
    price: 2200,
    online: true,
    followers: '19.8k',
    bio: 'Licensed clinical psychologist. I work alongside, not instead of, whatever practice supports you. Grief, health anxiety and the long tail of burnout are what I see most.',
    credentials: ['M.Phil Clinical Psych', 'RCI Registered', 'CBT & ACT trained'],
    slots: ['20 min'],
    reviews: [
      { id: 'r1', name: 'Anonymous', rating: 5, ago: '5 days ago', text: 'First session in years where I did not feel rushed.' },
      { id: 'r2', name: 'Rhea D.', rating: 5, ago: '3 weeks ago', text: 'Steady, kind, extremely practical.' },
    ],
    content: [
      { id: 'p1', title: 'Grief, rituals and the 8th house', type: 'Read', views: '31.5k' },
      { id: 'p2', title: 'Sleep and the anxious mind', type: 'Video', views: '14.2k' },
    ],
  },
  {
    id: 'a5',
    name: 'Yogesh Pandit',
    initials: 'YP',
    category: 'Numerologist',
    specialization: 'Numerology · Name & business',
    languages: ['Hindi', 'Marathi'],
    rating: 4.5,
    reviewCount: 388,
    experience: '20 yrs',
    price: 749,
    online: false,
    followers: '8.4k',
    bio: 'Two decades of numerology work, mostly with founders deciding on names, launch dates and partnerships.',
    credentials: ['Chaldean & Pythagorean systems', '9k+ sessions'],
    slots: ['20 min'],
    reviews: [
      { id: 'r1', name: 'Manav J.', rating: 5, ago: '1 week ago', text: 'Named my company with him. Practical, quick, fair price.' },
      { id: 'r2', name: 'Anonymous', rating: 4, ago: '1 month ago', text: 'Good value. Call quality could be better.' },
    ],
    content: [
      { id: 'p1', title: 'Why launch dates matter', type: 'Read', views: '3.9k' },
      { id: 'p2', title: 'Business name basics', type: 'Video', views: '5.5k' },
    ],
  },
  {
    id: 'a6',
    name: 'Simran Kaur',
    initials: 'SK',
    category: 'Life Coach',
    specialization: 'Transitions · Career & identity',
    languages: ['English', 'Hindi'],
    rating: 4.6,
    reviewCount: 512,
    experience: '9 yrs',
    price: 1299,
    online: true,
    followers: '26.7k',
    bio: 'I coach people through the messy middle. The year after a resignation, a move, or a breakup. Structured sessions, homework if you want it, accountability if you ask.',
    credentials: ['ICF PCC', 'Positive Psychology Cert.'],
    slots: ['20 min'],
    reviews: [
      { id: 'r1', name: 'Nikhil B.', rating: 5, ago: '6 days ago', text: 'Turned a vague panic into a three-month plan.' },
      { id: 'r2', name: 'Aditi P.', rating: 4, ago: '2 weeks ago', text: 'Very structured. Bring notes.' },
    ],
    content: [
      { id: 'p1', title: 'The messy middle', type: 'Video', views: '17.4k' },
      { id: 'p2', title: 'Quitting well', type: 'Read', views: '8.1k' },
    ],
  },
]

/**
 * The consultant using the pro side.
 *
 * Pinned to a real record rather than invented, so his profile, reviews,
 * credentials, price ladder and published content are all populated on day
 * one — a1 already owns posts, reels, articles, a live room and a chat thread.
 */
export const pro = consultants[0]

/** Everything `pro` has published, out of whichever shared list you pass. */
export const mine = (list) => list.filter((x) => x.consultantId === pro.id)

/* ══════════════════════════════════════════════════════════════════════════
   PRO — the consultant's own side. Bookings he must answer, the money that
   comes out of them, and the slots he has already sold.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Sessions, across the whole lifecycle the seeker side never needed:
 * pending → confirmed → done. 'declined' exists as a status but never appears
 * in seed data; it is only ever produced by tapping Decline.
 */
export const bookings = [
  { id: 'bk1', client: 'Kabir S.', initials: 'KS', kind: 'Call', duration: '30 min', when: 'Today · 13:30', at: '13:30', startsIn: '2h 10m', price: 2998, status: 'pending',
    note: 'Offer letter from a new company. I need timing, not encouragement.', birthDate: '2 March 1994', birthTime: '11:20 PM' },
  { id: 'bk2', client: 'Priya M.', initials: 'PM', kind: 'Chat', duration: '15 min', when: 'Today · 16:00', at: '16:00', startsIn: '4h 40m', price: 1499, status: 'pending',
    note: 'Second session. Same relocation question, new dates.', birthDate: '19 July 1991', birthTime: '06:05 AM' },
  { id: 'bk3', client: 'Anonymous', initials: 'AN', kind: 'Live', duration: '10 min', when: 'Tomorrow · 09:30', at: '09:30', startsIn: '19h', price: 999, status: 'pending',
    note: 'I would rather not say in advance.', birthDate: '30 December 1999', birthTime: '02:50 PM' },
  { id: 'bk4', client: 'Rhea D.', initials: 'RD', kind: 'Call', duration: '30 min', when: 'Today · 11:00', at: '11:00', startsIn: 'Now', price: 2998, status: 'confirmed', birthDate: '8 May 1988', birthTime: '09:15 AM' },
  { id: 'bk5', client: 'Imran Q.', initials: 'IQ', kind: 'Chat', duration: '15 min', when: 'Today · 18:30', at: '18:30', startsIn: '7h 10m', price: 1499, status: 'confirmed', birthDate: '23 January 2000', birthTime: '07:40 PM' },
  { id: 'bk6', client: 'Sana B.', initials: 'SB', kind: 'Call', duration: '15 min', when: 'Today · 09:30', at: '09:30', startsIn: null, price: 1499, status: 'done', birthDate: '11 September 1993', birthTime: '01:05 AM' },
  { id: 'bk7', client: 'Vikram T.', initials: 'VT', kind: 'Call', duration: '30 min', when: 'Yesterday · 20:00', at: '20:00', startsIn: null, price: 2998, status: 'done', birthDate: '27 June 1985', birthTime: '04:30 PM' },
]

/**
 * Slots already sold today. Lives here rather than in a screen so the seeker's
 * booking sheet and the consultant's own availability grid cannot disagree —
 * book a slot as a client, switch sides, and it is gone from both.
 */
export const bookedSlots = ['11:00', '18:30']

/** Money. Gross, commission and net — a ledger of round credits looks fake. */
export const earnings = {
  available: 38420,
  pending: 11240,
  thisMonth: 74600,
  lifetime: 1284000,
  commissionPct: 18,
  nextPayoutOn: '12 Aug',
}

/**
 * Seven real numbers. `followers: '84.2k'` and `views: '312k'` elsewhere in
 * this file are display strings — do not parse them back into numbers; add the
 * figures a chart actually needs and leave the strings alone.
 */
/**
 * How the consultant is actually performing, as opposed to what she earned.
 *
 * These are the numbers a marketplace ranks on and a consultant is judged by,
 * so they sit in Earnings rather than in a vanity insights tab: a slow reply
 * and a missed call both cost money, and this is the screen about money.
 *
 * Real numbers, not display strings — `attended / requests` is computed and
 * charted, so parsing "84.2k" back out of a label is not a trap anyone can
 * fall into here.
 */
export const proMetrics = {
  medianReplyMins: 4,
  replyTargetMins: 10,
  callsAttended: 128,
  callsRequested: 146,
  sessionsCompleted: 119,
  repeatClientPct: 37,
  ratingAvg: 4.9,
  /** Median reply time by day, same seven days as the earnings bars. */
  replyByDay: [6, 4, 3, 5, 4, 2, 3],
}

export const earningsSeries = [
  { label: 'Mon', value: 4200 },
  { label: 'Tue', value: 7480 },
  { label: 'Wed', value: 2990 },
  { label: 'Thu', value: 9970 },
  { label: 'Fri', value: 6480 },
  { label: 'Sat', value: 12460 },
  { label: 'Sun', value: 5990 },
]

export const payouts = [
  { id: 'py1', amount: 52000, date: '29 Jul 2026', method: 'HDFC ••4412', status: 'Paid' },
  { id: 'py2', amount: 38400, date: '15 Jul 2026', method: 'HDFC ••4412', status: 'Paid' },
  { id: 'py3', amount: 44100, date: '1 Jul 2026', method: 'HDFC ••4412', status: 'Paid' },
]

/** Per-session earnings. Gross, the platform's cut, and what actually lands. */
export const proLedger = [
  { id: 'pl1', label: 'Sana B. · 15 min', date: 'Today', gross: 1499, fee: 270, net: 1229 },
  { id: 'pl2', label: 'Vikram T. · 30 min', date: 'Yesterday', gross: 2998, fee: 540, net: 2458 },
  { id: 'pl3', label: 'Natal report', date: 'Yesterday', gross: 4041, fee: 727, net: 3314 },
  { id: 'pl4', label: 'Meera J. · 30 min', date: '6 Aug', gross: 2998, fee: 540, net: 2458 },
  { id: 'pl5', label: 'Live room · tips', date: '5 Aug', gross: 860, fee: 155, net: 705 },
  { id: 'pl6', label: 'Arjun P. · 10 min', date: '4 Aug', gross: 999, fee: 180, net: 819 },
]

/**
 * Reach, and what it is doing. Every figure here is a NUMBER — `followers:
 * '84.2k'` and `views: '312k'` elsewhere in this file are display strings and
 * cannot be charted or compared without parsing them back, which is a trap.
 */
export const insights = {
  reach: 12400,
  reachDeltaPct: 18,
  profileViews: 2140,
  profileViewsDeltaPct: -6,
  followersGained: 312,
  saves: 486,

  /** Who actually watched. Not a guess — the consultant asks this constantly. */
  viewers: [
    { label: 'Returning', pct: 41 },
    { label: 'New', pct: 38 },
    { label: 'From search', pct: 21 },
  ],
  topCities: ['Mumbai', 'Pune', 'Bengaluru', 'Dubai'],

  /** Share of the audience online, by hour. Twelve two-hour buckets. */
  byHour: [3, 2, 2, 6, 11, 14, 12, 9, 16, 24, 19, 8],
  bestWindow: '8–10 pm',

  /** Per-piece performance, so "below your average" is a claim you can check. */
  topContent: [
    { id: 'r1', title: 'Your Saturn return is not a punishment', kind: 'Reel', views: 312000, vsAvgPct: 46 },
    { id: 'b1', title: 'When to sign a contract', kind: 'Article', views: 11200, vsAvgPct: 8 },
    { id: 'r3', title: 'Relocation and the 4th house', kind: 'Reel', views: 7800, vsAvgPct: -31 },
  ],
}

/**
 * Things slipping. Kept separate from `insights` because these are the only
 * items on the screen that ask for an action rather than describing the past.
 */
export const warnings = [
  { id: 'w1', tone: 'bad', title: 'Response rate is 68%', line: 'It was 94% last month. Two requests have sat unanswered for six hours.', to: '/pro/consult' },
  { id: 'w2', tone: 'warn', title: '3 slots unfilled tomorrow', line: 'Morning is empty. Opening an evening slot fills faster on a Thursday.', to: '/pro/consult' },
  { id: 'w3', tone: 'warn', title: '“Relocation and the 4th house” is 31% below your average', line: 'Reels you post before 6 pm consistently underperform. Yours went out at 2 pm.', to: '/pro/studio' },
]

/** Referrals. Another consultant you bring pays you a cut of their first month. */
export const referrals = {
  code: 'RITU-NAMO',
  invited: 14,
  joined: 6,
  earned: 18400,
  perJoin: 2000,
  list: [
    { id: 'rf1', name: 'Aarav N.', initials: 'AN', joined: '2 Aug 2026', status: 'Active', earned: 2000 },
    { id: 'rf2', name: 'Simran K.', initials: 'SK', joined: '24 Jul 2026', status: 'Active', earned: 2000 },
    { id: 'rf3', name: 'Meher B.', initials: 'MB', joined: '11 Jul 2026', status: 'Active', earned: 2000 },
    { id: 'rf4', name: 'Tanvi R.', initials: 'TR', joined: '3 Jul 2026', status: 'Pending', earned: 0 },
  ],
}

/** Availability, a week at a time rather than one day of six slots. */
export const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const SESSION = { mins: 20, label: '20 min', promise: 'Unlimited questions' }

/** The lengths a seeker can pick at booking. `SESSION.mins` is the default
    and the rate `c.price` is quoted against — the other two are priced off
    it, not stored separately, so there is nothing to keep in sync. */
export const SESSION_LENGTHS = [15, 20, 30]

/**
 * Today's panchang. The almanac half of the app — the daily reading says what
 * to do with the day, this says what the day is made of.
 */
export const panchang = {
  date: 'Monday, 10 August 2026',
  tithi: 'Shukla Tritiya',
  nakshatra: 'Uttara Phalguni',
  yoga: 'Siddhi',
  karana: 'Taitila',
  paksha: 'Shukla',
  sunrise: '06:14',
  sunset: '19:02',
  moonSign: 'Kanya',
  rahuKaal: '07:52 - 09:29',
  abhijit: '12:19 - 13:10',
  line: 'Siddhi yoga runs until sunset. Start the thing you have been staging, and do not sign it during Rahu kaal.',
}

/* ==========================================================================
   MANDIR - e-puja only. Nothing here books a pandit or takes a payment; the
   ritual happens on the screen.
   ========================================================================== */

/**
 * Each deity carries the murtis you can install in the shrine.
 *
 * These are the only photographs in the app. Every one is a public-domain or
 * openly licensed devotional painting off Wikimedia Commons — Ravi Varma press
 * oleographs, Rodrigues lithographs, Wellcome gouaches, a Basohli miniature —
 * muted and warmed at build time so they sit on the canvas instead of shouting
 * over it.
 *
 * Attribution is three fields — `artist`, `licence`, `source` — not one string,
 * because it is not decoration. Some of these are share-alike, the processing
 * script produces derivatives, and "which images may not go behind a paywall"
 * has to be answerable as a filter rather than by reading prose. `creditLine`
 * below is the only place that knows how to render them as one line.
 *
 * Files live in `public/deities/`. Reprocess with the script in the scratchpad
 * rather than editing a webp by hand.
 */
export const deities = [
  { id: 'd1', name: 'Ganesh', nameHi: 'गणेश', graha: 'Ketu', day: 'Wednesday', aarti: 'Jai Ganesh Deva',
    forWhat: 'Anything that has not started yet.',
    line: 'Removed obstacles are not the same as an easy road. He clears the entrance, not the route.',
    images: [
      { f: 'ganesh-1.webp', label: 'Seated with attendants', artist: 'Raja Ravi Varma', licence: 'Public domain', source: 'Wikimedia Commons' },
      { f: 'ganesh-2.webp', label: 'Basohli miniature, c.1730', artist: 'Anonymous', licence: 'Public domain', source: 'Wikimedia Commons' },
      { f: 'ganesh-3.webp', label: 'Rodrigues lithograph', artist: 'E. A. Rodrigues', licence: 'Public domain', source: 'Wikimedia Commons' },
      { f: 'ganesh-4.webp', label: 'Rajput miniature', artist: 'Unknown artist', licence: 'Public domain', source: 'Wikimedia Commons' },
    ] },
  { id: 'd2', name: 'Shiva', nameHi: 'शिव', graha: 'Chandra', day: 'Monday', aarti: 'Om Jai Shiv Omkara',
    forWhat: 'Grief, illness, and what you cannot fix by trying harder.',
    line: 'Rudrabhishek is the loud version. This is the quiet one, and it counts the same.',
    images: [
      { f: 'shiva-1.webp', label: 'Shankar', artist: 'Ravi Varma Press', licence: 'Public domain', source: 'Wikimedia Commons' },
      { f: 'shiva-2.webp', label: 'With Parvati and Nandi', artist: 'Raja Ravi Varma', licence: 'Public domain', source: 'Wikimedia Commons' },
      { f: 'shiva-3.webp', label: 'Drinking the poison, 1913', artist: 'Nivedita & Coomaraswamy', licence: 'Public domain', source: 'Wikimedia Commons' },
      { f: 'shiva-4.webp', label: 'Ganga Visarjana', artist: 'E. A. Rodrigues', licence: 'Public domain', source: 'Wikimedia Commons' },
    ] },
  { id: 'd3', name: 'Lakshmi', nameHi: 'लक्ष्मी', graha: 'Shukra', day: 'Friday', aarti: 'Om Jai Lakshmi Mata',
    forWhat: 'Money that arrives and does not stay.',
    line: 'She is asked for stability more often than for wealth. The second is easier to grant.',
    images: [
      { f: 'lakshmi-1.webp', label: 'On the lotus', artist: 'Raja Ravi Varma', licence: 'Public domain', source: 'Wikimedia Commons' },
      { f: 'lakshmi-2.webp', label: 'Press oleograph, 1930s', artist: 'Raja Ravi Varma', licence: 'Public domain', source: 'Wikimedia Commons' },
      { f: 'lakshmi-3.webp', label: 'With Saraswati', artist: 'Raja Ravi Varma', licence: 'Public domain', source: 'Wikimedia Commons' },
      { f: 'lakshmi-4.webp', label: 'Painted 1896', artist: 'Raja Ravi Varma', licence: 'Public domain', source: 'Wikimedia Commons' },
    ] },
  { id: 'd4', name: 'Hanuman', nameHi: 'हनुमान', graha: 'Mangal', day: 'Tuesday', aarti: 'Aarti Kije Hanuman Lala Ki',
    forWhat: 'Fear, court matters, and Mangal sitting badly.',
    line: 'Tuesdays and Saturdays. Read the Chalisa if you have forty minutes; light a diya if you have four.',
    images: [
      { f: 'hanuman-1.webp', label: 'With two worshippers', artist: 'Wellcome Collection', licence: 'CC BY 4.0', source: 'Wikimedia Commons' },
      { f: 'hanuman-2.webp', label: 'Gouache study', artist: 'Wellcome Collection', licence: 'CC BY 4.0', source: 'Wikimedia Commons' },
      { f: 'hanuman-3.webp', label: 'Carrying Rama and Lakshman', artist: 'Wellcome Collection', licence: 'CC BY 4.0', source: 'Wikimedia Commons' },
      { f: 'hanuman-4.webp', label: 'With the mountain', artist: 'Wellcome Collection', licence: 'CC BY 4.0', source: 'Wikimedia Commons' },
    ] },
  { id: 'd5', name: 'Durga', nameHi: 'दुर्गा', graha: 'Rahu', day: 'Friday', aarti: 'Jai Ambe Gauri',
    forWhat: 'A fight you did not pick and cannot leave.',
    line: 'Navratri is the season. The rest of the year she is still there and considerably less busy.',
    images: [
      { f: 'durga-1.webp', label: 'With the lions', artist: 'Raja Ravi Varma', licence: 'Public domain', source: 'Wikimedia Commons' },
      { f: 'durga-2.webp', label: 'Mahishasuramardini', artist: 'Raja Ravi Varma', licence: 'Public domain', source: 'Wikimedia Commons' },
      { f: 'durga-3.webp', label: 'Slaying Mahishasura', artist: 'Dswaroop100', licence: 'CC BY-SA 3.0', source: 'Wikimedia Commons' },
      { f: 'durga-4.webp', label: 'On the tiger', artist: 'Sujit Kumar', licence: 'CC BY-SA 4.0', source: 'Wikimedia Commons' },
    ] },
  { id: 'd7', name: 'Mahavir', nameHi: 'महावीर', graha: 'Guru', day: 'Sunday', aarti: 'Mangal Bhagwan Mahavir',
    forWhat: 'Anger you are proud of, and the habit under it.',
    line: 'Ahimsa is not gentleness. It is refusing the easy cruelty when nobody would blame you for it.',
    images: [
      { f: 'mahavir-c.webp', label: 'In the arch', artist: null, licence: 'Supplied', source: null },
      { f: 'mahavir-a.webp', label: 'Carved niche', artist: null, licence: 'Supplied', source: null },
      { f: 'mahavir-b.webp', label: 'Golden halo', artist: null, licence: 'Supplied', source: null },
      { f: 'mahavir-d.webp', label: 'Jain Tirth Temple, Ayodhya', artist: null, licence: 'Supplied', source: null },
    ] },
  { id: 'd8', name: 'Aadinath', nameHi: 'आदिनाथ', graha: 'Surya', day: 'Sunday', aarti: 'Rushabh Jinesar Prithamji',
    forWhat: 'The very first step — starting over when everything before it failed.',
    line: 'He gave up a kingdom to walk first. Every path needs someone willing to take the step nobody has proof of yet.',
    images: [
      { f: 'aadinath-a.webp', label: 'Jain Tirth Temple, Ayodhya', artist: null, licence: 'Supplied', source: null },
    ] },
  { id: 'd6', name: 'Shani', nameHi: 'शनि', graha: 'Shani', day: 'Saturday', aarti: 'Jai Jai Shani Dev',
    forWhat: 'Sade sati, dhaiya, and the long grinding years.',
    line: 'He is not punishing you. He is charging you for what you already did, in instalments.',
    images: [
      { f: 'shani-1.webp', label: 'On the crow chariot', artist: 'Ravi Varma Press', licence: 'Public domain', source: 'Wikimedia Commons' },
      { f: 'shani-2.webp', label: 'With the crow', artist: 'Indian Poet', licence: 'CC BY-SA 3.0', source: 'Wikimedia Commons' },
      { f: 'shani-3.webp', label: 'Rodrigues lithograph', artist: 'E. A. Rodrigues', licence: 'Public domain', source: 'Wikimedia Commons' },
    ] },
]

/**
 * The attribution line under the murti picker. Supplied art has no artist and
 * no source, so the parts are filtered rather than joined blindly — an image
 * credited " · Supplied · " reads as a bug.
 */
export const creditLine = (img) => [img.artist, img.licence, img.source].filter(Boolean).join(' · ')

/** What you can do at the shrine. Each one is an animation, not a purchase. */
export const offerings = [
  // `label` and `says` are i18n keys, not text — the mandir is the one screen
  // where the Hindi matters most, so nothing here is a literal string.
  { id: 'o1', key: 'bell', label: 'puja.bell', says: 'puja.rung' },
  { id: 'o2', key: 'flower', label: 'puja.flowers', says: 'puja.offered' },
  { id: 'o3', key: 'diya', label: 'puja.diya', says: 'puja.diyaLit' },
  { id: 'o4', key: 'incense', label: 'puja.dhoop', says: 'puja.dhoopLit' },
]

/* ==========================================================================
   TAROT - one free pull a week, then priced per card.
   ========================================================================== */

export const TAROT_PRICE = 11

/**
 * Decks by tradition rather than one Western pack. The cards differ; the
 * register does not - a card describes a position, it does not promise one.
 */
export const tarotDecks = [
  {
    id: 'dk5', name: 'Bhaktamar', tradition: 'Jain', traditionHi: 'जैन',
    line: 'Forty-eight cards, one for each shloka of the stotra. The only deck here with a painted face.',
    cards: bhaktamarCards,
  },
  {
    id: 'dk1', name: 'Rider-Waite', tradition: 'Western', traditionHi: 'पाश्चात्य',
    line: 'The pack most people picture. Heavy on the majors.',
    cards: [
      { id: 'w1', name: 'The Tower', line: 'The thing you are bracing for has already happened. You are bracing for the admission.' },
      { id: 'w2', name: 'The Hermit', line: 'Withdrawing is working. It stops working the day it becomes the point.' },
      { id: 'w3', name: 'The Star', line: 'You are being given time, not a guarantee. Use it on the boring part.' },
      { id: 'w4', name: 'Wheel of Fortune', line: 'Timing turns this week. Nothing about your effort changes with it.' },
      { id: 'w5', name: 'The Moon', line: 'You have the facts. What you do not have is a version of them you can live with.' },
      { id: 'w6', name: 'Justice', line: 'The fair outcome and the outcome you want are not the same shape this month.' },
    ],
  },
  {
    id: 'dk2', name: 'Vedic Kipper', tradition: 'Hindu', traditionHi: 'हिन्दू',
    line: 'Read against the chart rather than alone. Each card names a house.',
    cards: [
      { id: 'v1', name: 'Dashami, the Tenth', line: 'Career asks first this month. The house you keep postponing is the one moving.' },
      { id: 'v2', name: 'Chandra, the Moon', line: 'Your mood is weather, not evidence. Wait four days before deciding it is a pattern.' },
      { id: 'v3', name: 'Ketu, the Tail', line: 'Something is ending without drama. Let it end without drama.' },
      { id: 'v4', name: 'Guru, the Teacher', line: 'Advice is arriving. The useful kind will not be the flattering kind.' },
      { id: 'v5', name: 'Shukra, the Bright', line: 'Ease is available. You are allowed to take it without earning it first.' },
      { id: 'v6', name: 'Shani, the Slow', line: 'On schedule, not late. You are measuring against a calendar nobody agreed to.' },
    ],
  },
  {
    id: 'dk3', name: 'Sufi Path', tradition: 'Islamic', traditionHi: 'इस्लामी',
    line: 'Stations rather than events. What the card names is a state you are in.',
    cards: [
      { id: 's1', name: 'Sabr, Patience', line: 'Waiting is the work here. Not the waiting where you refresh the page.' },
      { id: 's2', name: 'Tawakkul, Trust', line: 'You have done the part that was yours. The rest was never yours.' },
      { id: 's3', name: 'Fana, Dissolving', line: 'The version of you that wanted this is not the one who will have it.' },
      { id: 's4', name: 'Shukr, Gratitude', line: 'Count it before it changes. It will change.' },
      { id: 's5', name: 'Qabd, Contraction', line: 'The closing-in is a season, not a verdict. Do less and do it properly.' },
      { id: 's6', name: 'Bast, Expansion', line: 'Room has opened. Fill it deliberately or it will fill itself.' },
    ],
  },
  {
    id: 'dk4', name: 'Lotus Path', tradition: 'Buddhist', traditionHi: 'बौद्ध',
    line: 'Attachment, aversion and the middle. Blunter than it sounds.',
    cards: [
      { id: 'b1', name: 'Anicca, Impermanence', line: 'It is already leaving. Holding tighter changes the grip, not the going.' },
      { id: 'b2', name: 'Dukkha, Friction', line: 'The discomfort is information. It is telling you where you are gripping.' },
      { id: 'b3', name: 'Metta, Kindness', line: 'Start with the person you are hardest on. It is not who you think.' },
      { id: 'b4', name: 'Upekkha, Equanimity', line: 'Caring less is not the goal. Caring without flinching is.' },
      { id: 'b5', name: 'Sunyata, Emptiness', line: 'The thing you fear losing was never a fixed object. Neither are you.' },
      { id: 'b6', name: 'Sila, Conduct', line: 'You know the right action. The question was only ever whether you would take it.' },
    ],
  },
]

export const timeSlots = ['09:30', '11:00', '13:30', '16:00', '18:30', '20:00']

/* ══════════════════════════════════════════════════════════════════════════
   ASK
   ══════════════════════════════════════════════════════════════════════════ */

export const askSuggestions = [
  { id: 's1', label: 'Career', text: 'Is this a good month to change jobs?' },
  { id: 's2', label: 'Love', text: 'What does my chart say about my relationship?' },
  { id: 's3', label: 'Health', text: 'Which remedies suit my constitution?' },
  { id: 's4', label: 'Money', text: 'When is a good window to invest?' },
]

export const askConversation = [
  {
    id: 'm1',
    role: 'ai',
    text: 'Your Moon is in Pisces and Mercury is easing off. A soft, thinking sort of day. Ask.',
    time: '09:02',
  },
  { id: 'm2', role: 'user', text: 'I have been offered a role in Bangalore. Should I take it?', time: '09:04' },
  {
    id: 'm3',
    role: 'ai',
    text: 'Your 10th house lord is strong through September, which favours a move that raises your visibility rather than your pay. The caution is the 4th house. Relocation will cost you more emotionally than you are budgeting for. If the offer can wait two weeks, ask for two weeks.',
    time: '09:04',
  },
  { id: 'm4', role: 'user', text: 'What should I ask them before I decide?', time: '09:06' },
  {
    id: 'm5',
    role: 'ai',
    text: 'Three things. Who you report to after six months. What the team looked like a year ago. Whether relocation support covers a return. The chart favours clarity over speed.',
    time: '09:06',
  },
]

export const questionPacks = [
  { id: 'p6', questions: 6, price: 199, tag: null },
  { id: 'p12', questions: 12, price: 349, tag: 'Most taken' },
  { id: 'p20', questions: 20, price: 499, tag: 'Best value' },
]

/* ══════════════════════════════════════════════════════════════════════════
   PREMIUM
   ══════════════════════════════════════════════════════════════════════════ */

export const premiumTiers = [
  {
    id: 'ask',
    name: 'Ask the Stars',
    price: 349,
    unit: 'for 12 questions',
    line: 'Put a real question to your chart. Get an answer that does not flatter you.',
    includes: ['12 chart-aware questions', 'Answers cite the placement', 'Kept in one thread'],
  },
  {
    id: 'love',
    name: 'The Relationship Report',
    price: 899,
    unit: 'one-off',
    line: 'Forty pages on how you attach, what you withhold, and the pattern you keep re-entering.',
    includes: ['Venus & Mars audit', '7th house reading', 'The habit you deny'],
  },
  {
    id: 'eros',
    name: 'Eros — for two',
    price: 1299,
    unit: 'one-off',
    line: 'A synastry reading written for both of you to read at the same time. It will start an argument. That is the product.',
    includes: ['Full synastry grid', 'Composite chart', 'Two named friction points'],
  },
]

/* ══════════════════════════════════════════════════════════════════════════
   SHOP
   ══════════════════════════════════════════════════════════════════════════ */

/** What sits inside each shop category, revealed once one is chosen. */
export const shopSubcategories = {
  Gemstones: ['Blue Sapphire', 'Yellow Sapphire', 'Emerald', 'Ruby', 'Pearl'],
  Maalas: ['Sphatik', 'Tulsi', 'Sandalwood', 'Lotus seed'],
  Rudraksha: ['1 Mukhi', '5 Mukhi', '7 Mukhi', 'Gauri Shankar'],
  Remedies: ['Yantras', 'Ritual kits', 'Oils', 'Camphor & loban'],
}

export const shopCategories = ['Gemstones', 'Maalas', 'Rudraksha', 'Remedies']

export const products = [
  { id: 'sh1', name: 'Natural Blue Sapphire', subtitle: '3.2 ct · Certified Neelam', price: 18500, mrp: 24000, category: 'Gemstones', recommendedBy: 'Ritu Kashyap' },
  { id: 'sh2', name: 'Yellow Sapphire Ring', subtitle: '5.1 ct · Panchdhatu setting', price: 26400, mrp: null, category: 'Gemstones', recommendedBy: null },
  { id: 'sh3', name: 'Rudraksha 5 Mukhi Mala', subtitle: '108 beads · Nepali origin', price: 2400, mrp: 3200, category: 'Rudraksha', recommendedBy: 'Yogesh Pandit' },
  { id: 'sh4', name: 'Sphatik Crystal Maala', subtitle: '108 beads · Hand-knotted', price: 1650, mrp: null, category: 'Maalas', recommendedBy: null },
  { id: 'sh5', name: 'Tulsi Maala', subtitle: '108 beads · Vrindavan wood', price: 890, mrp: 1200, category: 'Maalas', recommendedBy: 'Dev Malhotra' },
  { id: 'sh6', name: '1 Mukhi Rudraksha', subtitle: 'Lab certified · Java', price: 7200, mrp: null, category: 'Rudraksha', recommendedBy: null, soldOut: true },
  { id: 'sh7', name: 'Shani Shanti Kit', subtitle: 'Oil, cloth & mantra card', price: 1150, mrp: 1500, category: 'Remedies', recommendedBy: 'Ritu Kashyap' },
  { id: 'sh8', name: 'Copper Yantra — Shree', subtitle: '3×3 in · Energised', price: 2100, mrp: null, category: 'Remedies', recommendedBy: null },
  { id: 'sh9', name: 'Emerald (Panna)', subtitle: '2.8 ct · Zambian', price: 15900, mrp: 19500, category: 'Gemstones', recommendedBy: 'Meher Bano', soldOut: true },
  { id: 'sh10', name: 'Camphor & Loban Set', subtitle: 'Weekly cleansing ritual', price: 640, mrp: null, category: 'Remedies', recommendedBy: null },
]

/* ══════════════════════════════════════════════════════════════════════════
   ME
   ══════════════════════════════════════════════════════════════════════════ */

export const sessionHistory = [
  { id: 'h1', consultant: 'Ritu Kashyap', initials: 'RK', type: 'Video · 30 min', date: '28 Jul 2026', amount: 1499, status: 'Completed' },
  { id: 'h2', consultant: 'Meher Bano', initials: 'MB', type: 'Chat · 15 min', date: '19 Jul 2026', amount: 899, status: 'Completed' },
  { id: 'h3', consultant: 'Dr. Nandita Rao', initials: 'NR', type: 'Video · 30 min', date: '11 Jul 2026', amount: 2200, status: 'Completed' },
  { id: 'h4', consultant: 'Simran Kaur', initials: 'SK', type: 'Video · 15 min', date: '2 Jul 2026', amount: 0, status: 'Cancelled' },
]

/** Shown while the chart "computes" after onboarding. NASA as credibility. */
export const loadingLines = [
  'Fetching NASA ephemeris data',
  'Resolving your birth coordinates',
  'Placing eight bodies',
  'Reading the houses',
]

/* ══════════════════════════════════════════════════════════════════════════
   WALLET — top-up presets only. The balance and the ledger are real from
   phase 2: they are server rows, read under RLS. The seeded transaction list
   that used to live here is gone — it was denominated in rupees where real
   entries are paise, its w1–w6 ids collided with `warnings` (see
   docs/05-BACKEND-SCHEMA.md §1.4), and nothing reads it any more.

   `topUpAmounts` stays because the consultant withdraw sheet still uses it,
   and phase 3 restores it on the seeker side.
   ══════════════════════════════════════════════════════════════════════════ */

export const topUpAmounts = [500, 1000, 2000, 5000]

/* ══════════════════════════════════════════════════════════════════════════
   ACADEMY — courses, live events and saved downloads.
   ══════════════════════════════════════════════════════════════════════════ */

export const courses = [
  {
    id: 'c1',
    title: 'Reading a birth chart from scratch',
    tutor: 'Ritu Kashyap',
    initials: 'RK',
    lessons: 12,
    duration: '4h 20m',
    level: 'Beginner',
    price: 2499,
    progress: 35,
    url: 'https://www.youtube.com/results?search_query=birth+chart+basics',
  },
  {
    id: 'c2',
    title: 'Dashas and timing: when, not whether',
    tutor: 'Dev Malhotra',
    initials: 'DM',
    lessons: 9,
    duration: '3h 05m',
    level: 'Intermediate',
    price: 3499,
    progress: 0,
    url: 'https://www.youtube.com/results?search_query=vimshottari+dasha',
  },
  {
    id: 'c3',
    title: 'Tarot as a thinking tool',
    tutor: 'Meher Bano',
    initials: 'MB',
    lessons: 8,
    duration: '2h 40m',
    level: 'Beginner',
    price: 1999,
    progress: 72,
    url: 'https://www.youtube.com/results?search_query=tarot+for+beginners',
  },
  {
    id: 'c4',
    title: 'Synastry: charts against each other',
    tutor: 'Simran Kaur',
    initials: 'SK',
    lessons: 10,
    duration: '3h 30m',
    level: 'Advanced',
    price: 4299,
    progress: 0,
    url: 'https://www.youtube.com/results?search_query=synastry+astrology',
  },
]

export const academyEvents = [
  {
    id: 'e1',
    title: 'Saturn return, live clinic',
    host: 'Ritu Kashyap',
    initials: 'RK',
    date: 'Thu, 7 Aug',
    time: '19:00',
    seats: 40,
    taken: 31,
    price: 0,
    kind: 'Webinar',
  },
  {
    id: 'e2',
    title: 'Chart-reading intensive, weekend one',
    host: 'Dev Malhotra',
    initials: 'DM',
    date: 'Sat, 9 Aug',
    time: '11:00',
    seats: 25,
    taken: 25,
    price: 1499,
    kind: 'Seminar',
  },
  {
    id: 'e3',
    title: 'Grief and the 8th house',
    host: 'Dr. Nandita Rao',
    initials: 'NR',
    date: 'Tue, 12 Aug',
    time: '18:30',
    seats: 60,
    taken: 12,
    price: 499,
    kind: 'Webinar',
  },
]

export const downloads = [
  { id: 'd1', title: 'Birth chart basics — lesson 1', kind: 'Video', size: '182 MB', saved: '2 days ago', course: 'Reading a birth chart' },
  { id: 'd2', title: 'Dasha reference tables', kind: 'PDF', size: '1.4 MB', saved: '5 days ago', course: 'Dashas and timing' },
  { id: 'd3', title: 'Tarot spreads worksheet', kind: 'PDF', size: '820 KB', saved: '1 week ago', course: 'Tarot as a thinking tool' },
  { id: 'd4', title: 'Saturn return clinic — recording', kind: 'Video', size: '410 MB', saved: '2 weeks ago', course: 'Live event' },
]

/* ══════════════════════════════════════════════════════════════════════════
   CHAT — consultant threads for the side panel. The AI tab reuses
   askConversation; these are the human ones.
   ══════════════════════════════════════════════════════════════════════════ */

export const chatThreads = [
  {
    id: 'ct1',
    consultantId: 'a1',
    name: 'Ritu Kashyap',
    initials: 'RK',
    // The other end of the thread. Without it the consultant opens Messages
    // and reads a conversation labelled with her own name, and her own replies
    // rendered as the other party.
    seeker: 'Ananya Deshpande',
    seekerInitials: 'AD',
    online: true,
    unread: 2,
    last: 'Send me the exact minute and I will look again.',
    time: '2m',
    messages: [
      { id: 'm1', from: 'them', text: 'You booked the 30 minute slot. Bring the offer letter.', time: '09:02' },
      { id: 'm2', from: 'me', text: 'It says the role reports to a new manager after six months.', time: '09:04' },
      { id: 'm3', from: 'them', text: 'That is the part to negotiate, not the salary. Your 10th house is strong until September.', time: '09:05' },
      { id: 'm4', from: 'them', text: 'Send me the exact minute and I will look again.', time: '09:06' },
    ],
  },
  {
    id: 'ct2',
    consultantId: 'a3',
    name: 'Meher Bano',
    initials: 'MB',
    seeker: 'Rohit Salvi',
    seekerInitials: 'RS',
    online: true,
    unread: 0,
    last: 'Pull one card before you reply. Not three.',
    time: '1h',
    messages: [
      { id: 'm1', from: 'me', text: 'I keep redrafting the same message.', time: '08:10' },
      { id: 'm2', from: 'them', text: 'Pull one card before you reply. Not three.', time: '08:12' },
    ],
  },
  {
    id: 'ct3',
    consultantId: 'a4',
    name: 'Dr. Nandita Rao',
    initials: 'NR',
    seeker: 'Kavya Iyer',
    seekerInitials: 'KI',
    online: false,
    unread: 0,
    last: 'Next session Tuesday. Bring the sleep log.',
    time: '2d',
    messages: [{ id: 'm1', from: 'them', text: 'Next session Tuesday. Bring the sleep log.', time: 'Mon' }],
  },
]

/** Canned consultant replies so the mock thread keeps moving without a backend. */
export const consultantReplies = [
  'Give me a minute with the chart.',
  'That reads like a 7th house question, not a 10th house one.',
  'Do not decide before Thursday. The window opens then.',
  'Say the plain version to them. You have been editing it for a week.',
]

/* ══════════════════════════════════════════════════════════════════════════
   HOME FEED — one stream, mixed formats. `kind` decides how a card renders;
   `refId` cross-references clips / reads / posts / consultants so every card
   resolves to something real rather than carrying a duplicate copy.
   ══════════════════════════════════════════════════════════════════════════ */

export const feed = [
  { id: 'f1', kind: 'post', refId: 'po1' },
  { id: 'f2', kind: 'reel', refId: 'r1' },
  { id: 'f3', kind: 'reading', refId: 'today' },
  { id: 'f4', kind: 'article', refId: 'b1' },
  { id: 'f5', kind: 'post', refId: 'po2' },
  { id: 'f6', kind: 'live', refId: 'l1' },
  { id: 'f7', kind: 'reel', refId: 'r4' },
  { id: 'f8', kind: 'course', refId: 'c1' },
  { id: 'f9', kind: 'article', refId: 'b2' },
  { id: 'f10', kind: 'post', refId: 'po3' },
  { id: 'f11', kind: 'reel', refId: 'r2' },
  { id: 'f12', kind: 'product', refId: 'sh1' },
  { id: 'f13', kind: 'post', refId: 'po4' },
  { id: 'f14', kind: 'article', refId: 'b3' },
]

/* ══════════════════════════════════════════════════════════════════════════
   REPORTS — the paid long-form artefacts, sold from Profile and Consult.

   PRICING NOTE: the brief asked for "3x the displayed price in the
   screenshot", but no screenshot was supplied. `base` below is the ordinary
   catalogue price for each report; `price` is the 3x figure the UI shows, and
   it is DERIVED rather than typed so the multiplier stays visible and is
   trivial to change in one place if the reference numbers turn up.
   ══════════════════════════════════════════════════════════════════════════ */

export const REPORT_MULTIPLIER = 3

const reportCatalogue = [
  {
    id: 'rp1',
    name: 'Full Birth Chart Report',
    tag: 'Natal',
    base: 499,
    pages: 42,
    delivery: '24 hours',
    line: 'Every placement, house and aspect written out in plain language. The whole chart, once, properly.',
    includes: ['All 12 houses read', 'Eight placements in detail', 'Aspect grid with notes'],
    popular: true,
  },
  {
    id: 'rp2',
    name: 'Career & Timing Report',
    tag: 'Career',
    base: 699,
    pages: 28,
    delivery: '48 hours',
    line: 'The 10th house, your dasha sequence, and the windows worth moving in over the next three years.',
    includes: ['10th house audit', 'Dasha timeline to 2029', 'Three named windows'],
    popular: false,
  },
  {
    id: 'rp3',
    name: 'The Relationship Report',
    tag: 'Love',
    base: 899,
    pages: 40,
    delivery: '48 hours',
    line: 'How you attach, what you withhold, and the pattern you keep re-entering.',
    includes: ['Venus & Mars audit', '7th house reading', 'The habit you deny'],
    popular: true,
  },
  {
    id: 'rp4',
    name: 'Eros — Synastry for Two',
    tag: 'Synastry',
    base: 1299,
    pages: 56,
    delivery: '72 hours',
    line: 'One reading written for both of you to read at the same time. It will start an argument. That is the product.',
    includes: ['Full synastry grid', 'Composite chart', 'Two named friction points'],
    popular: false,
  },
  {
    id: 'rp5',
    name: 'Year Ahead Forecast',
    tag: 'Transits',
    base: 599,
    pages: 34,
    delivery: '24 hours',
    line: 'Twelve months of transits, ranked by weight, with the three that actually matter marked.',
    includes: ['Month-by-month transits', 'Three ranked events', 'What to front-load'],
    popular: false,
  },
  {
    id: 'rp6',
    name: 'Remedies & Gemstone Report',
    tag: 'Remedial',
    base: 449,
    pages: 18,
    delivery: '24 hours',
    line: 'What is conventionally prescribed for your placements, and an honest note on what it can and cannot do.',
    includes: ['Stone suitability', 'Ritual calendar', 'What not to bother with'],
    popular: false,
  },
]

export const reports = reportCatalogue.map((r) => ({
  ...r,
  price: r.base * REPORT_MULTIPLIER,
}))
