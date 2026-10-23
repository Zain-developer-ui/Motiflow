# Brand & Design System — v1

> Product: script-to-motion-graphics video studio
> Status: proposal — final aap ki approval ke baad lock hoga

---

## 1. Naam

### Recommendation: **Motiflow**

**Kyun:**
- **Motif** = design ka repeating element (motion graphics ka core building block)
- **Flow** = motion ka ehsaas — smooth, soft, continuous
- 8 letters, 3 syllables, do hi tarah se bola ja sakta hai — confusion nahi
- "Professional + soft" brief ke saath perfectly match
- Typo-proof, spell karne mein aasan, verbally batane mein aasan

**Tagline:** `Write motion.`

Do lafz. Product ka poora idea. Koi hype nahi.

**Domains (verified from registry, aaj):**
| Domain | Status |
| --- | --- |
| `motiflow.app` | ✅ FREE |
| `motiflow.studio` | ✅ FREE |
| `motiflow.com` | ❌ taken |

### Alternatives (agar Motiflow pasand na aaye)

| Naam | Matlab | Domain | Kab chuno |
| --- | --- | --- | --- |
| **Motionwright** | "wright" = craftsman (playwright, shipwright) | `.app` ✅ · `.studio` ✅ | Zyada serious/tool-jaisa chahiye |
| **Motifcut** | motif + cut | `.com` ✅ `.app` ✅ `.studio` ✅ | `.com` zaroori ho |
| **Reelmotif** | reel + motif | `.com` ✅ | Instagram-first feel |

> `.com` space saturated hai — har single dictionary word 2026 tak bik chuka hai.
> `.app` modern video tools ka norm hai (Figma, Linear, Vercel sab `.com`/`.app` mix).
> `.com` ke peeche na bhaago — brand value naam se aati hai, TLD se nahi.

### Reject kiye gaye
- **Motely** — "motley" ki galat spelling lagti hai
- **Kinemora / Scenora / Reelora** — "-ora" suffix AI-generated lagta hai
- **Cadenza / Timbre / Lilt / Bezier** — sab domains taken + thore pretentious

### Legal check
- "Motiflow" par koi famous trademark nahi mila (motion/video category mein)
- Ship karte waqt: **Motiflow**, not "LogiCut alternative" — comparison marketing
  mein legal risk hai

---

## 2. Logo direction

**Wordmark-first** — symbol baad mein, agar zaroorat pade.

- Type: **Fraunces** (variable serif), weight 600, optical size low, tracking `-0.02em`
- Wordmark: `Motiflow` — capital M, baqi lowercase (soft, approachable)
- Optional monogram: `m` — ek chhota dot jo "playhead" ban jaye (subtle motion cue)
- Koi gradient, koi glow, koi 3D bevel nahi

**Logo files jo banenge:** SVG (wordmark), SVG (monogram), favicon 32/180/512,
OG image 1200×630.

---

## 3. Design direction — "Quiet Studio"

**Mood:** Linear ki precision + ek warm paper texture. Editorial calm, tool ki
tezi. Na brutalist, na glassmorphism, na neon, na "AI purple gradient".

**Ek line:** *Ek shaant studio jahan type hilti hai.*

### Typography

| Role | Font | Kyun |
| --- | --- | --- |
| Display / marketing | **Fraunces** (OFL, variable) | Soft optical serif — editorial warmth, AI-slop se door |
| UI / body | **Manrope** (OFL, variable) | Geometric-soft, chhote size pe saaf, friendly terminals |
| Code / recipe view | **JetBrains Mono** (OFL) | Ligatures, 0/O aur 1/l clear |

```
--font-display: "Fraunces", Georgia, serif;
--font-ui: "Manrope", system-ui, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, monospace;
```

Scale (fluid, `clamp`):
```
--text-xs:   12px / 1.5
--text-sm:   13px / 1.5
--text-base: 15px / 1.6
--text-lg:   18px / 1.5
--text-xl:   24px / 1.3
--text-2xl:  32px / 1.2
--text-3xl:  clamp(40px, 5vw, 56px) / 1.05
--text-4xl:  clamp(56px, 8vw, 88px) / 0.98
```

### Colour — light (default for marketing)

```
--bg:        #FBFAF8   /* warm paper */
--surface:   #FFFFFF
--surface-2: #F4F2EE
--ink:       #191713
--ink-muted: #6E6A63
--line:      #E6E2DB
--accent:    #5A63C4   /* soft indigo */
--accent-2:  #EDE7DC   /* warm sand tint */
--success:   #2F7E5E
--danger:    #B4483C
```

