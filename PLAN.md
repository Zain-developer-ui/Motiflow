# Motion Graphics Studio — Plan v3 (Motiflow)

> Status: **v2 shipped** (P0–P3.3, built app in `src/`, plan §1–8 rehne do as reference).
> §9 se aage **v3** hai: high-level motion, idea→recipe compiler, voice/beats, review loop,
> aur SEO/GEO/AEO/LLMO.
> Date: 2026-10-25 · Budget: **free** (no paid API, no server, no login) · Target: **production ready**

**Short version (Roman Urdu).** v2 ne foundation diya: recipe parser, canvas renderer, MP4
export with audio, studio, undo/redo, aur ab tez playback. Ab teen cheezein kamm hain:
(a) **taste** — high-level motion (masked reveals, image layers, themed sections, UI cards,
karaoke captions) taake reference video jaisa output ho; (b) **speed to output** — user idea
bole aur app khud recipe likhe, AI ke chakkar se bachne ke liye; (c) **reach** — SEO/GEO/AEO/LLMO
taake log Motiflow ko dhoond sakein. Teeno ka plan neeche hai, phases ke saath.

---

## 1. LogiCut ka asli workflow (aap ke screenshots se confirm)

Do stage ka pipeline hai — **AI video banata nahi, AI sirf code likhta hai.**

```
 ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐    ┌────────────┐
 │  TRANSCRIPT │───▶│  PROMPT      │───▶│  ChatGPT /      │───▶│  [RECIPE]  │
 │  (.txt/.srt)│    │  BUILDER     │    │  Claude         │    │  +[ASSETS] │
 └─────────────┘    └──────────────┘    └─────────────────┘    └─────┬──────┘
                                                                     │ paste
 ┌───────────────────────────────────────────────────────────────────▼──────┐
 │  DETERMINISTIC RENDERER  (canvas)  →  STUDIO  →  MP4 / WebM              │
 └──────────────────────────────────────────────────────────────────────────┘
```

**Stage 1 — Prompt Builder ("Get code" screen)**
- Transcript paste / `.txt` / `.srt` upload
- Aspect: `16:9` ya `9:16`
- FPS: `30` ya `60`
- Edit style (database se): Dynamic No Assets · Dynamic No Assets Improved ·
  Composed · Motion Graphics · Motion Graphics Dynamic BETA
- Button: **Get Prompt** → ek bara prompt banata hai jisme: editing rules +
  animation vocabulary + transcript + style + format bundle hota hai

**Stage 2 — LLM**
- Wohi prompt ChatGPT/Claude mein paste karo
- Model do block return karta hai: `[ASSETS]` aur `[RECIPE]`

**Stage 3 — Studio**
- `I have code` → paste → **preview** (koi server render nahi, live canvas)
- Phir edit: timeline drag/trim, keyframes, inspector, code view, 3D cam
- Export → MP4 (1080p, 30/60fps)

**Critical detail:** SRT upload karne se timestamps milte hain → animations
voiceover ke saath sync hoti hain. Plain text mein timestamps nahi hote, is liye
LogiCut likhta hai *"The app cannot invent them"*. **SRT parsing = killer feature.**

---

## 2. DSL spec — jo aapke recipe se decode hua

Ye pichle analysis se zyada complete hai:

### Layer syntax
```
start --> end  <type> <subtype?> "<text>" key=value key=value ...
```

### Layer types (12)
`scene` · `text` · `card` · `camera` · `shape rect` · `shape circle` ·
`shape pill` · `shape ring` · `shape line` · `shape check` · `shape arrow`

### Properties
| Group | Keys |
| --- | --- |
| Position | `pos=x,y` (0–1 normalized), `x`, `y`, `z` (stack order) |
| Size | `w`, `h`, `size` (font), `weight`, `thick`, `rot`, `radius` |
| Style | `color`, `grad=c1,c2`, `gradr=c1,c2` (radial), `stroke`, `strokeColor`, `shadow`, `glow`, `vignette` |
| Type | `font=display\|sans` |
| Timing | `in`, `out`, `inDur`, `outDur`, `d` (delay) |
| Motion | `keys=prop:t=v;prop:t=v` · `growth` · `count` · `growTo` |

