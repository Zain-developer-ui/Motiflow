# Motiflow

**Write motion.**

A motion-graphics studio that runs entirely in your browser. You write (or paste) a
short text recipe, Motiflow renders it live, and you export a clean MP4 — no watermark,
no length cap, no account, no server bill.

![Motiflow studio](docs/studio.png)

---

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The sample recipe loads automatically.

```bash
npm run build     # typecheck + production bundle into dist/
npm run preview   # serve the production build
```

The build is a static site — drop `dist/` on any free static host (Cloudflare Pages,
GitHub Pages, Netlify) and it works.

---

## What it does

| | |
| --- | --- |
| Renderer | HTML canvas 2D, 12 element types, keyframes, procedural motion, camera |
| Export | H.264 MP4 + AAC audio, 16:9 or 9:16, 720p or 1080p, 30 or 60 fps |
| Cost | zero — encoding happens on the user's machine via WebCodecs |
| Length | unlimited; frames are encoded incrementally, never buffered |
| Watermark | none |
| Accounts | none; nothing leaves the browser |

Assets: Motiflow does not generate images. You paste the image prompt it gives you into
any image model, then keep the prompt in your notes — the recipe only positions and
animates what you describe.

---

## The loop

1. **Prompt** — paste a transcript, or drop an `.srt` / `.vtt` and keep its real timings.
   Pick an edit style (**Punch**, **Studio**, **Ink**, **Signal**, **Hook**), type the
   voiceover length, and press **Build prompt**.
2. **Copy** the prompt into ChatGPT, Claude or any model you already use.
3. **Recipe** — paste the `[RECIPE]` block back. It renders immediately.
4. **Edit** — drag anything on the canvas, resize from the corners, retype the words,
   restack, then export.

No API key and no account: the model is whichever chat window you already have open.

The prompt is written like a specification rather than a wish: it fixes the canonical frame
and the unit rule, lists every element and property the renderer actually understands, gives
the timing vocabulary (BUMP, SLAM, NUDGE, BURST, DRAW, STEP), a safe-area table, one full
worked example of the output format, and a final checklist. Without a duration it replies
with `NEED_DURATION` instead of guessing — so the model asks once, you answer with a number,
and every further reply is a complete `[RECIPE]` block with no commentary.

---

## Recipe format

A recipe is a list of timed lines.

```
start --> end <type> [subtype] "text" key=value key=value …
```

- **Time** is `MM:SS.hh` (hundredths of a second).
- **Text** must be wrapped in double quotes and can contain spaces.
- **Comments** start with `#` at the beginning of a line or after a space.
- An optional `v1` line and `[RECIPE] … [/RECIPE]` wrapper are accepted, so a model's
  raw output can be pasted without editing.

```txt
v1
00:00.00 --> 00:12.00 scene bg=#0B0F14 grid=rgba(255,255,255,0.05) vignette=0.55
00:00.15 --> 00:03.30 text "Write motion." pos=0.5,0.40 size=112 weight=800 in=charIn inDur=0.75 out=blurOut
```

### Element types

| Type | Subtype | Draws |
| --- | --- | --- |
| `scene` | — | background fill, grid, accent wash, vignette |
| `text` | — | wrapped text with per-character, per-word or block animation |
| `card` | — | rounded surface with gradient, border and soft shadow |
| `shape` | `rect` `circle` `pill` `ring` `line` `check` `arrow` | geometry |
| `camera` | — | zoom / pan applied to every layer while active |

### Sizing rule

Two units, no suffix:

- **`0 … 1`** — a fraction of the canvas **width** (`w=0.86` → 86 % wide, `pos=0.5,0.4`
  → centred horizontally, 40 % down). `w=1.5` deliberately runs past both edges, which is
  how a background bleeds.
- **`> 1`** — pixels authored against the **short side of a 1080 frame** and scaled by
  `min(W, H) / 1080`. `size=112` is 112 px at 1080p, 75 px at 720p, and the same optical
  size on a 9:16 phone as on a 16:9 screen.

That keeps a recipe's composition identical across 720p / 1080p and landscape / portrait.

