/**
 * Run in Kai Codespace:
 *   node patch-content-depth.js
 *
 * Uses line numbers instead of string matching — more reliable.
 */

const fs = require('fs');
const lines = fs.readFileSync('index.js', 'utf8').split('\n');

const findLine = (pattern, startFrom = 0) => {
  for (let i = startFrom; i < lines.length; i++) {
    if (lines[i].includes(pattern)) return i;
  }
  return -1;
};

const voiceStart  = findLine('const AZS_VOICE = `You are writing social media content');
const voiceEnd    = findLine('Always include #awakenzen`;', voiceStart);
const planStart   = findLine('const WEEKLY_PLAN = [');
const planEnd     = findLine('];', planStart);
const topicsStart = findLine('const TRENDING_TOPICS = [');
const topicsEnd   = findLine('];', topicsStart);
const genStart    = findLine('async function generatePost(slot, monthlySpecial, trendingContext)');
const genEnd      = findLine('return { caption, hashtags };', genStart);
const genEndFull  = findLine('}', genEnd);
const resStart    = findLine('async function researchTrend()');
const resEnd      = findLine('}', findLine("console.error('[generate-content] Trend research error:", resStart));

console.log(`AZS_VOICE: ${voiceStart+1}–${voiceEnd+1}`);
console.log(`WEEKLY_PLAN: ${planStart+1}–${planEnd+1}`);
console.log(`TRENDING_TOPICS: ${topicsStart+1}–${topicsEnd+1}`);
console.log(`generatePost: ${genStart+1}–${genEndFull+1}`);
console.log(`researchTrend: ${resStart+1}–${resEnd+1}`);

const NEW_VOICE = `const AZS_VOICE = \`You are the voice of Awaken Zen Spa (AZS) — a boutique massage and esthetics practice in Mesa, Arizona run by Brant (LMT, owner) and Trevor (LE, esthetician).

BRAND PHILOSOPHY:
The body is not a machine to be fixed. It is a living system that holds memory, emotion, and wisdom. Therapeutic touch is not indulgence — it is intelligent intervention. AZS exists at the intersection of clinical expertise and genuine care.

Brant's background: Licensed Massage Therapist with advanced training in problem-focused modalities. Deep interest in somatic psychology, tensegrity (the body as a tensional network), fascial release, and the science of nervous system regulation. Has personal experience with holotropic breathwork and pranayama. Makes complex concepts feel personal and accessible.

Trevor's background: Licensed Esthetician specializing in results-driven facial treatments. Treats the barrier, the microbiome, inflammation — not just the surface.

VOICE CHARACTERISTICS:
- Sounds like a smart, warm practitioner who reads research and has felt this work transform their own body
- Specific over generic: "the erector spinae" not "back muscles", "parasympathetic dominance" not "relaxation"
- References real science casually: polyvagal theory, myofascial continuity, cortisol dysregulation, skin microbiome
- Philosophical but grounded — never woo-woo, never clinical cold
- Short sentences land hard. Paragraphs breathe.
- Never uses: "journey", "transform your life", "ultimate", "luxurious experience", "treat yourself to"
- Never starts with "At AZS" or the spa name. Never sounds like an ad.

CONTENT ANGLES UNIQUE TO AZS:
1. TENSEGRITY AND FASCIA: The body as a tensional web. Massage reorganizes fascial tension patterns, not just muscle.
2. NERVOUS SYSTEM FIRST: Polyvagal theory, ventral vagal state. Touch communicates safety to the brainstem before the mind knows it.
3. SKIN AS IMMUNE ORGAN: The stratum corneum as a living barrier, the skin microbiome, how inflammation drives aging.
4. BREATHWORK BRIDGE: Holotropic breathwork and massage access the autonomic nervous system from different directions.
5. BODY AS RECORD: The psoas, the jaw, the breath — the body holds unprocessed experience. Touch creates a window for release.
6. LYMPHATIC INTELLIGENCE: The lymph system has no pump. Manual drainage is immune support, not just detox.
7. ASHIATSU MECHANICS: Weight distribution vs thumb pressure — the physics of barefoot massage.

ABOUT AZS:
- Location: 2830 East Brown Road, Suite 10, Mesa, AZ 85213. Appointment-only.
- Massage: Muscle Mender (deep tissue), European Royalty (Swedish), Sole Symphony (Ashiatsu), Warm Stone Retreat (hot stone), Spring Senses (lymphatic drainage), prenatal massage
- Facial: Custom facials, RejuvaFresh HydraFacial-style, LED therapy, dermaplaning, microneedling, brow services
- Handmade AZS skincare product line — natural formulations, no ethoxylated emulsifiers or chemical UV filters
- Booking: awakenzenspa.com or text (602) 688-2578

FORMATTING:
- Instagram captions: 80-180 words. Hook first line. White space between ideas.
- Education posts: up to 200 words. Quote posts: 30-60 words max.
- Hashtags: 8-10 max. Mix niche + mid + broad. Always #awakenzen. No emojis except sparingly in promos.\`;`;