### Keyframes (asli power)
```
keys=scale:0.50=0.5,0.69=1.12,0.80=1;opacity:0.50=0,0.60=1
keys=x:1.00=0.72,1.55=0.58
keys=x:8.60=0.295~l,8.70=0.322~l     ← ~l = linear (no easing)
```
Semicolon se properties alag, comma se keyframes, `~l` = linear.

### Procedural animations
```
growTo=w,560,900,1.65,2.40      → width 560→900, time 1.65→2.40
count=0,2,19.80,20.60           → number 0→2, time 19.80→20.60
```

### Entry/exit vocabulary
`charIn` · `typeOn` · `wordIn` · `fadeUp` · `riseIn` · `fadeOut` · `blurOut` ·
`scaleIn` · `scaleDown` · `popIn` · `charFade` · `none`

### Comments
`# S1 STATEMENT + CLICK · 0-4.2` — sections ke liye, renderer ignore karta hai.

---

## 3. Studio UI — jo aap ne dikhaya

| Area | Kya hai |
| --- | --- |
| **Left** | `Assets` / `Layer` tabs · assets auto-appear (AI image prompt ke saath) · `Go to Code` |
| **Center** | Canvas + Fit · playhead scrubber · `Length` input · `Fit to layers` · preview quality `1/2`–`1/5` |
| **Right** | `3D Cam` / `Code` tabs · Add text/shape/image/video/audio |
| **Timeline** | Camera row keyframes (`in 1.03x`) · layer rows · drag = move · edge = trim · hold = multi-select · `Keyframe` btn · snap toggle |
| **Top** | `16:9 · 1080p · 30fps` · `Export` |
| **Bottom** | Add text/shape/image/video/audio bar |

---

## 4. Free + production-ready stack

### Frontend (static — hosting free)
| Layer | Choice | Kyun |
| --- | --- | --- |
| Build | **Vite + TypeScript** | Fast, zero config, static output |
| UI | **React 19** | Studio panels/timeline ke liye best; Angular yahan overkill |
| State | **Zustand** | Timeline state simple rakhta hai |
| Style | **Tailwind CSS** | Fast iteration |
| Render | **Canvas 2D** (+ `filter`/`shadowBlur`) | Deterministic frames, koi DOM reflow nahi |

### Export (sab se important decision)
| Option | Kaam | Cost |
| --- | --- | --- |
| **WebCodecs + `mp4-muxer`** ✅ | Browser mein seedha H.264 MP4 | Free, client-side |
| `mediabunny` | Higher-level wrapper, audio + video | Free |
| MediaRecorder | WebM fallback (Safari) | Free |
| Server FFmpeg | Zyada control, but slow + paisa | ❌ budget |

**Decision: client-side WebCodecs.** 36s 1080p30 video ka raw size ~9 GB hota,
is liye frames ko memory mein jama nahi karna — encode karte jao, mux karte jao.
`VideoEncoder` + `mp4-muxer` exactly yehi karta hai. **Server = zero.**

### LLM layer
- **Default: paste-flow** (ChatGPT/Claude free) — cost zero, same as LogiCut
- Optional: user apni API key daale (localStorage) → one-click generate
- Model ko *sirf* recipe likhni hai — video render server nahi karta

### Baad ke liye (sirf agar accounts chahiye)
- **Supabase free tier** — auth + Postgres + storage
- **Cloudflare Pages / Vercel** — static hosting free

### Aap ka existing stack
PHP/Laravel/ASP.NET Core/MySQL **is app mein lagne ki zaroorat nahi** — ye 95%
client-side app hai. Aap ka TypeScript + JS + CSS kaam aayega, Angular/React
ka basic knowledge kaafi hai. **Backend = 0 servers, 0 bills.**

---

## 5. Modules (build order)

| # | Module | Kya | Mushkil |
| --- | --- | --- | --- |
| 1 | **Parser** | Recipe text → AST (layers, keyframes, tracks) | 🟢 Easy |
| 2 | **Renderer** | Canvas 2D, time → frame, 12 layer types + easings | 🟡 Medium |
| 3 | **Export** | WebCodecs encode + MP4 mux, progress UI | 🟡 Medium |
| 4 | **Prompt Builder** | Template + style presets + SRT parser | 🟢 Easy |
| 5 | **Studio** | Timeline, drag/trim, inspector, keyframe editor | 🔴 Hard |
| 6 | **Projects** | localStorage / IndexedDB save, JSON import-export | 🟢 Easy |
| 7 | **Auth/Cloud** | Supabase (optional, baad mein) | 🟢 Easy |