### Common properties

| Key | Meaning | Default |
| --- | --- | --- |
| `pos=x,y` | centre point, normalised | `0.5,0.5` |
| `z=` | draw order, higher is in front | `0` |
| `w=` `h=` | width / height; for text, `w` is the wrap **and** alignment box | per type |
| `size=` `weight=` `font=` | font size, weight, family (`display` `sans` `mono` `deva`) | `106`, `700`, `sans` |
| `align=` | `left` `center` `right` inside `w` | `center` |
| `anchor=` | `left` `right` `top` `bottom` — `pos` means that edge (shapes only) | centre |
| `color=` | solid colour | white |
| `grad=` `gradr=` | linear (top → bottom) / radial two-stop gradient | — |
| `radius=` | corner radius | `0` |
| `stroke=` `strokeColor=` | outline width and colour | `0` |
| `thick=` | ring / check / arrow thickness | derived from width |
| `shadow=` `glow=` | `0 … 1` softness of the drop shadow / glow | `0` |
| `d=` | camera depth `0 … 1` — `0` pins the layer to the frame, `1` follows fully | `1` |
| `emph=` | looping emphasis, `pulse` or `shake`, for the layer's whole life | — |
| `in=` `inDur=` | entrance animation and its duration | `none`, `0.4` |
| `out=` `outDur=` | exit animation and its duration | `none`, `0.3` |
| `id=` | stable name, so another layer can `follow` it | auto |
| `follow=` | `id,edge,offset` — pins this layer to another layer's edge | — |

### Keyframes

```txt
keys=scale:0.50=0.5,0.69=1.12;opacity:0.50=0,0.60=1
```

`prop:time=value,time=value` pairs, separated by `;` for each property. Add `~l` after a
value (`0.69=1.12~l`) to make the segment leading into that keyframe linear; otherwise it
eases in and out. Works with `x`, `y`, `scale`, `opacity`, `rot`.

### Procedural motion

```txt
growTo=w,560,900,1.65,2.40     # animate width 560 → 900 between 1.65s and 2.40s
count=0,2,19.80,20.60          # count a text layer 0 → 2 between 19.80s and 20.60s
count=0,12,9.40,10.20,%        # anything else is appended literally
count=0,3,8.10,8.70,pct        # 3%     inr → ₹4,02,000   group → 402,000
                               # lakh → 4.02L               x → 2x
```

`growTo` on an `anchor=bottom` rect grows a bar up from its base; on an `anchor=left`
line or arrow it draws out of its tail. No keyframes needed.

```txt
00:07.10 --> 00:10.00 shape rect id=barA pos=0.62,0.84 w=0.08 h=0.36 anchor=bottom growTo=h,0.02,0.36,7.10,7.90
00:08.55 --> 00:10.00 text "0" follow=barA,top,-48 count=0,3,8.55,9.05,pct
```

### Animations

Entrance: `fadeUp` `riseIn` `slideL` `slideR` `slideU` `slideD` `scaleIn` `popIn`
`zoomIn` `blurIn` · text only: `charIn` `typeOn` `wordIn` `charFade` · `none`

Exit: `fadeOut` `blurOut` `scaleDown` `popOut` `zoomOut` `slideOutL` `slideOutR` · `none`

Emphasis: `emph=pulse` / `emph=shake` loops for the layer's whole life.

`charIn`, `typeOn`, `wordIn` and `charFade` animate text glyph by glyph; the others treat
the layer as one block.

### Camera

```txt
00:00.00 --> 00:03.40 camera x=0.5 y=0.5 zoom=1.06
00:03.40 --> 00:12.00 camera x=0.5 y=0.5 zoom=1
```

`x`/`y` are the point the camera looks at; `zoom` scales around it. Camera keyframes work
the same way as layer keyframes.

`d=` decides how much of that move each layer feels: background shapes at `d=0.1–0.25`
drift slower than foreground type at `d=1`. That difference is the parallax.

---

## Editing on the canvas