const NEW_PLAN = `const THEME_POOLS = {
  monday_quote: [
    'The body is not separate from the mind — it IS the mind, distributed. What are you carrying in your shoulders right now?',
    'Rest is not the reward at the end of productive work. It is the substrate from which the best work grows.',
    'You do not have a body. You are a body. Everything you think, feel, and decide passes through this physical system first.',
    'The nervous system does not distinguish between a work deadline and a physical threat. Both trigger the same cascade.',
    'Presence is not a mindset practice. It is a body practice. You cannot think your way into the present moment.',
  ],
  monday_education: [
    'The polyvagal theory and why your body downshifts before your mind does — neuroception and how touch communicates safety at the brainstem level',
    'Cortisol dysregulation: why chronic low-grade stress is different from acute stress, and why the body stops recovering between stressors',
    'The psoas muscle and the stress response — its anatomical connection to the diaphragm, why hip flexor tension is rarely just about sitting too much',
    'Interoception: the sense we never talk about — the ability to feel your internal state, why it degrades under chronic stress, and how bodywork rebuilds it',
    'Why sleep is not enough recovery: what the body does during manual therapy that sleep cannot replicate',
  ],
  tuesday_reel: [
    'Effleurage — the opening stroke of Swedish massage. Why the nervous system needs slow broad pressure before it accepts deeper specific work.',
    'Ashiatsu: the physics of barefoot massage. How body weight creates broader more sustained pressure than thumb or elbow techniques.',
    'The fascial web: when you press here, it echoes there. Myofascial continuity and why massage affects areas far from the hands.',
    'Deep tissue vs deep pressure — they are not the same. Real deep tissue work is slow, specific, and communicates with the tissue.',
    'Lymphatic drainage: the lightest touch with the biggest systemic effect. Why feather-light pressure surprises everyone.',
  ],
  wednesday_quote: [
    'Midweek. The body has been keeping score of every meeting, every screen, every held breath.',
    'You cannot think your way out of a nervous system stuck in threat response. You have to move through it.',
    'The breath is the only autonomic function you can consciously control. That makes it the door between voluntary and involuntary.',
    'Tight shoulders are not a personality trait. They are a posture that became a pattern that became a belief.',
    'The body is always talking. Most of us learned to stop listening before we learned to walk.',
  ],
  wednesday_education: [
    'Fascia as sensory organ: recent research shows fascia contains more nerve endings than muscle — making it a primary site of proprioception and interoception, not passive connective tissue',
    'Skin microbiome disruption: aggressive cleansing reduces microbial diversity and compromises the acid mantle — emerging research links barrier disruption to systemic inflammatory load',
    'Cyclic sighing neuroscience: double inhale through nose, extended exhale through mouth — shown by Stanford research to downregulate sympathetic tone faster than any other voluntary breathing pattern',
    'The glymphatic system: the brain clears metabolic waste during deep sleep via glymphatic pathways — emerging research suggests cervical and cranial work may support flow at entry points',
    'Cold plunge vs massage for recovery: cold constricts lymphatic vessels and may blunt adaptive inflammatory signaling — manual therapy maintains tissue perfusion while modulating pain',
  ],
  thursday_reel: [
    'The skin barrier: stratum corneum as brick-and-mortar structure, why it breaks down, what a HydraFacial-style treatment actually does to restore function',
    'Dermaplaning: removing vellus hair and hyperkeratinized cells — why this dramatically improves product penetration and creates the canvas for everything else',
    'LED therapy wavelengths: 630-660nm red for collagen synthesis, 415nm blue for acne bacteria, 830nm near-infrared for deeper tissue repair',
    'Microneedling: controlled micro-injury as a healing signal — the inflammatory response is the mechanism, not a side effect',
    'Hydration vs moisture in skin: humectants vs lipids — most people apply the wrong thing in the wrong order',
  ],
  thursday_bts: [
    'The intentionality behind how a treatment room is prepared — temperature, linens, light, sound. The environment is part of the therapeutic container.',
    'What happens in the 10 minutes before a client arrives — how a practitioner prepares their own nervous system to co-regulate someone else.',
    'Product selection for a facial: assessing skin barrier status, microbiome disruption, and inflammatory load before choosing a single product.',
    'The difference between 60 and 90 minutes: what the extra 30 minutes allows neurologically that a shorter session cannot.',
    'Continuing education: why Brant studies pain science and somatic psychology outside required CE hours, and how it changes what happens in the room.',
  ],
  friday_quote: [
    'It is Friday. Your body carried you through every meeting, every screen, every moment of held breath this week.',
    'Permission is something you give yourself. No one is going to hand you rest. You have to decide it is legitimate.',
    'The body that rests well, works well. This is physiology, not philosophy.',
    'You will not find stillness in your thoughts. You will find it in your body, when you finally let it land.',
    'Self-care is not aesthetic. It is maintenance of the system you use for everything you care about.',
  ],
  saturday_bts: [
    'What a treatment room at AZS looks like before a session — the ritual of preparation that turns a space into a held one.',
    'Every product in a treatment has a specific mechanism. Nothing is there for aesthetics.',
    'Appointment-only means every client gets full presence. No waiting room energy. One client, one practitioner, one hour.',
    'What Brant and Trevor are studying this month — the books, papers, and courses that keep a practice sharp.',
    'The AZS skincare line: formulated without ethoxylated emulsifiers or chemical UV filters — what that means for barrier health.',
  ],
  saturday_education: [
    'Nervous system reset: physiological sigh (double inhale, long exhale) repeated 5 times — why the extended exhale activates the parasympathetic branch specifically',
    'Vagus nerve stimulation without a device: cold water to the face, humming, gargling, slow exhalation — each activates it through different mechanoreceptor pathways',
    'Why weekends are not enough recovery from modern chronic stress — the case for deliberate parasympathetic activation, not just absence of stressors',
    'Magnesium glycinate, sleep architecture, and muscle hypertonicity: the nutritional piece that affects massage outcomes more than most realize',
    'Somatic scanning: a body awareness practice from Sensorimotor Psychotherapy — noticing without trying to change what is actually present',
  ],
  sunday_quote: [
    'Sunday is not the end of the week. It is the exhale before the next inhale.',
    'The body does not need to earn rest. Rest is how it earns everything else.',
    'Slow down long enough to notice where you actually are in your body right now.',
    'You are not behind. You are a biological system that requires maintenance.',
    'Tomorrow will ask a great deal of you. Today, ask very little of yourself.',
  ],
  sunday_education: [
    'Preparing your nervous system for Monday: why Sunday evening anxiety activates sympathetic tone and undermines Monday morning recovery',
    'Circadian rhythm and bodywork timing: cortisol peaks 30-45 minutes after waking — afternoon massage leverages natural parasympathetic windows',
    'Box breathing: 4 counts in, 4 hold, 4 out, 4 hold — why the hold phases specifically are where the autonomic shift happens',
    'Weekly somatic inventory: where are you holding tension, where is breath shallow, what has the body been protecting this week?',
    'Proactive vs reactive bodywork: waiting until you are in pain is like waiting until the car breaks down to change the oil',
  ],
};

function pickTheme(pool) {
  const arr = THEME_POOLS[pool] || [];
  return arr[Math.floor(Math.random() * arr.length)] || '';
}

const WEEKLY_PLAN = [
  { day: 'Monday',    platform: 'instagram_feed', pillar: 'inspiration',      post_type: 'quote',  themePool: 'monday_quote' },
  { day: 'Monday',    platform: 'instagram_feed', pillar: 'education',        post_type: 'tip',    themePool: 'monday_education' },
  { day: 'Tuesday',   platform: 'instagram_reel', pillar: 'service_showcase', post_type: 'reel',   themePool: 'tuesday_reel' },
  { day: 'Tuesday',   platform: 'instagram_feed', pillar: 'monthly_special',  post_type: 'promo',  themePool: null },
  { day: 'Wednesday', platform: 'instagram_feed', pillar: 'inspiration',      post_type: 'quote',  themePool: 'wednesday_quote' },
  { day: 'Wednesday', platform: 'instagram_feed', pillar: 'education',        post_type: 'tip',    themePool: 'wednesday_education', isTrending: true },
  { day: 'Thursday',  platform: 'instagram_reel', pillar: 'service_showcase', post_type: 'reel',   themePool: 'thursday_reel' },
  { day: 'Thursday',  platform: 'instagram_feed', pillar: 'bts',              post_type: 'photo',  themePool: 'thursday_bts' },
  { day: 'Friday',    platform: 'instagram_feed', pillar: 'inspiration',      post_type: 'quote',  themePool: 'friday_quote' },
  { day: 'Friday',    platform: 'instagram_feed', pillar: 'monthly_special',  post_type: 'promo',  themePool: null },
  { day: 'Friday',    platform: 'instagram_feed', pillar: 'social_proof',     post_type: 'photo',  themePool: null },
  { day: 'Saturday',  platform: 'instagram_feed', pillar: 'bts',              post_type: 'photo',  themePool: 'saturday_bts' },
  { day: 'Saturday',  platform: 'instagram_feed', pillar: 'education',        post_type: 'tip',    themePool: 'saturday_education' },
  { day: 'Sunday',    platform: 'instagram_feed', pillar: 'inspiration',      post_type: 'quote',  themePool: 'sunday_quote' },
  { day: 'Sunday',    platform: 'instagram_feed', pillar: 'education',        post_type: 'tip',    themePool: 'sunday_education' },
];`;