**Sab se mushkil = Studio timeline.** Baqi 5 modules milke bhi itna waqt nahi
lengay jitna timeline editor leta hai (drag, trim, multi-select, snapping,
keyframe UI, undo).

---

## 6. Phases

| Phase | Deliverable | Time (part-time) |
| --- | --- | --- |
| **P0** | Parser + Renderer + Export — recipe paste karo, MP4 download | 1.5–2 hafte |
| **P1** | Prompt builder + 5 style presets + SRT timing | 3–4 din |
| **P2** | Studio: timeline read-only + play/scrub + preview quality | 1 hafta |
| **P3** | Studio editing: drag, trim, multi-select, inspector | 2 hafte |
| **P4** | Keyframe editor + undo/redo + save/load | 1 hafta |
| **P5** | Assets (images/video/audio), 3D cam, polish | 1–2 hafte |
| **P6** | Deploy + analytics + error states | 2–3 din |

**P0 ke baad hi aap videos bana sakoge** — studio baad mein aata hai. Is liye
P0 ko pehle ship karo, phir P1, phir studio.

---

## 7. Legal / ethical guardrails

- LogiCut ka **prompt text, style presets, UI copy, ya code copy nahi karna.**
- DSL *syntax* (time ranges, key=value) ek format hai — compatible rakhna theek
  hai, lekin apna vocabulary + apne presets banao.
- Apne naam/brand se ship karo, "LogiCut clone" mat likho.
- Fonts: sirf OFL/Google Fonts (Inter, Sora, Space Grotesk) — system fonts par
  bharosa mat karo, warna har machine pe output badal jayega.

---

## 8. Design decisions jo locked hain

1. Canvas 2D, DOM nahi — deterministic export ke liye
2. Frames encode karte jao, memory mein jama mat karo
3. LLM optional — paste-flow default (free forever)
4. Zero backend MVP — static hosting
5. SRT > plain text — timings hi asli quality dete hain
6. Recipe = source of truth, UI usko edit karta hai (bidirectional)

---

# v3 — High-level motion, idea→recipe, voice sync, growth

> v2 ka §1–8 reference hai (workflow, DSL, modules, guardrails). Neeche woh sab
> **supersede** hota hai jahan numbers/phases alag hain.

## 9. v3 ka starting point — kya bana hua hai

| Shipped | File | Note |
| --- | --- | --- |
| Recipe parser (layers, keyframes, procedural grow/count, issues) | `src/engine/parse.ts` | 5 layer kinds, 7 shapes, 21 anims |
| Deterministic renderer + text layout cache + glyph batching | `src/engine/scene.ts` | 33.9 → 2.5 glyph calls/frame |
| Export: WebCodecs H.264 + AAC in one MP4 | `src/engine/export.ts` | 12 s 9:16 720p in 37 s |
| Studio: timeline, drag/trim, inspector, undo/redo, save | `src/App.tsx`, `src/lib/edit.ts` | recipe stays source of truth |
| Playhead outside React (rAF canvas paint) | `src/lib/playhead.tsx` | seek/scrub cheap |
| Prompt v2 (transcript → `[RECIPE]`) | `src/lib/prompt.ts` | LLM optional |
| Playback perf pass | `README.md` §Playback | measured, A/B'd |

**Missing for the reference video:** image layers, masks/clips, theme tokens,
word-level captions, UI-card presets, beat anchors, SFX. Wohi v3 ka kaam hai.

---

## 10. Reference reel ka breakdown — "high-level" ka matlab

File: `Naya D2C brand launch … .mp4` — **85.7 s, 720×1280 (9:16)**, 9 frames
dekhe (1.7 / 8.6 / 17.2 / 27.4 / 38.6 / 49.7 / 60.0 / 70.3 / 79.7 s).

Jo dikha:

- 2D cartoon **characters** (uncle + young man) acting scene ke andar, apni
  illustrations ke saath.
- **Hinglish bottom captions**, ek line, keywords **yellow highlight** ke saath.
- **UI mockup cards**: browser window (URL bar + dots), checklist, star rating
  (`4.8` + review count), avatar cards (influencer row).