### Colour — dark (default for the studio)

```
--bg:        #0F1012
--surface:   #17181B
--surface-2: #1E2024
--ink:       #F4F2EE
--ink-muted: #9A968E
--line:      #26282D
--accent:    #8B93F8
```

**Rules:**
- Ek accent. Bas. Accent sirf primary action + active state pe.
- Contrast: body 4.5:1 min, large text/UI borders 3:1 min — dono themes mein test.
- koi gradient background nahi. Koi glow. Koi drop-shadow > 12px blur.

### Space (4/8 scale)
```
4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96
```
Section padding desktop `96px`, mobile `56px`. Group ke andar `16–24px`.

### Radius
```
--r-sm: 8px    /* inputs, buttons */
--r-md: 12px   /* panels */
--r-lg: 16px   /* cards, modals */
--r-full: 999px
```

### Elevation (two-layer, very soft)
```
--shadow-1: 0 1px 2px rgba(25,23,19,.04), 0 2px 8px -4px rgba(25,23,19,.08);
--shadow-2: 0 1px 2px rgba(25,23,19,.04), 0 8px 24px -12px rgba(25,23,19,.14);
```

### Motion
```
--dur-1: 120ms   /* hover, focus */
--dur-2: 180ms   /* popover, tooltip */
--dur-3: 260ms   /* panel, drawer */
--dur-4: 400ms   /* route change */
--ease:  cubic-bezier(.2,.7,.3,1);
```
- Enter = ease-out · Exit = ease-in · Layout = ease-in-out
- `prefers-reduced-motion: reduce` → sab `0.01ms`
- Sirf `transform` / `opacity` animate karo — layout properties kabhi nahi

### App shell layout
```
┌──────────────────────────────────────────────────────┐
│ topbar 48px — logo · project name · export           │
├──────────┬───────────────────────────┬───────────────┤
│ left     │ canvas (checkerboard bg)  │ right         │
│ 240px    │ fluid                     │ 320px         │
│ assets / │ preview quality · fit     │ 3D Cam / Code │
│ layers   │                           │ inspector     │
├──────────┴───────────────────────────┴───────────────┤
│ timeline 220px — ruler · camera row · layer rows     │
├──────────────────────────────────────────────────────┤
│ bottom bar 56px — add text/shape/image/video/audio   │
└──────────────────────────────────────────────────────┘
```

Breakpoints: `360 · 390 · 768 · 1024 · 1440 · 1920`
Min supported: **1024px** for studio (mobile pe "open on desktop" screen —
timeline mobile pe usable nahi hota). Marketing page mobile-first.

### Component rules
- **Buttons:** 3 variants — primary (accent fill), secondary (1px line), ghost.
  Height 32 (sm) / 36 (md) / 44 (lg). Focus ring: `0 0 0 3px accent/25%`.
- **Inputs:** 36px tall, `--surface-2` bg, 1px `--line`, focus accent border.
- **Timeline rows:** 28px tall, hover `--surface-2`, selected accent 12% tint +
  2px left accent bar.
- **Panels:** no borders + shadows together — pick one. Panels use `--line`.
- **Empty states:** icon + 1 line + 1 action. Koi "No data found" nahi.

### Voice
- Chhote, seedhe jumle. "Paste your recipe" not "Input your recipe content here"
- Koi exclamation mark nahi. Koi "supercharge", "unleash", "revolutionary"
- Error messages batate hain **kya karna hai**, sirf kya galat hua nahi
  → `Line 12: unknown property "growTo" — did you mean "growTo=w,..."?`
- Button label = jo hoga: `Export MP4`, `Get prompt`, `Preview`

---

## 4. Naming inside the product

Consistent vocabulary (UI + docs + code):

| Cheez | Naam | Kabhi nahi |
| --- | --- | --- |
| The AI script | **Recipe** | "code", "script", "program" |
| Generated images | **Assets** | "media", "files" |
| The AI handoff text | **Prompt** | "prompt file", "handoff" |
| Editing area | **Studio** | "editor", "workspace" |
| Animation list | **Motion** | "effects", "transitions" |
| Timeline rows | **Layers** | "tracks", "items" |
| Export | **Export** | "render", "download video" |

> "Render" sirf internal/technical mein. User-facing = Export.