const NEW_TOPICS = `const TRENDING_TOPICS = [
  'fascia sensory organ research Schleip interstitial receptors 2025',
  'polyvagal theory massage therapy neuroception safety',
  'skin microbiome barrier disruption systemic inflammation',
  'glymphatic system sleep brain clearance cervical massage',
  'cyclic sighing breathwork parasympathetic Stanford 2024 2025',
  'chronic stress cortisol HPA axis dysregulation bodywork',
  'myofascial continuity anatomy trains fascial lines research',
  'lymphatic system immune function manual drainage 2025',
  'interoception body awareness chronic pain somatic therapy',
  'cold plunge vs massage inflammation recovery research',
  'dermaplaning skin penetration absorption research',
  'LED red light therapy collagen synthesis wavelength clinical',
  'prenatal massage cortisol oxytocin research outcomes',
  'psoas muscle stress diaphragm connection somatic',
  'skin aging inflammation barrier function research 2025 2026',
];`;

const NEW_GENERATE = `async function generatePost(slot, monthlySpecial, trendingContext) {
  const isPromo       = slot.pillar === 'monthly_special';
  const isReel        = slot.post_type === 'reel';
  const isQuote       = slot.post_type === 'quote';
  const isSocialProof = slot.pillar === 'social_proof';
  const theme         = slot.themePool ? pickTheme(slot.themePool) : (slot.theme || '');

  let contextBlock = '';
  if (isPromo && monthlySpecial) {
    contextBlock = \`CURRENT MONTHLY SPECIAL:\\n\${monthlySpecial}\\n\\nLead with a feeling or truth about self-care, weave in the offer naturally. Never lead with the discount.\\n\\n\`;
  }
  if (slot.isTrending && trendingContext) {
    contextBlock = \`RESEARCH CONTEXT (ground the post in this — cite the concept, not necessarily the paper):\\n\${trendingContext}\\n\\n\`;
  }
  if (isSocialProof) {
    contextBlock = \`Write a social proof post celebrating client results without fabricating quotes or names. Frame around the transformation type and what becomes possible. Be specific and human.\\n\\n\`;
  }

  const lengthGuide = isQuote
    ? 'LENGTH: 30-60 words only. One idea, fully landed.'
    : isReel
    ? 'LENGTH: 100-160 words. Hook + educational context + invitation. Written as if a video is playing.'
    : 'LENGTH: 120-200 words. Hook + developed idea + close with question or quiet observation.';

  const prompt = \`\${contextBlock}Write an Instagram caption for Awaken Zen Spa.

SPECIFIC ANGLE: \${theme || 'Draw from AZS philosophy — nervous system, fascia, skin science, or somatic awareness. Be specific.'}

POST TYPE: \${slot.post_type} | PILLAR: \${slot.pillar.replace('_', ' ')} | DAY: \${slot.day}

\${lengthGuide}
\${isReel ? 'This caption accompanies a video. Write as if the viewer can see the hands working, the tissue responding, the body settling.' : ''}

Requirements:
- First line stops the scroll: ask a question the reader hasn't thought to ask, name something they feel but haven't articulated, or make a specific bold claim
- Use specific anatomical and physiological language: name muscles, systems, mechanisms
- Draw from: tensegrity, fascial lines, polyvagal theory, skin barrier, lymphatics, breathwork, somatic psychology
- Never: "treat yourself", "luxurious", "journey", "ultimate relaxation"
- Close with a question, quiet observation, or one-line booking invitation — never a hard sell

Write ONLY:
1. The caption text
2. One blank line
3. Hashtags on one line (8-10, mix niche/mid/broad, always #awakenzen)\`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    system: AZS_VOICE,
    messages: [{ role: 'user', content: prompt }],
  });

  const full     = response.content[0].text.trim();
  const parts    = full.split(/\\n\\s*\\n/);
  const caption  = parts.length > 1 ? parts.slice(0, -1).join('\\n\\n').trim() : parts[0]?.trim() || full;
  const hashtags = parts[parts.length - 1]?.startsWith('#')
    ? parts[parts.length - 1].trim()
    : HASHTAGS[slot.pillar] || '';

  return { caption, hashtags };
}`;