- **Chips**: `MONTH 1`, `MONTH 2` — section markers.
- **Flow arrows**: Meta ads → sale / brand.
- Har section ka apna **background tint + diagonal stripe texture**.

Har primitive ko Motiflow ke aaj ke engine se map kiya:

| Primitive | Aaj | Gap | Phase |
| --- | --- | --- | --- |
| Image layer (characters, screenshots, logos) | ❌ `LayerKind` mein `image` nahi | load/decode cache, `fit=contain`, radius, shadow, bob | **P4** |
| Masked/clip reveal (text wipe, transition wipe) | ❌ | `clip=rect` + `reveal=left/right/up` | **P4** |
| Section themes (bg tint + accent per scene) | ⚠️ scene layers hain, tokens nahi | `theme` block, palette tokens | **P4** |
| Browser-window card | ⚠️ `card` generic hai | `preset=browser` (dots + url bar + body) | **P5** |
| Checklist card, star row, avatar row | ⚠️ shapes+text se banta hai, mehnga | 4 presets | **P5** |
| Chips (`MONTH 1`) | ✅ pill + text | preset + auto-pill | **P5** |
| Hinglish caption line | ✅ SRT → timed text | — | — |
| Word-level karaoke highlight | ❌ | per-word timing + fill sweep | **P5** |
| Beat-attached moments (zoom/chip on beat) | ❌ | onset/BPM → `beats[]` → `at=beat:N` | **P7** |
| SFX (pop, whoosh, riser) | ❌ | WebAudio synth, export mein mix | **P7** |
| Full character rig (walk, gesture, lip-sync) | ❌ | **non-goal** (Rive/Spine/AE ka kaam) | — |
| Sprite-sheet idle motion (12-frame loop) | ❌ | `image` + `frames=12 loop=1` | P5 (optional) |
| Grid/paper/grain texture | ❌ | `texture=grain|stripes` | **P4** |

**Honest line:** reel jaisa *layout + caption + card + theme* Motiflow kar
sakta hai. Reel jaisi *character acting* nahi — woh alag tool hai. Is liye plan
"character slots" deta hai (PNG + idle bob + entrance pop), na ke rigging.

---

## 11. "Train the system" = encoded taste, not model training

Model train nahi ho raha (na paisa, na GPU, na API). Jo "training" ho sakti hai
wo teen layers mein hai — aur wohi 80% quality deti hai:

1. **Rules with numbers** — ek `src/lib/taste.ts` (single source) jise parser
   defaults, prompt builder, idea compiler aur review loop — sab padhte hain.
2. **Component library** — presets jo acha default dete hain (card, chip, star
   row, caption, transition), taake user ko numbers yaad na rakhne padein.
3. **Review loop** — app khud frames ka contact sheet banata hai aur checklist
   se apni output critique karta hai (§14).

### 11.1 Locked taste values (v3 defaults)

| Cheez | Value | Kyun |
| --- | --- | --- |
| Entrance ease | `cubic-bezier(0.16, 1, 0.3, 1)` (easeOutExpo-ish) | fast start, soft land |
| Exit ease | `cubic-bezier(0.7, 0, 0.84, 0)` | clean, jaldi gayab |
| Exit point | layer duration ka **70%** | enter/exit overlap na ho |
| Word stagger | **0.09 s** | padhne layak rhythm |
| Char stagger | **0.028 s** | type-on ka asli feel |
| Post-claim hold | **≥ 0.8 s** | number/claim dimaag mein baithta hai |
| Micro-interaction | **120–200 ms** | UI jaisa snappy |
| Layout/transition | **240–400 ms** | screen change samajh aaye |
| Section transition | **0.5–0.7 s** | reel ka "chapter" feel |
| Type scale | `1.25` steps (minor third) | 44 / 56 / 70 / 88 / 110 px @1080 |
| Caption min size | **44 px** @1080 short side, max **2 lines** | phone par readable |
| Safe area | **8%** har taraf (9:16) | reels UI ke neeche na aaye |
| Accent rule | **1 accent per section** | focus |
| Text measure | **≤ 28 chars** per caption line | Hinglish captions chhoti |
| Contrast | body **≥ 4.5:1**, large **≥ 3:1** | A11y + compression |
| Shadow depth | max **1** shadow layer, blur ≤ 24 px, alpha ≤ 0.18 | soft, flat na lage |
| Camera move | ≤ **1.06×** scale over scene | cheap zoom = amateur |
| Sticker/emoji pop | overshoot **1.08** → settle 1.0 in 180 ms | playful |

