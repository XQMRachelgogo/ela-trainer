/**
 * NY ELA Trainer — AI Day Pre-generation Script (Gemini Free API)
 * ================================================================
 * Generates simulation articles for Days 3–49 using Google Gemini
 * (completely FREE — 1500 requests/day free tier, we only need ~47 total).
 *
 * SETUP (one time):
 *   1. Go to https://aistudio.google.com/app/apikey
 *   2. Click "Create API Key" → copy it
 *   3. Run: export GEMINI_API_KEY=AIza...
 *
 * USAGE:
 *   node generate-days.mjs            # generate all missing days
 *   node generate-days.mjs --day 6    # generate just day 6
 *   node generate-days.mjs --from 6 --to 20  # generate days 6-20
 *
 * OUTPUT: creates data/day-006.json ... data/day-049.json
 * Then: git add data/ && git commit -m "Add AI days" && git push
 */

import fs from 'fs';
import path from 'path';

// ── Config ───────────────────────────────────────────────────────────────────
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) {
  console.error('\n❌  Missing API key.');
  console.error('   Get a free key at: https://aistudio.google.com/app/apikey');
  console.error('   Then run: export GEMINI_API_KEY=AIza...\n');
  process.exit(1);
}

const MODEL    = 'gemini-2.0-flash';   // free tier, fast, high quality
const DATA_DIR = './data';
const DELAY_MS = 4500;  // 15 req/min limit → ~4s between requests

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let fromDay = 3, toDay = 49;
const singleIdx = args.indexOf('--day');
const fromIdx   = args.indexOf('--from');
const toIdx     = args.indexOf('--to');
if (singleIdx !== -1) { fromDay = toDay = parseInt(args[singleIdx + 1]); }
if (fromIdx   !== -1) { fromDay = parseInt(args[fromIdx + 1]); }
if (toIdx     !== -1) { toDay   = parseInt(args[toIdx   + 1]); }

// ── Topics (7 themes, cycling across 47 AI days) ─────────────────────────────
const TOPICS = [
  {
    mc:      "A boy named Marcus who overcomes his fear of the dark after learning about nocturnal animals with his science teacher",
    info:    "How bees make honey and why honey never spoils, even after thousands of years",
    writing: "Excerpt from a nonfiction book about how monarch butterflies migrate thousands of miles to Mexico each winter"
  },
  {
    mc:      "A girl named Lily who moves to a new city and makes an unexpected best friend at the public library",
    info:    "How volcanoes form deep underground and what happens when they erupt",
    writing: "Excerpt from a nonfiction book about how ocean tides are caused by the moon's gravity"
  },
  {
    mc:      "Two siblings, Ana and Theo, who discover an old letter hidden inside a wall of their grandmother's attic",
    info:    "Why leaves change color from green to red, orange, and yellow in autumn",
    writing: "Excerpt from a nonfiction book about how desert animals survive extreme heat with very little water"
  },
  {
    mc:      "A shy third-grader named Priya who finds her confidence by joining the school garden club",
    info:    "How different birds collect materials and build their nests to protect their eggs",
    writing: "Excerpt from a nonfiction book about how the human digestive system breaks down food into energy"
  },
  {
    mc:      "A dog named Biscuit and a cat named Pepper who must work together to find their way home after getting lost in the park",
    info:    "The water cycle: how water evaporates, forms clouds, falls as rain, and flows back to the ocean",
    writing: "Excerpt from a nonfiction book about how the ancient Egyptians built the pyramids without modern machines"
  },
  {
    mc:      "A girl named Zoe who learns the meaning of patience by watching and waiting for a caterpillar to become a butterfly",
    info:    "How earthquakes happen along fault lines and how scientists use special tools to measure them",
    writing: "Excerpt from a nonfiction book about how animals and plants survive the long, dark winters in the Arctic tundra"
  },
  {
    mc:      "A boy named Elijah who misses his grandfather very much but finds comfort by continuing their shared hobby of birdwatching",
    info:    "How plants grow from tiny seeds and what roots, stems, and leaves each do to help the plant survive",
    writing: "Excerpt from a nonfiction book about the colorful coral reefs found in tropical oceans and the animals that live there"
  },
];

// ── Which days have AI slots (mirrors the HTML schedule logic) ────────────────
function scheduleForDay(dayNum) {
  // Day 1-2: fully real (skip)
  // Day 3-5: real MC + real MC+W + AI writing-only → only 1 article needed
  // Days 6+: i = dayNum-6; if i%3===2 → full AI (3 articles); else → 1 AI writing
  if (dayNum <= 2) return null;
  if (dayNum <= 5) return 'writing-only';
  const i = dayNum - 6;
  return i % 3 === 2 ? 'full' : 'writing-only';
}