The preview is not a picture of the recipe — it *is* the recipe. Click any layer to select
it; the selection frame is drawn in the same coordinates the renderer uses, so what you
grab is what moves.

| Action | Effect on the recipe |
| --- | --- |
| Drag a layer | rewrites `pos=` |
| Drag a corner handle | text: `size=` · card/shape: `w=` and `h=` (proportionally) |
| Type in the text field | replaces the quoted string |
| Stack ↑ / ↓ | rewrites `z=`, one neighbour at a time |
| Delete layer | asks once, then removes the line |
| Arrow keys | nudge `pos=` by 0.002 per press (Shift: 0.02) |

Every edit is a rewrite of the source, so the code panel always shows exactly what is on
screen — there is no second copy of the truth to drift. When a layer's position is driven
by `keys=x:…`, dragging it would be a lie, so the inspector says so instead of silently
doing nothing.

---

## Export

Hit **Export MP4**. Motiflow draws every frame into an offscreen canvas, feeds it to the
browser's hardware H.264 encoder, and muxes the result as it goes. Memory use stays flat,
so a three-minute export is no different from a three-second one.

- **Audio** — attach any file the browser can decode (WAV, MP3, M4A, OGG, FLAC). It is
  resampled to 48 kHz stereo and encoded as AAC alongside the video. Audio is trimmed to
  the video length; if it is shorter, the tail is simply silent. If the browser cannot
  encode AAC, the export still succeeds but says so instead of quietly shipping a silent
  file.
- **Formats** — `avc1` High / Main / Baseline are tried in that order, so an older machine
  still gets a valid file.
- **Filename** — `motiflow-<timestamp>.mp4`.

Browsers without WebCodecs (Firefox today) still preview perfectly; the export button
disables itself with an explanation.

Motiflow is desktop-first. On a phone the stage, transport and timeline still work, but
the recipe editor is hidden — editing a recipe needs a keyboard.

---

## Project layout

```
src/
  App.tsx               studio shell: workspace tabs, canvas editing, layers, timeline, export
  components/
    PromptPanel.tsx     transcript / .srt → prompt builder
  lib/
    prompt.ts           style presets, .srt parsing, prompt template
    edit.ts             canvas edits → recipe source rewrites
  sample.ts             the 12-second demo recipe
  styles.css            design tokens + layout
  engine/
    parse.ts            recipe → layer model, with line-numbered diagnostics
    scene.ts            canvas renderer: text layout, shapes, camera, animation, hit testing
    export.ts           WebCodecs H.264 + AAC → MP4
    easing.ts           easing curves and keyframe evaluation
    paint.ts            colour / gradient helpers
    types.ts            shared types
scripts/
  inspect-mp4.mjs       prints tracks, samples and durations of an MP4
  make-test-audio.mjs   generates a 12 s test WAV
docs/
  example-transcript.srt  a four-cue fixture for the prompt builder
```

---

## Roadmap

- **Shipped** — recipe engine, 16:9 / 9:16 export with audio, prompt builder, canvas
  editing (drag, resize, retype, restack, delete), autosave.
- **Next — undo/redo.** Canvas edits rewrite the source in place; a history stack is the
  missing safety net.
- **Next — project files.** Autosave keeps one draft in `localStorage`; import/export of
  `.motiflow` files (and a few named projects) is the next step.
- **Later — keyframe inspector.** Edit timing and easing per property in the UI instead of
  by hand in the recipe.

---

## Notes

- `mp4-muxer` still works but is deprecated upstream in favour of
  [Mediabunny](https://mediabunny.dev). The muxing boundary lives in
  `src/engine/export.ts`, so switching is a contained change.
- Work is autosaved in this browser: the recipe and frame settings under
  `motiflow.project.v1`, the prompt draft under `motiflow.prompt.v1`. Clearing site data
  clears it, and nothing is ever uploaded.
- Fonts come from Google Fonts (`Fraunces`, `Manrope`, `JetBrains Mono`,
  `Noto Sans Devanagari`). Self-host them before shipping if you want zero third-party
  requests.
- Everything is client-side on purpose: no backend means no hosting cost and no upload of
  anyone's media.