Yeh numbers **claude-motion** ke `motion-design` skill (MIT) ke rules se liye
gaye hain, aur Motiflow ke canvas timings ke hisaab se tune kiye gaye hain.

### 11.2 Naye easings (deterministic, export-safe)

`easeOutExpo`, `easeOutQuint`, `easeInOutQuart`, `overshoot(1.08)`, `elasticSoft`.
Sab **pure functions** — springs bhi formula se sample honge, `Date.now()` se
nahi, warna export aur preview mismatch karega.

---

## 12. Idea → recipe, bina AI round-trip ke

Masla: user idea bolta hai → AI → website → paste. Teen round trips. v3 mein
**tier 1 default** hai — app khud recipe likhta hai.

### 12.1 Teen tiers

| Tier | Kya | Kab | Cost |
| --- | --- | --- | --- |
| **T1 Idea Compiler** | Hinglish/English idea → seedhi recipe (deterministic) | 80% cases | free, instant, offline |
| **T2 Prompt v3.1** | Wahi idea → behtar prompt → ChatGPT/Claude → `[RECIPE]` paste | jab copy custom chahiye | free (user ka AI) |
| **T3 Local LLM (optional)** | WebLLM/Ollama browser/local mein | power user | free, no key, no server |

T1 hi asli differentiator hai: **koi API call nahi, koi login nahi, 1 second
mein recipe**.

### 12.2 Compiler kaise kaam karega

`src/lib/compiler.ts` — pure function: `compile(idea, opts) => { recipe, notes }`

1. **Intent parse** (regex + keyword scoring, koi ML nahi):
   - duration (`30s`, `60 second`, `1 min`), aspect (`reel`, `9:16`, `yt`, `16:9`)
   - language (`hinglish`, `hindi`, `english`), tone (`funny`, `serious`, `sales`)
   - structure (`3 tips`, `before/after`, `story`, `launch`, `myth`)
   - brand (`brand name`, `color #hex`, `accent`)
2. **Skeleton choose** (7 narrative shapes, §12.3).
3. **Copy split**: user ke idea ke jumle → hook / points / proof / CTA slots.
   Jumla na ho to **safe filler** (declarative, brand-agnostic) — koi lorem nahi.
4. **Timing budget**: duration ko skeleton weights se baanto, `hold ≥ 0.8 s`
   rule, caption max 2 lines, per-word stagger.
5. **Emit recipe** with presets (§11) + `theme` + captions + optional `image`
   slots (`{{char-1}}`, `{{logo}}`) jo user drop kare.
6. **Explain**: `notes[]` — "hook 3.2 s, 4 points, 2 themes, 1 CTA" — taake
   user samjhe kya bana.

Guards: output always parses with **0 errors**; `notes` batata hai kya assume
hua; "Regenerate section" sirf ek block badalta hai (baqi timings shift).

### 12.3 Narrative skeletons (v1 set)

| Skeleton | Structure | Example idea |
| --- | --- | --- |
| `launch` | hook → problem → 3 sawaal → proof → CTA | reference reel ka style |
| `listicle` | hook → 3–5 points (numbered chips) → recap → CTA | "3 mistakes jo D2C brands karte hain" |
| `mythfact` | myth card (red ✗) → fact card (green ✓) → proof | "Cold email mare hue hain — sach?" |
| `beforeafter` | split screen → wipe transition → result card | "Pehle 2% CTR, ab 6%" |
| `origin` | year chips → 3 beats → today card | "2019 mein 1 room se shuru" |
| `tutorial` | steps 1–2–3 → checklist card → CTA | "GTM dashboard 3 steps mein" |
| `compare` | A vs B rows → verdict chip | "Shopify vs custom" |

### 12.4 DSL v2 draft (P4/P5/P7 mein implement)