// ── Gemini API call ───────────────────────────────────────────────────────────
async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',   // Gemini JSON mode — no markdown wrapping
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Empty response from Gemini');

  // Clean up just in case (responseMimeType should prevent wrapping)
  const clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(clean);
}

// ── Prompt builders ───────────────────────────────────────────────────────────
function buildWritingOnlyPrompt(dayNum, topic) {
  return `You are an expert New York State ELA test writer for Grade 3 (ages 8-9).

Generate exactly ONE informational or nonfiction excerpt that serves as a writing-only practice piece.

Topic: ${topic.writing}

PASSAGE REQUIREMENTS:
- ~280 words total
- 8-12 numbered paragraphs
- 2-3 section headings using: <div class="sh">Heading</div>
- 2-3 vocabulary boxes placed directly after the paragraph using the word: <div class="vb">word = simple definition</div>
- One diagram description at the end: <div class="diagram-note">&#9711; Diagram: [brief description]</div>
- Paragraph HTML: <div class="pr"><span class="pn">N</span><span class="pt" id="RN">Text.</span></div>
  (use R1, R2, R3... for paragraph IDs)
- Use HTML entities for all quotes: &#8220; &#8221; &#8216; &#8217; &#8230;
- Grade 3 reading level, engaging and informative

3 WRITTEN RESPONSE QUESTIONS (2 pts each):
- Each must ask students to use TWO details from the passage
- Variety: one about paragraph connections, one about a key idea, one about text features (diagram/heading/vocab)
- Each has: id, pts (2), prompt (with <strong>two</strong>), prompt_plain, rubric (3 items), modelAnswer (3-4 sentences)

Return a JSON ARRAY with exactly ONE object using this schema:
[{
  "id": "ai-wo-${dayNum}",
  "type": "w-only",
  "isReal": false,
  "source": "Simulation",
  "title": "Passage Title",
  "byline": "by Author Name",
  "directions": "Read this passage. Then answer questions 14 through 16.",
  "context": null,
  "passageHTML": "...all paragraph divs here...",
  "questions": [],
  "writings": [
    {
      "id": "ai-w1-${dayNum}",
      "pts": 2,
      "prompt": "Question with <strong>two</strong> details requirement.",
      "prompt_plain": "Question without HTML tags.",
      "rubric": ["Item 1", "Item 2", "Item 3"],
      "modelAnswer": "Complete 3-4 sentence model response."
    }
  ]
}]`;
}

function buildFullPrompt(dayNum, topic) {
  return `You are an expert New York State ELA test writer for Grade 3 (ages 8-9).

Generate a complete 3-article NYS ELA practice set.

ARTICLE 1 (type "mc") — Literary story, ~300 words, 6 multiple choice questions
Topic: ${topic.mc}

ARTICLE 2 (type "mc+w") — Informational passage, ~250 words, 5 MC questions + 2 written response (2 pts each)
Topic: ${topic.info}

ARTICLE 3 (type "w-only") — Nonfiction excerpt, ~280 words, 3 written response questions (2 pts each)
Topic: ${topic.writing}

PASSAGE HTML FORMAT (follow exactly):
- Each paragraph: <div class="pr"><span class="pn">N</span><span class="pt" id="XN">Text.</span></div>
- Article 1 paragraph IDs: P1, P2, P3...
- Article 2 paragraph IDs: Q1, Q2, Q3...
- Article 3 paragraph IDs: R1, R2, R3...
- Vocabulary: <div class="vb">word = definition</div> (after the paragraph using it)
- Section headings (info/nonfiction only): <div class="sh">Heading</div>
- Diagram (Article 3 only): <div class="diagram-note">&#9711; Diagram: [description]</div>
- ALL quote characters must use HTML entities: &#8220; &#8221; &#8216; &#8217; &#8230;
- NO raw " or ' characters inside passageHTML values

MC QUESTIONS (Articles 1 & 2):
- Fields: id, stem, choices (array of 4 strings), correct (0-3), ev (paragraph ID array), expl, wrong ({1:..., 2:..., 3:...})
- Test a range of skills: vocabulary in context, main idea, cause/effect, text structure, author's purpose, inference
- Range from accessible (p-value ~0.80) to challenging (~0.40)
- Stems may use <em> for italics

WRITTEN RESPONSE QUESTIONS:
- Fields: id, pts (2), prompt (HTML with <strong>two</strong>), prompt_plain, rubric (3 strings), modelAnswer (3-4 sentences)

Return a JSON ARRAY with exactly 3 objects. Schema:
[
  {
    "id": "ai-mc-${dayNum}",
    "type": "mc",
    "isReal": false,
    "source": "Simulation",
    "title": "Story Title",
    "byline": "by Author Name",
    "directions": "Read this story. Then answer questions 1 through 6.",
    "context": null,
    "passageHTML": "...",
    "questions": [{
      "id": "ai-q1-${dayNum}",
      "stem": "Question?",
      "choices": ["A.", "B.", "C.", "D."],
      "correct": 0,
      "ev": ["P2"],
      "expl": "Why A is correct.",
      "wrong": {"1": "Why B wrong.", "2": "Why C wrong.", "3": "Why D wrong."}
    }],
    "writings": []
  },
  {
    "id": "ai-mcw-${dayNum}",
    "type": "mc+w",
    "isReal": false,
    "source": "Simulation",
    "title": "Passage Title",
    "byline": "by Author Name",
    "directions": "Read this passage. Then answer questions 7 through 13.",
    "context": null,
    "passageHTML": "...",
    "questions": [],
    "writings": []
  },
  {
    "id": "ai-wo-${dayNum}",
    "type": "w-only",
    "isReal": false,
    "source": "Simulation",
    "title": "Excerpt Title",
    "byline": "by Author Name",
    "directions": "Read this passage. Then answer questions 14 through 16.",
    "context": null,
    "passageHTML": "...",
    "questions": [],
    "writings": []
  }
]`;
}