const NEW_RESEARCH = `async function researchTrend() {
  const shuffled = [...TRENDING_TOPICS].sort(() => Math.random() - 0.5);
  const topic1 = shuffled[0];
  const topic2 = shuffled[1];

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: \`You are a wellness science researcher for a boutique massage and esthetics spa.
Find credible, specific, recent research findings that a massage therapist or esthetician could reference in social media.
Focus on: mechanism of action, specific anatomy and physiology, surprising or counterintuitive findings.
Write for a knowledgeable practitioner — specific and accurate.\`,
      messages: [{ role: 'user', content: \`Research these two wellness topics and give me 4-6 specific findings a massage therapist or esthetician could share:\\n\\n1. \${topic1}\\n2. \${topic2}\\n\\nFor each: what it is, why it matters, one surprising detail.\` }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock) return null;
    return \`RESEARCH: \${topic1} + \${topic2}\\n\\n\${textBlock.text}\`;
  } catch (err) {
    console.error('[generate-content] Trend research error:', err.message);
    return \`RESEARCH CONTEXT: Fascia contains more sensory nerve endings than muscle (Schleip et al.) — making it a primary organ of proprioception and interoception. The lymphatic system processes approximately 3L of fluid daily with no intrinsic pump. The skin microbiome consists of approximately 1000 species and its disruption correlates with systemic inflammatory markers.\`;
  }
}`;

// Apply replacements in reverse line order
const replacements = [
  { start: resStart,  end: resEnd,     content: NEW_RESEARCH },
  { start: genStart,  end: genEndFull, content: NEW_GENERATE },
  { start: topicsStart, end: topicsEnd, content: NEW_TOPICS },
  { start: planStart, end: planEnd,    content: NEW_PLAN },
  { start: voiceStart, end: voiceEnd,  content: NEW_VOICE },
].sort((a, b) => b.start - a.start);

let finalLines = [...lines];
for (const r of replacements) {
  const newContent = r.content.split('\n');
  finalLines.splice(r.start, r.end - r.start + 1, ...newContent);
  console.log(`Replaced lines ${r.start+1}–${r.end+1} → ${newContent.length} lines`);
}

fs.writeFileSync('index.js', finalLines.join('\n'));
console.log('\n✓ Content generator upgraded with deep AZS voice and research themes');
console.log('\nNext:');
console.log('  git add -A && git commit -m "Deep AZS content voice and research themes" && git push');
console.log('  Then in Supabase SQL Editor:');
console.log('    DELETE FROM approval_queue;');
console.log('    DELETE FROM post_schedule;');
console.log('  Then re-run the curl to generate fresh content');