```text
# theme tokens — ek line, poore section ka look
theme warm bg=#FBF3E7 accent=#E8B23A ink=#1B1710

00:00.15 00:03.30 image "{{char-uncle}}" pos=0.5,0.78 size=0.62 fit=contain bob=0.03
00:00.15 00:03.30 card preset=browser url="yourbrand.com" w=0.78
00:00.40 00:03.10 text "Website ready tha," caption=1 karaoke=1
00:01.20 00:02.10 shape highlight target=2      # marker swipe
00:02.00 00:03.10 icon star count=5 value=4.8 row=1
clip=1 reveal=left                              # mask modifier (any layer)
at=beat:4                                       # beat anchor instead of time
sfx=pop    at=beat:1
sfx=whoosh at=section:2
texture=stripes opacity=0.06
```

Rules: purana syntax **tutti nahi** (backward compatible), naye keys optional,
parser unknown key ko `warn` kare (crash nahi).

### 12.5 Prompt v3.1 (T2)

`src/lib/prompt.ts` mein: (a) naya component vocabulary (image/card presets/
theme/karaoke/sfx/beat), (b) taste numbers table (§11.1) "do not deviate"
ke tor par, (c) **ek hi output block** (`[RECIPE]`) + `[NOTES]` (3 lines),
(d) "agar idea adhoora ho to 3 sab se important assumptions likho, sawal na
poochho". Isse LLM ka output one-shot chalta hai — round trip khatam.

---

## 13. Voice-attached moments (beats, karaoke, SFX)

1. **Audio decode** → `OfflineAudioContext` → mono Float32 @ 22050.
2. **Envelope**: 20 ms windows RMS → smoothing.
3. **Onsets**: energy rise > local mean × 1.6 + min gap 120 ms.
4. **BPM**: onset envelope ka autocorrelation, 70–180 BPM clamp; fallback 120.
5. **`beats[]`** project mein save (IndexedDB, project ke saath).
6. **DSL**: `at=beat:12`, timeline snap toggle (`S`), beat ticks strip.
7. **Auto-captions**: SRT cues → caption layers; word timing = char-count
   proportional within cue, pause-adjusted; karaoke fill usi se.
8. **Emphasis pick**: numbers, `%`, `₹`, brand name, ALL-CAPS → highlight/chip.
9. **SFX**: 8 synth voices (pop, click, tick, whoosh, riser, chime, thud,
   type). Deterministic render → gain staging → **−14 LUFS** target →
   0.3 s limiter → existing AAC path mein mix. Sample files **nahi** (licence
   + size), sab generate hoga.
10. **Ducking**: SFX ke 80 ms around music −6 dB (agar music ho).

Acceptance: 60 s reel par beat markers ±40 ms, karaoke caption audio se
±120 ms, export mein SFX audible, LUFS −14 ±1.

---

## 14. Review loop — app khud apni output check kare

`Contact sheet` button → 12 frames (section starts + strongest beats) →
3×4 grid PNG (canvas se, koi server nahi) + **issue list**:

| Check | Rule |
| --- | --- |
| Safe area | text/image 8% margin ke andar |
| Caption lines | ≤ 2, ≤ 28 chars/line |
| Hold time | claim/number ≥ 0.8 s |
| Collision | do text boxes overlap > 8% area |
| Contrast | body < 4.5:1 → warn |
| Orphan | last word akela line par |
| Timing | layer < 0.4 s → warn (blink) |
| Off-screen | bbox frame se bahar |
| Font load | `document.fonts` ready na ho to export block |

Yeh wohi "review-loop" idea hai jo claude-motion mein agent ke liye hai —
yahan app khud karta hai, deterministic, offline. Bonus: contact sheet
**thumbnail/OG image** ke tor par bhi use hoga (§15).

---

## 15. SEO · GEO · AEO · LLMO

### 15.1 Position (yahi citable facts hain — har page par literal text)

> Motiflow is a **free, browser-only motion-graphics studio**. No sign-up, no
> watermark, audio included in the MP4, no length limit. You write a text
> recipe (or paste an SRT + prompt), and it renders a real MP4 in your browser.

Har claim **verify ho sake** — "free" ka matlab $0, "no login" ka matlab koi
account screen nahi, "no watermark" ka matlab output par logo nahi.

### 15.2 Pages (static HTML — SPA ke andar nahi)

