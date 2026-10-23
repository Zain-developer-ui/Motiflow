/**
 * Prompt builder — turns a transcript (or an .srt file) into a prompt the user
 * can paste into any chat model, which then answers with a `[RECIPE]` block
 * this app can render.
 *
 * Everything here is offline: no network, no API key, no account.
 *
 * The rules below are the contract with the renderer, not decoration. Every
 * attribute and every animation name listed here is implemented in
 * `engine/parse.ts` and `engine/scene.ts`. If you add an attribute to the
 * engine, add it here in the same commit — otherwise the model writes recipes
 * that parse but do nothing.
 */

export type PromptStyle = 'punch' | 'studio' | 'ink' | 'signal' | 'hook';

export type Aspect = '16:9' | '9:16';

export interface Cue {
  index: number;
  start: number;
  end: number;
  text: string;
}

export interface StylePreset {
  id: PromptStyle;
  name: string;
  blurb: string;
  /** A glyph that stands in for the style in the picker. */
  icon: string;
  tags: string[];
  direction: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'punch',
    name: 'Punch',
    blurb: 'Flat depth, emoji as artwork, a change on every stressed word.',
    icon: '◆',
    tags: ['Flat', 'Emoji', 'Fast'],
    direction: `Flat depth, emoji only, fast pace. Everything is type, colour and emoji
against a permanent background — no cards, no images, no gradients.
Palette (pick from the subject, never ask):
  DEEP  #0A0E1A · accent #FFD166 · text #FFFFFF · dim #8FA3C8   money, business
  INK   #101014 · accent #E5E5E5 · text #FFFFFF · dim #7A7A85   calm, premium
  HEAT  #14090B · accent #FF6B4A · text #FFF7F5 · dim #C08A80   urgency, warning
  DEPTH #06121A · accent #35D6C0 · text #F0FFFC · dim #6E9AA5   tech, systems
Background, one block of lines, all running the full duration:
  base rect w=1.5 h=1.5, darkest colour, z=0, d=0.1
  accent circle w=0.95, opacity 0.10–0.18, off-centre, z=0, d=0.15
  vignette circle, near-black, opacity 0.12, opposite corner, z=1, d=0.15
  two or three dim symbols (│ ─ ◆ ●), size 180–320, opacity 0.06–0.12, z=1, d=0.2–0.25
Emoji and symbols are the artwork. A 150 px emoji with popIn is a legitimate
hero. Colour emoji ignore color=; monochrome symbols take it. Three emoji on
screen at most.
Every section has one graphic device — a DRAW arrow, a BURST ring, a bar, a
SLAM number — and a different device from the section before.`,
  },
  {
    id: 'studio',
    name: 'Studio',
    blurb: 'Composed product film. One card at a time, generous margins.',
    icon: '▭',
    tags: ['Cards', 'Calm', 'Premium'],
    direction: `Composed and quiet. One surface at a time, generous margins, type that
breathes. This is a product film, not a slideshow: the card stays, its content
changes inside it.
Palette: bg #0E1013, card grad #171A1E,#121417, strokeColor rgba(255,255,255,0.10),
text #F5F3EF, dim #9AA0AA, accent #7FD1B9.
Structure: hook line (size 84–96) → a pill label → two or three rows inside the
card → closing line. Cards radius 28–36, shadow 0.35, w 0.6–0.72, never
full-bleed. Rows are text at size 34–40 plus a check or a small shape at 40–52.
Motion: riseIn and fadeUp, stagger 0.15–0.25 s, exits fadeOut. Cards slide in
with slideU once at the top of the film and then never leave.
Camera: one slow push per section (zoom 1.02–1.04); parallax subtle — card
d=0.9, background d=0.3.
At most one card, three text elements and one accent shape on screen.`,
  },
  {
    id: 'ink',
    name: 'Ink',
    blurb: 'Editorial monochrome. Type is the whole design.',
    icon: '▤',
    tags: ['Mono', 'Editorial', 'Quiet'],
    direction: `Editorial monochrome. No emoji, no cards, no colour except one ink accent.
Palette: bg #FBFAF8, text #191713, dim #8A857D, accent #5A63C4, or invert it:
bg #0D0D0F, text #F4F2EE, accent #8B93F8.
Type is the whole design: display for headlines, sans for labels, three sizes
only, left-aligned in a column whose left edge sits at x=0.12. Rules made of
shape line with h=4 separate ideas. Numbers are oversized and sit alone.
Motion is typographic: typeOn, charFade and wordIn. No slides, no bounces, no
zooms on text. Exits fadeOut. The camera stays still or drifts to 1.02.
One accent rule per section that DRAWs (anchor=left, growTo=w) under the word
that matters, plus one BURST or BUMP. Nothing else moves.
White space is the design: at most two things on screen, one of them a line.`,
  },
  {
    id: 'signal',
    name: 'Signal',
    blurb: 'Data story. Every claim ends in a number and a bar.',
    icon: '▮',
    tags: ['Data', 'Bars', 'Counters'],
    direction: `Data first. Every claim resolves into a number.
Palette: bg #0B1220, text #F2F6FF, dim #7C8BA1, accent #6EE7B7, second accent
#F5B759 for the comparison bar only.
Structure per section: claim line (size 50–60, weight 700) → bars or a ring →
the count. Bars are rect with anchor=bottom, w=0.06–0.1, radius 6, grown with
growTo=h. A bar and its number share t0,t1. Pin the number with follow, e.g.
follow=barA,top,-48, and give the follower the same d as the bar.
Numbers: size 84–108, font=display, weight 800, count=… with the right format
(pct, inr, group, lakh, x). Labels: size 30–36 at opacity 0.75.
At most four bars, one baseline rule, one label per bar. The final number gets
the push and one BUMP. Bars never animate twice.`,
  },
  {
    id: 'hook',
    name: 'Hook',
    blurb: 'Vertical short-form. Huge type, a hit every second.',
    icon: '▶',
    tags: ['Vertical', 'Loud', 'Short'],
    direction: `Built for the first second. Vertical, huge, loud.
Palette: bg #0B0B0F, text #FFFFFF, accent #FF6B4A, dim #8A8A95.
Type 96–132, weight 800, four words per line maximum, centred on the optical
third (y 0.36–0.46). One idea per beat, 0.8–1.6 s, no element older than 2 s.
Entrances: popIn, zoomIn, slideL, slideR only. Exits: scaleDown, popOut. Every
line lands with either a SLAM or a BUMP on its stressed word. Camera punches
(zoom 1.05–1.08, 0.4 s) on the strongest word of each line, then returns to
1.02. No camera drift otherwise.
The first frame carries the strongest claim — never a greeting, never a logo.
One emoji or symbol per beat at most, 110–170 px, behind or beside the type.`,
  },
];