// ── Validate generated articles ───────────────────────────────────────────────
function validate(arts, mode) {
  if (!Array.isArray(arts)) throw new Error('Response is not an array');
  const expected = mode === 'full' ? 3 : 1;
  if (arts.length !== expected) throw new Error(`Expected ${expected} articles, got ${arts.length}`);
  for (const a of arts) {
    if (!a.id || !a.type || !a.passageHTML) throw new Error(`Article missing required fields: ${JSON.stringify(Object.keys(a))}`);
    if (a.type === 'mc' && a.questions.length < 6) throw new Error(`MC article has only ${a.questions.length} questions (need 6)`);
    if (a.type === 'mc+w' && a.questions.length < 5) throw new Error(`MC+W article has only ${a.questions.length} questions (need 5)`);
    if (a.writings?.length < (a.type === 'mc' ? 0 : 2)) throw new Error(`Writing article missing questions`);
  }
}

// ── Generate one day ──────────────────────────────────────────────────────────
async function generateDay(dayNum) {
  const padded = String(dayNum).padStart(3, '0');
  const outFile = path.join(DATA_DIR, `day-${padded}.json`);

  if (fs.existsSync(outFile)) {
    process.stdout.write(`  Day ${String(dayNum).padStart(2)} ✓ already exists, skipping\n`);
    return 'skip';
  }

  const mode  = scheduleForDay(dayNum);
  if (!mode) {
    process.stdout.write(`  Day ${String(dayNum).padStart(2)} — fully real content, skipping\n`);
    return 'skip';
  }

  const topic  = TOPICS[(dayNum - 3) % TOPICS.length];
  const prompt = mode === 'full' ? buildFullPrompt(dayNum, topic) : buildWritingOnlyPrompt(dayNum, topic);

  process.stdout.write(`  Day ${String(dayNum).padStart(2)} [${mode}] generating... `);

  const arts = await callGemini(prompt);
  validate(arts, mode);

  fs.writeFileSync(outFile, JSON.stringify(arts, null, 2));
  process.stdout.write(`✓ saved (${arts.length} article${arts.length !== 1 ? 's' : ''})\n`);
  return 'generated';
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n📚 NY ELA Trainer — Gemini Pre-generation');
  console.log('==========================================');
  console.log(`Model:  ${MODEL} (free tier)`);
  console.log(`Days:   ${fromDay} → ${toDay}`);
  console.log(`Output: ${path.resolve(DATA_DIR)}/\n`);

  let generated = 0, skipped = 0, errors = 0;
  const errorLog = [];

  for (let day = fromDay; day <= toDay; day++) {
    try {
      const result = await generateDay(day);
      if (result === 'generated') { generated++; await sleep(DELAY_MS); }
      else skipped++;
    } catch (err) {
      process.stdout.write(`\n  Day ${day} ❌ ${err.message}\n`);
      errorLog.push({ day, error: err.message });
      errors++;
      await sleep(DELAY_MS); // wait even on error to respect rate limits
    }
  }

  console.log('\n==========================================');
  console.log(`✅ Done!  Generated: ${generated}  Skipped: ${skipped}  Errors: ${errors}`);

  if (errors > 0) {
    console.log('\nFailed days (re-run with --from/--to to retry):');
    errorLog.forEach(e => console.log(`  Day ${e.day}: ${e.error}`));
  }

  if (generated > 0) {
    console.log('\nNext steps:');
    console.log('  git add data/');
    console.log('  git commit -m "Add pre-generated AI articles"');
    console.log('  git push');
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
main().catch(console.error);