| Route | Type | Target query |
| --- | --- | --- |
| `/` | app + 300-word intro (SSR-less, static shell) | motiflow, motion graphics tool |
| `/how-it-works` | HowTo + screenshots | how to make motion graphics from srt |
| `/prompt` | tool + explainer | motion graphics prompt generator |
| `/templates/<niche>` | 8 pages (d2c, saas, real estate, coaching, fitness, finance, education, local) | free <niche> reel maker |
| `/vs/logicut` | comparison table | free logicut alternative |
| `/vs/canva` `/vs/capcut` `/vs/after-effects` | comparison | canva alternative no watermark |
| `/glossary/<term>` | 20 terms (recipe, beat sync, karaoke caption, safe area…) | what is beat sync |
| `/docs/dsl` | full DSL reference | motiflow dsl |
| `/changelog` | dated releases | — |
| `/facts` | one table: specs, limits, licence, perf numbers | citable stats |

### 15.3 File-level deliverables (P9)

```text
public/robots.txt          # allow GPTBot, ClaudeBot, PerplexityBot, Google-Extended;
                           # disallow /app only
public/llms.txt            # name, one-liner, page list with 1-line descriptions
public/llms-full.txt       # DSL spec + feature matrix + FAQ, plain markdown
public/sitemap.xml         # generated by scripts/site.mjs
public/og/*.png            # 1200×630 per page (contact sheet renderer se)
scripts/site.mjs           # templates -> dist/*.html (no framework, no server)
```

`index.html` mein JSON-LD (3 blocks): `SoftwareApplication` (`price: 0`,
`applicationCategory: MultimediaApplication`, `operatingSystem: Web`),
`FAQPage` (6 sawal), `Organization` + `sameAs` (GitHub, X). Har marketing page
par `BreadcrumbList` + `dateModified`.

### 15.4 AEO (answer engines: featured snippet, Perplexity, AI Overviews)