export const styleById = (id: PromptStyle): StylePreset =>
  STYLE_PRESETS.find((s) => s.id === id) ?? STYLE_PRESETS[0];

/* ------------------------------------------------------------------ */
/* SRT parsing                                                         */
/* ------------------------------------------------------------------ */

const TIME_TOKEN = /(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/;

/** A timestamp as it appears inside an .srt/.vtt file: `HH:MM:SS,mmm` or `MM:SS.mmm`. */
const TIMESTAMP = String.raw`(?:\d{1,3}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?`;

function toSeconds(raw: string): number | null {
  const match = raw.match(TIME_TOKEN);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const ms = match[4] ? Number(`0.${match[4]}`) : 0;
  return hours * 3600 + minutes * 60 + seconds + ms;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Seconds → the `MM:SS.hh` format the recipe parser expects. */
export function toRecipeTime(seconds: number): string {
  const total = Math.max(0, seconds);
  let minutes = Math.floor(total / 60);
  const rest = total - minutes * 60;
  let whole = Math.floor(rest);
  let cents = Math.round((rest - whole) * 100);

  if (cents === 100) {
    cents = 0;
    whole += 1;
  }
  if (whole === 60) {
    whole = 0;
    minutes += 1;
  }
  return `${pad(minutes)}:${pad(whole)}.${pad(cents)}`;
}

export function isSrt(text: string): boolean {
  return new RegExp(`${TIMESTAMP}\\s*-->\\s*${TIMESTAMP}`).test(text);
}

export function parseSrt(input: string): Cue[] {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const blocks = text.split(/\n{2,}/);
  const cues: Cue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    const arrowIndex = lines.findIndex((l) => l.includes('-->'));
    if (arrowIndex < 0) continue;

    const [fromRaw, toRaw] = lines[arrowIndex].split('-->');
    const start = toSeconds(fromRaw ?? '');
    const end = toSeconds(toRaw ?? '');
    if (start === null || end === null || end <= start) continue;

    const body = lines
      .slice(arrowIndex + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (!body) continue;

    cues.push({ index: cues.length + 1, start, end, text: body });
  }

  return cues;
}

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Rough runtime for a plain transcript, used only as a hint in the UI. */
export function estimateDuration(transcript: string, cues: Cue[]): number {
  if (cues.length) return cues[cues.length - 1].end;
  const words = wordCount(transcript);
  if (!words) return 12;
  return Math.min(240, Math.max(6, words / 2.6 + 1.5));
}

export interface PromptInput {
  transcript: string;
  cues: Cue[];
  aspect: Aspect;
  fps: number;
  style: PromptStyle;
  /** Known runtime in seconds. Cue timings win over this. */
  duration?: number | null;
}

const CANVAS_COST =
  '16:9 → 1920×1080     9:16 → 1080×1920';

const BASE = `You are Motiflow's motion designer. Turn a transcript into a Motiflow
recipe: a plain-text motion script this renderer plays back frame by frame.
There are no images and no stock footage — every frame is type, shapes and
emoji, positioned from numbers you write. Output only the two blocks below: no
greeting, plan, code fence or commentary. One exception: NEED_DURATION.

## THE TWO BLOCKS
[ASSETS]
[/ASSETS]

[RECIPE]
v1
MM:SS.hh --> MM:SS.hh TYPE [SUBTYPE] ["text"] key=value key=value
[/RECIPE]

First recipe line is exactly v1. One element per line. --> has a space each
side. \`#\` starts a comment — at most one short header per section. There are
no assets: [ASSETS] is always present and always empty.

If the runtime is unknown, answer with exactly one line and nothing else:
NEED_DURATION: How long is the voiceover, in seconds?

## CANONICAL FRAME AND THE UNIT RULE
${CANVAS_COST}

Pixel values are authored against the SHORT side of a 1080 frame and scale with
the render, so the same recipe reads the same at 1080p, 720p and on a phone.

  value ≤ 1    a fraction of the frame WIDTH. w=0.5 is half the width, w=1.5
               runs past both edges — that is how a background bleeds.
  value > 1    pixels on the 1080 short side. size=96 is 96 px tall on a
               1080×1920 phone frame and on a 1920×1080 landscape frame.
  pos=x,y      always a fraction of width and height.

Never write 1–4 meaning pixels: h=2 is twice the frame height. A hairline is
h=4. A 6 px rule is thick=6.

## THE TRANSCRIPT
Timed cues, "MM:SS.hh --> MM:SS.hh text": those are real spoken times. Keep a
cue's words inside its own window.
Word-level timings: group words into phrases of 2–5 words carrying one idea.
Never one element per word; never one element per sentence.
Plain script with no timings: lay it out by characters — 60 characters over 5 s
is 12 characters per second — and ask for the duration first if it is missing.
Merge zero-length entries into a neighbour and clip anything past the end.
Every element lands on the word that names it, not at the start of its phrase.

## ELEMENTS
scene    the background. Exactly one per recipe, spanning the whole runtime.
         bg=#RRGGBB grid=#RRGGBB accent=#RRGGBB vignette=0..1
text     "the words" — size= weight= font= align= w= color=
shape    rect | circle | pill | ring | line | check | arrow
         rect and pill are boxes, circle and ring are round, line is a rule,
         check is a tick, arrow points right. w is the length of an arrow or a
         line; h is its head or its thickness. No h on circle or ring.
card     a surface behind content. w h radius grad color stroke strokeColor shadow
camera   a move, not an object: x= y= zoom=

Universal: pos= w= h= z= opacity= in= out= inDur= outDur= emph= d=
keys= growTo= count= follow= id= anchor= align= color=

## ATTRIBUTES
pos=x,y   the CENTRE of the element, 0–1, 0,0 top-left. This is the most common
          mistake. pos is never a corner unless anchor= says so.
w h       layout size. For text, w is the wrap box AND the alignment box, so
          text without w has an unpredictable left edge. Always set w on text.
anchor    left | right | top | bottom — pos now means that EDGE, not the centre.
          anchor=bottom grows a bar up from its base; anchor=left makes a rule or
          arrow grow out of its tail. This replaces most x/y keyframing.
align     left | center | right — where lines sit inside w. Left-aligned
          headlines share an edge; everything centred looks like a slide deck.
d         0–1. How much the layer follows the camera: background 0.1–0.25,
          foreground 1. That difference is the parallax.
size      text px (see SIZING)   weight 400–800   font display | sans | mono | deva
color     #RRGGBB   radius ≤1 is a fraction of the box, >1 is px
thick     px, or ≤1 as a fraction of h — on line, ring, arrow
stroke    px outline   strokeColor #RRGGBB   shadow 0–1   glow 0–1
z         paint order; higher sits on top
emph      pulse | shake — loops for the element's whole life.

## VOCABULARY — use these names exactly; a typo silently gives no animation
Entrances   fadeUp riseIn slideL slideR slideU slideD scaleIn popIn zoomIn blurIn none
Text only   typeOn charIn charFade wordIn
Exits       fadeOut blurOut scaleDown popOut zoomOut slideOutL slideOutR none
Emphasis    pulse shake

slideL arrives from the right moving left; slideR from the left; slideU from
below; slideD from above. zoomIn starts 40% too big and settles. inDur 0.25–0.4
on headlines, 0.15–0.25 on words and emoji; outDur 0.25–0.3.

## MOTION — where the pace comes from
keys=scale:6.30=1,6.42=1.06,6.60=1;opacity:1.70=0,1.80=1

Times are ABSOLUTE seconds. Tracks are separated by ; and keyframes by , with
no spaces. Keyable: x y scale rot opacity. Values hold before the first key and
after the last; append ~l to a value to make the segment into it linear. One
track per property per element — merge, never write x: twice. A move that starts
the life IS the entrance: write in=none beside it.

BUMP    a stressed word, an emoji    keys=scale:t=1,t+0.12=1.08,t+0.3=1
SLAM    punchline, big number         in=none keys=scale:t=1.6,t+0.17=0.95,t+0.28=1;opacity:t=0,t+0.08=1
NUDGE   a survivor changes slot      keys=x:t=x0,t+0.6=x1   (then it holds)
BURST   ring on an arrival           shape ring w=200 growTo=w,200,420,t,t+0.7 keys=opacity:t=0.7,t+0.7=0
DRAW    rule, underline, arrow       shape line w=0.3 anchor=left growTo=w,0,0.3,t,t+0.6
STEP    a bar leaving its base       shape rect w=0.08 h=0.36 anchor=bottom growTo=h,0.02,0.36,t,t+0.7

DRAW and STEP need no keyframes. anchor=left or anchor=bottom does the work the
six-key trick used to do.

## NUMBERS
count=from,to,t0,t1[,fmt] runs a value between two times. fmt is one of
  pct → 3%     inr → ₹4,02,000     group → 402,000     lakh → 4.02L     x → 2x
  anything else is appended literally (count=0,12,1.0,2.0,+)
A bar and its number share t0,t1. Write the bar first with id=barA, then pin
the number with follow=barA,top,-48 — the offset is px from that edge. A
follower inherits its target's d.
growTo=prop,from,to,t0,t1 grows one property once; endpoints share the units of
that property. growTo=h on an anchor=bottom rect is a bar rising from its base.

## DEPTH
One camera line eases from the previous state to its own, then holds:
00:07.00 --> 00:09.00 camera x=0.5 y=0.52 zoom=1.05
- One drift line per section, alternating zoom 1.02 and 1, x or y moved ≤0.01.
- One push per video, zoom 1.04–1.06 over 0.6–0.9 s, on the most important
  word, then back to ≤1.02.
- Depth by weight: background at opacity 0.06–0.35, larger and dimmer;
  foreground full strength. Never fake parallax by ending and restarting an
  element — keep it alive and NUDGE it.

## SIZING
Hero headline / number   84–108      Body / caption   34–45
Headline                 60–84       Small label      27–34
Sub-headline             45–60       Emoji as icon    100–180
                                      Emoji as accent  45–80

Two or three text sizes per video. The hero size goes to numbers and the
punctuation word; the headline size to everything else. An emoji is text: give
it w ≈ 1.2 × size.

## SAFE AREA — check the arithmetic
Content stays inside x 0.06–0.94, y 0.08–0.92:
left = x − w/2 ≥ 0.06 and right = x + w/2 ≤ 0.94.
Vertical aspects: also keep content inside y 0.10–0.88.

Measure AFTER the camera. A point lands at
  x_screen = 0.5 + (x − cam_x) × (1 + (zoom − 1) × d)
Check it at the push, not at rest. Within 0.25 of an edge, never enter or exit
moving toward that edge.

Text wraps but never shrinks: about 18 Latin or 14 Devanagari characters per
line at headline size. Line width ≈ characters × size × 0.55 (display),
0.52 (sans), 0.60 (deva). Break a two-line phrase with \\n at a phrase
boundary and set w ≥ longest line + 40 px.

## TIMING
- START is when the naming word is spoken; the entrance plays from there.
- Minimum lifetime 1.2 s; headlines 1.6 s. Rings, DRAW lines and BURSTs are
  effects with no minimum.
- Lifetime beats word placement. If a word is too late, start on the first word
  of the phrase; in the last section start early enough to reach the minimum by
  the end of the voiceover. Never cut short.
- Never round to whole seconds. Nothing runs past the voiceover.
- Background lines run the full duration, each as one line.

## LAYERING
z=0 background · z=1–3 texture, supporting shapes, rules · z=4–6 text and emoji
· z=8–9 persistent chrome.

## LANGUAGE
On-screen words come from the transcript in its own language — never translate.
Hinglish stays Hinglish: English words in Latin, Hindi in Devanagari. Fix
obvious transcription errors: an English word the transcript spelled in
Devanagari goes on screen as the intended word. Any Devanagari text gets
font=deva. Never a full sentence: 2–4 words carrying the point.`;

const EXAMPLE = `[ASSETS]
[/ASSETS]

[RECIPE]
v1
# ground
00:00.00 --> 00:10.00 scene bg=#0A0E1A accent=#16233D vignette=0.45
00:00.00 --> 00:10.00 shape rect pos=0.5,0.5 w=1.5 h=1.5 color=#0A0E1A d=0.1 z=0 in=none out=none
00:00.00 --> 00:10.00 shape circle pos=0.84,0.2 w=1.25 gradr=#FFD16629,#FFD16600 d=0.15 z=0 in=none out=none
00:00.00 --> 00:10.00 shape circle pos=0.1,0.92 w=1.1 gradr=#00000024,#00000000 d=0.15 z=1 in=none out=none
00:00.00 --> 00:10.00 text "│" pos=0.1,0.5 w=0.2 size=300 color=#8FA3C8 opacity=0.06 d=0.2 z=1 in=none out=none
00:00.00 --> 00:10.00 text "◆" pos=0.9,0.9 w=0.3 size=210 color=#8FA3C8 opacity=0.07 d=0.25 z=1 in=none out=none
# camera
00:00.00 --> 00:03.30 camera x=0.5 y=0.5 zoom=1.02
00:03.30 --> 00:06.50 camera x=0.51 y=0.5 zoom=1
00:06.50 --> 00:09.10 camera x=0.5 y=0.52 zoom=1.02
00:09.10 --> 00:09.90 camera x=0.5 y=0.52 zoom=1.05
00:09.90 --> 00:10.00 camera x=0.5 y=0.52 zoom=1.02
# S1 · "आपका पैसा बैंक में रखा नहीं रहता"
00:00.10 --> 00:03.30 text "पैसा रखा\\nनहीं रहता" pos=0.31,0.26 w=0.5 size=92 font=deva weight=800 align=left color=#FFFFFF z=5 in=wordIn inDur=0.4 out=fadeOut
00:00.45 --> 00:03.05 text "💰" pos=0.18,0.62 w=0.24 size=150 z=6 in=popIn inDur=0.3 out=popOut
00:01.15 --> 00:03.10 shape arrow pos=0.3,0.62 w=170 h=44 thick=6 anchor=left color=#FFD166 growTo=w,12,170,1.15,1.50 z=4 in=none out=fadeOut
00:02.05 --> 00:02.85 shape ring pos=0.47,0.62 w=190 thick=3 color=#8FA3C8 growTo=w,190,420,2.05,2.80 keys=opacity:2.05=0.5,2.80=0 z=3 in=none out=none
# S2 · "बैंक वो पैसा loan पर देता है"
00:03.20 --> 00:06.50 text "बैंक आगे\\nदेता है" pos=0.64,0.26 w=0.5 size=92 font=deva weight=800 align=left color=#FFFFFF z=5 in=charFade inDur=0.45 out=blurOut
00:04.30 --> 00:06.40 text "LOAN" pos=0.62,0.62 w=0.34 size=104 font=display weight=800 color=#FFD166 z=6 in=none keys=scale:4.30=1.6,4.47=0.95,4.58=1,5.90=1,6.02=1.08,6.20=1;opacity:4.30=0,4.38=1 out=scaleDown
00:05.10 --> 00:06.50 text "👤" pos=0.84,0.62 w=0.2 size=140 z=6 in=zoomIn inDur=0.25 out=popOut
# S3 · "और ज्यादा interest कमाता है — आपको सिर्फ 3%"
00:06.40 --> 00:10.00 text "ज्यादा\\ninterest" pos=0.31,0.24 w=0.5 size=92 font=deva weight=800 align=left color=#FFFFFF z=5 in=wordIn inDur=0.4 out=none
00:07.00 --> 00:10.00 shape rect id=barA pos=0.52,0.86 w=0.09 h=0.34 anchor=bottom color=#8FA3C8 opacity=0.45 growTo=h,0.02,0.30,7.00,7.80 z=4 in=none out=none
00:07.00 --> 00:10.00 text "बैंक" pos=0.52,0.9 w=0.2 size=42 font=deva weight=600 color=#B8C4D8 z=5 in=popIn inDur=0.2 out=none
00:08.10 --> 00:10.00 shape rect id=barB pos=0.74,0.86 w=0.09 h=0.34 anchor=bottom color=#FFD166 growTo=h,0.02,0.1,8.10,8.70 z=5 in=none out=none
00:08.10 --> 00:10.00 text "0" pos=0.74,0.7 w=0.26 size=76 font=display weight=800 align=center color=#FFD166 follow=barB,top,-84 count=0,3,8.10,8.70,pct keys=scale:9.40=1,9.52=1.12,9.70=1 z=6 in=popIn inDur=0.25 out=none
[/RECIPE]`;

/**
 * Builds the full prompt. The model is told to answer with a single `[RECIPE]`
 * block, which the app parses directly.
 */
export function buildPrompt(input: PromptInput): string {
  const { transcript, cues, aspect, fps, style, duration } = input;
  const preset = styleById(style);

  const cueDuration = cues.length ? cues[cues.length - 1].end : null;
  const runtime = cueDuration ?? (duration && duration > 0 ? duration : null);

  const frame = aspect === '9:16'
    ? 'Vertical 9:16 — a phone screen. Design for one thumb and one glance.'
    : 'Landscape 16:9 — a player or a presentation.';

  const source = cues.length
    ? `Timed transcript — these times are real, reuse them:\n${cues
        .map((cue) => `${toRecipeTime(cue.start)} --> ${toRecipeTime(cue.end)}  ${cue.text}`)
        .join('\n')}`
    : `Transcript:\n${transcript.trim() || '(nothing was pasted — ask for it, invent nothing)'}`;

  const timing = runtime
    ? `Total runtime: ${runtime.toFixed(2)} s. Nothing may start or end after it.
${cues.length ? 'Cue windows are exact. An element may enter a little before its cue and leave a little after, never past the runtime.' : 'Lay the script out by character count: total characters ÷ seconds, then place each phrase where its words are spoken.'}
Aim for 2–3 recipe lines per second of video.`
    : `The runtime was not given. Reply with exactly one line and nothing else:
NEED_DURATION: How long is the voiceover, in seconds?
The next message will carry the duration; then write the recipe.`;

  return `${BASE}

## PLAN — think silently, never print it
1. Split the transcript into sections, one per sentence; note times and stressed words.
2. Give each section one point in four words or fewer, and one graphic device.
3. Find the most important word in the video: it gets the push and the SLAM.
4. Pick the palette; write the background block and one camera line per section.
5. Place elements on their words; list the beat times; fill any gap over 1.2 s.
6. Write every line in time order, and put \`follow\` targets above their followers.

## STYLE — ${preset.name}
${preset.direction}

## EXAMPLE — grammar, timing and the motion devices
This is a Punch-style recipe. Take the mechanics — where elements start, how
keys are written, how a bar and its count are pinned — not the palette. Copy
nothing you cannot justify from the transcript.
${EXAMPLE}

## FINAL CHECK — silently, before you answer
1. Only the two blocks; v1 first; [ASSETS] empty; every line fits the grammar.
2. Every preset name is in the vocabulary; no invented animation.
3. Unit rule: nothing between 1 and 4 is meant as pixels; hairlines are h=4.
4. Every text has w. Every emoji has w. Every Devanagari line has font=deva.
5. Safe area after the camera; backgrounds bleed past the frame edges.
6. Lifetimes ≥1.2 s, headlines ≥1.6 s, nothing past the runtime.
7. Keys: absolute times, one track per property, keyed entrances use in=none.
8. A beat every 0.3–0.9 s, no gap over 1.2 s; sections overlap by 0.1–0.3 s.
9. No two elements in start order share an entrance; each section a new device.
10. One palette; the accent on one idea per section; three emoji at most.
11. ≥0.04 between adjacent edges, margins roughly equal, not everything at x=0.5.

## VIDEO SETTINGS
- Aspect: ${aspect} (${frame})
- Resolution: 1080p
- Frame rate: ${fps} fps — the finest timing step is ${(1 / fps).toFixed(3)} s
- Duration: ${runtime ? `${runtime.toFixed(2)} s` : 'unknown'}

## TIMING
${timing}

## TRANSCRIPT
${source}

Now answer.`;
}
