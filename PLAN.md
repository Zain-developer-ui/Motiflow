# Motion Graphics Studio — Plan v2

> Status: **plan only** — koi code nahi.
> Date: 2026-10-22
> Budget: **free** · Target: **production ready**

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