- Har page ka pehla paragraph = **40–60 word direct answer**, phir detail.
- `H2` sawal ki shakl mein ("Kya Motiflow free hai?"), jawab pehli line mein.
- Har feature claim ke saath **number** ("12 s 9:16 720p export in 37 s on
  M-series / 1440×900 Chrome").
- Tables > prose (models extract tables cleanly).
- **HowTo** schema on `/how-it-works` (3 steps: transcript → prompt → export).
- Koi marketing fluff nahi: "revolutionary", "unleash" — ban.

### 15.5 GEO (generative engines: ChatGPT, Claude, Gemini, Copilot)

- **Entity consistency**: naam `Motiflow`, tagline `Write motion.`, one-liner
  (upar), URL `motiflow.app` — site, GitHub, README, X bio, Product Hunt,
  YouTube description: sab identical.
- **`llms.txt` + `llms-full.txt`** (spec-compliant) — models ko seedha
  feature matrix mile.
- **Machine-readable feature table** (`/facts` + README): Free, No login,
  No watermark, Audio in MP4, No length limit, Browser-only, Offline-capable,
  MIT, No API key required.
- **Comparison pages** with honest rows (jo hum nahi kar sakte — character
  rigging — woh bhi likho; trust isi se banta hai).
- **Third-party mentions**: GitHub repo (README + topics), Product Hunt,
  Reddit (r/VideoEditing, r/SideProject, r/editors — value-first posts),
  Hacker News "Show HN", dev.to write-up, YouTube demo. Models inhi se seekhte
  hain.
- **Citable original data**: apne perf numbers publish karo (`/facts`),
  "browser-only motion graphics benchmark 2026". Original numbers = citations.

### 15.6 LLMO (LLM-friendly docs)

- Terminology lock: **recipe, layer, beat, theme, preset, section** — har
  jagah same shabd (synonyms model ko confuse karte hain).
- Docs plain markdown mein bhi (`/docs/dsl.md`), HTML ke saath.
- Har doc page ke top par **TL;DR (3 bullets)**.
- Versioned changelog — models "latest" samajh sakein.
- `llms-full.txt` mein poora DSL + 6 ready recipes (copy-paste examples).

### 15.7 Keyword clusters

| Cluster | Queries | Page |
| --- | --- | --- |
| Core | free motion graphics tool, browser motion graphics, text to video free | `/` |
| Competitor | free logicut alternative, canva alternative no watermark, capcut alternative no login | `/vs/*` |
| Workflow | srt to motion graphics, hinglish captions generator, transcript to video free | `/how-it-works`, `/prompt` |
| Niche | d2c reel maker free, saas launch video free, real estate reel captions | `/templates/*` |
| Concept | what is beat sync, karaoke captions meaning, safe area for reels | `/glossary/*` |
| Dev | motion graphics dsl, canvas motion graphics open source | `/docs/dsl`, GitHub |

### 15.8 Measurement (sab free)

- Google Search Console + Bing Webmaster (sitemap submit).
- **Cloudflare Web Analytics** (free, cookie-less) — no consent banner needed.
- Monthly **AI visibility set**: 10 fixed prompts ("free logicut alternative",
  "browser motion graphics no login", "srt to video tool free") → 4 engines →
  note karo Motiflow mention hua ya nahi. Table in `docs/ai-visibility.md`.
- GitHub: stars/issues/referrers; UTM on every outbound link.

### 15.9 30-day content cadence

Hafta 1: `/`, `/how-it-works`, `/facts`, `llms.txt`, `robots.txt`, sitemap,
JSON-LD. Hafta 2: 3 `/vs/*` + 4 `/templates/*`. Hafta 3: 10 `/glossary/*` +
`/docs/dsl`. Hafta 4: show HN + Product Hunt + 3 Reddit posts + 2 YouTube
demos (dogfooding: Motiflow se hi bane). Har page publish par `dateModified`.

---

## 16. Phases (v3)

| Phase | Scope | Effort | Acceptance |
| --- | --- | --- | --- |
| **P4 Motion core** | `image` layer, `clip`/`reveal`, `theme` tokens, `texture`, 5 easings, `taste.ts` defaults | 5–7 din | reference-style scene 9:16 mein bane; export pixel-stable; old recipes 0 errors |
| **P5 Explainer pack** | card presets (browser/checklist/star/avatar), chip, karaoke captions, sprite idle, 4 section transitions | 5–7 din | 3 templates (launch/myth/compare) 45 s mein, sirf presets se |
| **P6 Idea compiler** | `compiler.ts`, 7 skeletons, notes, regenerate-section, prompt v3.1 | 4–6 din | 20 test ideas → 20 valid recipes, 0 parser errors, < 50 ms |
| **P7 Voice + SFX** | beats/onsets/BPM, beat anchors + snap, auto-captions, 8 SFX, LUFS mix | 5–7 din | ±40 ms beats, export mein audio, −14 LUFS ±1 |
| **P8 Review loop** | contact sheet PNG, 9 checks, issue panel, OG image export | 2–3 din | 12-frame sheet < 1.5 s; 9 checks fire on seeded bugs |
| **P9 Growth** | static pages + schema + llms.txt + sitemap + OG, deploy | 3–4 din | Lighthouse SEO 100, 0 console errors, `llms.txt` valid, 20 indexable URLs |

**Order:** P4 → P5 → P6 → P7 → P8 → P9. P8/P9 P6 ke baad parallel ho sakte
hain. P4 ke bina P5 ka koi matlab nahi (images/masks ke bagair card bhi
adhoore lagte hain).

---

## 17. Non-goals (likh ke rakhna zaroori hai)

1. **Character rigging / lip-sync** — Rive ya AE ka kaam. Hum image + idle bob
   + sprite sheet dete hain, bas.
2. **Cloud render / server queue** — browser hi renderer hai.
3. **Login, teams, comments, cloud sync** — project local rehta hai.
4. **Paid API / subscription** — koi tier nahi, sab kuch free.
5. **Auto-transcription (Whisper)** — transcript user deta hai (SRT/VTT/plain).
6. **Video layer (mp4 in mp4)** — P9 ke baad bhi nahi, jab tak perf budget
   prove na ho (decode + WebCodecs overlap mehnga hai).

**Risks:** DSL bloat (naam lambi list) → presets se chhupao; image decode
memory (1080p par max 12 images, LRU cache); mobile Safari WebCodecs support
(export fallback: WebM ya "desktop par export karo" ka honest message).

---

## 18. Credits / licences

- **claude-motion** (whaleyxbt, MIT) — motion rules with numbers, review-loop
  concept, beat-detection approach, SFX synth concept. Code copy nahi; rules
  adapt kiye. README + footer mein attribution: "Motion rules informed by
  claude-motion (MIT)".
- **mp4-muxer** (MIT), **React** (MIT), **Vite** (MIT), fonts **OFL** only.
- **Motiflow** — MIT (`LICENSE`, 2026 Zain Ansari).
- LogiCut se koi prompt/UI/code copy nahi (v2 §7 wahi rehta hai).
