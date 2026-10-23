import { clamp01, easeOutBack, easeOutCubic, evalKeys, lerp, progressBetween } from './easing';
import { fillFor, firstColor, splitTopLevel } from './paint';
import type { Layer, Recipe } from './types';

const FAMILIES: Record<string, string> = {
  display: '"Fraunces", Georgia, serif',
  sans: '"Manrope", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
  deva: '"Noto Sans Devanagari", "Nirmala UI", "Manrope", system-ui, sans-serif',
};

export interface SceneSize {
  width: number;
  height: number;
}

/**
 * Pixel values are authored against the SHORT side of a 1080 frame, so a
 * 96 px headline is 96 px on a 1080×1920 phone and on a 1920×1080 landscape
 * frame. Fractions (0…1) are always against the frame width.
 */
const REFERENCE_SHORT_SIDE = 1080;

const isTransparent = (value: string): boolean => {
  const v = value.replace(/\s+/g, '');
  return v === 'transparent' || v === 'none' || /,0\)$/.test(v) || v === '#00000000' || v === 'rgba(0,0,0,0)';
};

function roundRectPath(ctx: CanvasRenderingContext2D, w: number, h: number, radius: number) {
  const r = Math.max(0, Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(-w / 2, -h / 2, w, h, r);
    return;
  }
  const x = -w / 2;
  const y = -h / 2;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

interface Glyph {
  ch: string;
  index: number;
  word: number;
}

interface Line {
  glyphs: Glyph[];
  width: number;
}

/** Scripts that shape: drawing them character by character breaks the joins. */
const SHAPING_SCRIPT = /[\u0900-\u0D7F\u0E00-\u0E7F\u1000-\u109F]/;

/**
 * Wraps text into lines, respecting hard `\n` breaks.
 *
 * Latin text is cut into glyphs so `charIn` can reveal it letter by letter.
 * Devanagari (and other shaping scripts) is cut into words instead: a matra or
 * a conjunct only renders correctly when the whole word is drawn at once.
 */
function layoutText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): { lines: Line[]; total: number; words: number } {
  const spaceWidth = ctx.measureText(' ').width;
  const perWord = SHAPING_SCRIPT.test(text);
  const lines: Line[] = [];
  let index = 0;
  let wordCount = 0;

  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      lines.push({ glyphs: [], width: 0 });
      continue;
    }

    let current: Glyph[] = [];
    let currentWidth = 0;

    for (const word of paragraph.split(' ')) {
      if (!word) continue;
      const wordWidth = ctx.measureText(word).width;
      const projected = current.length === 0 ? wordWidth : currentWidth + spaceWidth + wordWidth;
      if (projected > maxWidth && current.length > 0) {
        lines.push({ glyphs: current, width: currentWidth });
        current = [];
        currentWidth = 0;
      }
      if (current.length > 0) {
        current.push({ ch: ' ', index: index++, word: wordCount });
        currentWidth += spaceWidth;
      }
      if (perWord) {
        current.push({ ch: word, index: index++, word: wordCount });
        currentWidth += wordWidth;
      } else {
        for (const ch of word) {
          current.push({ ch, index: index++, word: wordCount });
          currentWidth += ctx.measureText(ch).width;
        }
      }
      wordCount++;
    }

    if (current.length > 0) lines.push({ glyphs: current, width: currentWidth });
  }

  return { lines, total: Math.max(1, index), words: Math.max(1, wordCount) };
}

function charProgress(elapsed: number, i: number, total: number, inDur: number): number {
  const dur = Math.max(0.09, inDur * 0.45);
  const span = Math.max(0, inDur - dur);
  const startAt = total > 1 ? (i / (total - 1)) * span : 0;
  return clamp01((elapsed - startAt) / dur);
}

function wordProgress(elapsed: number, word: number, total: number, inDur: number): number {
  const dur = Math.max(0.12, inDur * 0.55);
  const span = Math.max(0, inDur - dur);
  const startAt = total > 1 ? (word / (total - 1)) * span : 0;
  return clamp01((elapsed - startAt) / dur);
}

export function createScene(recipe: Recipe, size: SceneSize) {
  const W = size.width;
  const H = size.height;
  const scaleUnit = Math.min(W, H) / REFERENCE_SHORT_SIDE;

  /**
   * Resolution-independent sizing.
   * - 0…1 is a fraction of the given span (the frame width for `w`).
   * - Anything larger is a pixel value authored at a 1080 short side, so 720p,
   *   1080p and 9:16 renders keep the same optical size.
   */
  const dim = (value: number | undefined, span: number, fallback: number): number => {
    if (value === undefined || !Number.isFinite(value)) return fallback;
    if (Math.abs(value) <= 1) return value * span;
    return value * scaleUnit;
  };

  // Used for text measurement and hit testing, never drawn to.
  const measureCtx = document.createElement('canvas').getContext('2d');

  function drawScene(ctx: CanvasRenderingContext2D, layer: Layer) {
    ctx.fillStyle = layer.props.bg ?? '#0B0F14';
    ctx.fillRect(0, 0, W, H);

    const grid = layer.props.grid;
    if (grid && !isTransparent(grid)) {
      const step = Math.max(32, Math.round(W / 24));
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= W; x += step) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, H);
      }
      for (let y = 0; y <= H; y += step) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(W, y + 0.5);
      }
      ctx.stroke();
    }

    const accent = layer.props.accent;
    if (accent && !isTransparent(accent)) {
      const g = ctx.createRadialGradient(W * 0.5, H * 0.2, 0, W * 0.5, H * 0.2, Math.max(W, H) * 0.7);
      g.addColorStop(0, accent);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    const vignette = layer.nums.vignette;
    if (vignette > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.18, W / 2, H / 2, Math.max(W, H) * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${Math.min(1, vignette)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function fontFor(layer: Layer) {
    const sizePx = dim(layer.nums.size, W, Math.round(Math.min(W, H) * 0.098));
    const weight = layer.nums.weight ?? 700;
    const family = FAMILIES[layer.props.font?.toLowerCase()] ?? FAMILIES.sans;
    return { sizePx, css: `${weight} ${sizePx}px ${family}` };
  }

  const groupDigits = (value: number, indian: boolean): string => {
    const digits = String(Math.abs(Math.round(value)));
    if (digits.length <= 3) return digits;
    if (!indian) return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    // 12,34,567 — the last three digits, then pairs.
    const tail = digits.slice(-3);
    const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return `${head},${tail}`;
  };

  /** The literal string a text layer shows at time t (respects `count=`). */
  function textContent(layer: Layer, t: number): string {
    if (!layer.count) return layer.text;
    const p = progressBetween(t, layer.count.start, layer.count.end);
    const v = lerp(layer.count.from, layer.count.to, easeOutCubic(p));
    const isInt = Number.isInteger(layer.count.to) && Number.isInteger(layer.count.from);
    const plain = isInt ? String(Math.round(v)) : v.toFixed(1);
    const fmt = layer.count.suffix?.trim();
    if (!fmt) return plain;

    switch (fmt.toLowerCase()) {
      case 'pct':
        return `${Math.round(v)}%`;
      case 'x':
        return `${isInt ? Math.round(v) : v.toFixed(1)}x`;
      case 'group':
        return groupDigits(v, false);
      case 'inr':
        return `₹${groupDigits(v, true)}`;
      case 'lakh':
        return `${(v / 100000).toFixed(2)}L`;
      default:
        return plain + fmt;
    }
  }

  /** Measured text box: the wrap width, the widest line, and the block height. */
  function textMetrics(layer: Layer, t: number) {
    const { sizePx, css } = fontFor(layer);
    const maxWidth = dim(layer.nums.w, W, W * 0.8);
    if (!measureCtx) return { sizePx, css, maxWidth, lineWidth: maxWidth, height: sizePx * 1.16 };
    measureCtx.font = css;
    const { lines } = layoutText(measureCtx, textContent(layer, t), maxWidth);
    const lineWidth = lines.reduce((max, line) => Math.max(max, line.width), 0);
    return { sizePx, css, maxWidth, lineWidth, height: lines.length * sizePx * 1.16 };
  }

  function drawText(ctx: CanvasRenderingContext2D, layer: Layer, t: number, alpha: number, inE: number) {
    const { sizePx, css } = fontFor(layer);
    ctx.font = css;

    const maxWidth = dim(layer.nums.w, W, W * 0.8);
    const lineHeight = sizePx * 1.16;
    // `w` is the alignment box: left and right align to its edges, centre to
    // its middle. Set `w` on every text layer.
    const align = (layer.props.align ?? 'center').toLowerCase();

    const content = textContent(layer, t);

    const { lines, total, words } = layoutText(ctx, content, maxWidth);
    const totalHeight = lines.length * lineHeight;

    const elapsed = t - layer.start;
    const mode = layer.animIn;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = layer.props.color ?? '#F4F2EE';

    let y = -totalHeight / 2 + lineHeight / 2;
    for (const line of lines) {
      let x =
        align === 'left'
          ? -maxWidth / 2
          : align === 'right'
            ? maxWidth / 2 - line.width
            : -line.width / 2;
      for (const glyph of line.glyphs) {
        const gw = ctx.measureText(glyph.ch).width;
        let p = 1;
        let rise = 0;

        if (mode === 'charIn' || mode === 'charFade') {
          p = charProgress(elapsed, glyph.index, total, layer.animInDur);
          if (mode === 'charIn') rise = (1 - easeOutCubic(p)) * sizePx * 0.24;
        } else if (mode === 'typeOn') {
          const revealed = Math.floor(clamp01(elapsed / Math.max(0.001, layer.animInDur)) * total + 1e-6);
          p = glyph.index < revealed ? 1 : 0;
        } else if (mode === 'wordIn') {
          p = wordProgress(elapsed, glyph.word, words, layer.animInDur);
          rise = (1 - easeOutCubic(p)) * sizePx * 0.2;
        } else {
          p = inE;
          if (mode === 'fadeUp') rise = (1 - inE) * sizePx * 0.2;
          if (mode === 'riseIn') rise = (1 - inE) * sizePx * 0.5;
        }

        if (p > 0.002) {
          ctx.globalAlpha = alpha * p;
          ctx.fillText(glyph.ch, x + gw / 2, y - rise);
        }
        x += gw;
      }
      y += lineHeight;
    }
    ctx.globalAlpha = alpha;
  }

  function shapeDefaults(layer: Layer, t: number): { w: number; h: number; radius: number; thick: number } {
    let w = dim(layer.nums.w, W, 300);
    let h = dim(layer.nums.h, W, NaN);
    let radius = dim(layer.nums.radius, W, NaN);
    let thick = layer.nums.thick ?? 0;

    // Grow first, so a ring grown by `w` stays round and a line grown by `w`
    // keeps its thickness instead of inheriting the old width.
    if (layer.grow) {
      const p = progressBetween(t, layer.grow.start, layer.grow.end);
      const value = lerp(layer.grow.from, layer.grow.to, easeOutCubic(p));
      if (layer.grow.prop === 'w') w = dim(value, W, value);
      else if (layer.grow.prop === 'h') h = dim(value, W, value);
    }

    switch (layer.shape) {
      case 'circle':
        if (!Number.isFinite(h)) h = w;
        break;
      case 'pill':
        if (!Number.isFinite(h)) h = Math.max(48, w * 0.22);
        radius = h / 2;
        break;
      case 'ring':
        if (!Number.isFinite(h)) h = w;
        if (!Number.isFinite(radius)) radius = h / 2;
        if (thick > 0 && thick <= 1) thick = thick * w;
        else if (thick === 0) thick = Math.max(2, w * 0.02);
        break;
      case 'line':
        if (!Number.isFinite(h)) h = Math.max(2, dim(layer.nums.thick, W, 8));
        radius = h / 2;
        break;
      case 'check':
        if (!Number.isFinite(h)) h = w;
        if (thick > 0 && thick <= 1) thick = thick * w;
        else if (thick === 0) thick = Math.max(4, w * 0.16);
        break;
      case 'arrow':
        // w is the length, h the head height, thick the shaft.
        if (!Number.isFinite(h)) h = Math.max(28, w * 0.24);
        if (thick > 0 && thick <= 1) thick = thick * h;
        else if (thick === 0) thick = Math.max(2, h * 0.16);
        break;
      default:
        if (!Number.isFinite(h)) h = w * 0.6;
        if (!Number.isFinite(radius)) radius = 0;
    }

    if (!Number.isFinite(radius)) radius = 0;

    return { w, h, radius, thick };
  }

  function drawShape(ctx: CanvasRenderingContext2D, layer: Layer, t: number, alpha: number) {
    const { w, h, radius, thick } = shapeDefaults(layer, t);
    const strokeWidth = layer.nums.stroke ?? 0;
    const fillValue = layer.props.gradr ?? layer.props.grad ?? layer.props.color ?? '#FFFFFF';
    const radial = Boolean(layer.props.gradr);
    const glow = layer.nums.glow ?? 0;
    const shadow = layer.nums.shadow ?? 0;

    if (glow > 0) {
      ctx.shadowColor = firstColor(fillValue, '#FFFFFF');
      ctx.shadowBlur = glow * 48;
    } else if (shadow > 0) {
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = shadow * 40;
      ctx.shadowOffsetY = shadow * 14;
    }

    const fill = fillFor(ctx, fillValue, { x: 0, y: 0, w, h, radial });
    ctx.fillStyle = fill;
    ctx.strokeStyle = layer.props.strokeColor ?? '#FFFFFF';
    ctx.lineWidth = strokeWidth;
    ctx.globalAlpha = alpha;

    switch (layer.shape) {
      case 'circle':
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
        if (strokeWidth > 0) {
          ctx.stroke();
        } else {
          ctx.fill();
        }
        break;

      case 'ring':
        roundRectPath(ctx, w, h, radius);
        ctx.strokeStyle = layer.props.color ?? firstColor(fillValue, '#FFFFFF');
        ctx.lineWidth = Math.max(1, thick);
        ctx.stroke();
        break;

      case 'check': {
        ctx.beginPath();
        ctx.moveTo(-w * 0.34, 0);
        ctx.lineTo(-w * 0.08, w * 0.27);
        ctx.lineTo(w * 0.36, -w * 0.29);
        ctx.strokeStyle = layer.props.color ?? '#FFFFFF';
        ctx.lineWidth = Math.max(1, thick);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        break;
      }

      case 'arrow': {
        // Length runs along x, the head is drawn at the +x end so `anchor=left`
        // makes it grow out of its tail.
        const len = w;
        const headLen = Math.min(len * 0.55, Math.max(12, h * 0.6));
        const headHalf = Math.max(6, h * 0.5);
        ctx.beginPath();
        ctx.moveTo(-len / 2, 0);
        ctx.lineTo(len / 2 - headLen * 0.85, 0);
        ctx.moveTo(len / 2 - headLen, -headHalf);
        ctx.lineTo(len / 2, 0);
        ctx.lineTo(len / 2 - headLen, headHalf);
        ctx.strokeStyle = layer.props.color ?? '#FFFFFF';
        ctx.lineWidth = Math.max(1, thick);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        break;
      }

      default:
        roundRectPath(ctx, w, h, radius);
        if (strokeWidth > 0) {
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fill();
        }
    }
  }

  function drawCard(ctx: CanvasRenderingContext2D, layer: Layer) {
    const w = dim(layer.nums.w, W, W * 0.5);
    const h = dim(layer.nums.h, W, H * 0.3);
    const radius = dim(layer.nums.radius, W, 32);
    const strokeWidth = layer.nums.stroke ?? 0;
    const shadow = layer.nums.shadow ?? 0.5;

    if (shadow > 0) {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = shadow * 44;
      ctx.shadowOffsetY = shadow * 16;
    }

    roundRectPath(ctx, w, h, radius);
    ctx.fillStyle = fillFor(ctx, layer.props.grad ?? layer.props.color ?? '#17181B', {
      x: 0,
      y: 0,
      w,
      h,
      radial: Boolean(layer.props.gradr),
    });
    ctx.fill();

    if (strokeWidth > 0) {
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = layer.props.strokeColor ?? 'rgba(255,255,255,0.12)';
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  }

  /** Resolves `follow=id,edge,offset` against another layer's current box. */
  function followTarget(layer: Layer, t: number): { x: number; y: number } | null {
    const spec = layer.props.follow;
    if (!spec) return null;
    const [id, edge = 'top', offsetRaw = '0'] = spec.split(',').map((s) => s.trim());
    const target = recipe.layers.find((l) => l.id === id || l.props.id === id);
    if (!target) return null;

    const box = measureLayer(target, t);
    const tx = evalKeys(target.keys.x, t, target.nums.x ?? 0.5) * W;
    const ty = evalKeys(target.keys.y, t, target.nums.y ?? 0.5) * H;
    const offset = (Number(offsetRaw) || 0) * scaleUnit;

    switch (edge) {
      case 'bottom':
        return { x: tx, y: ty + box.h / 2 + offset };
      case 'left':
        return { x: tx - box.w / 2 + offset, y: ty };
      case 'right':
        return { x: tx + box.w / 2 + offset, y: ty };
      default:
        return { x: tx, y: ty - box.h / 2 + offset };
    }
  }

  function layerFrame(layer: Layer, t: number) {
    const elapsed = t - layer.start;
    const remaining = layer.end - t;

    const opacity = evalKeys(layer.keys.opacity, t, layer.nums.opacity ?? 1);
    const scale = evalKeys(layer.keys.scale, t, 1);
    let rotation = evalKeys(layer.keys.rot, t, 0);

    let inE = 1;
    if (layer.animIn !== 'none' && layer.animInDur > 0) inE = easeOutCubic(clamp01(elapsed / layer.animInDur));
    let outE = 1;
    if (layer.animOut !== 'none' && layer.animOutDur > 0) outE = easeOutCubic(clamp01(remaining / layer.animOutDur));

    const alpha = opacity * (layer.animIn === 'none' ? 1 : inE) * (layer.animOut === 'none' ? 1 : outE);

    let x = evalKeys(layer.keys.x, t, layer.nums.x ?? 0.5) * W;
    let y = evalKeys(layer.keys.y, t, layer.nums.y ?? 0.5) * H;

    const pinned = followTarget(layer, t);
    if (pinned) {
      x = pinned.x;
      y = pinned.y;
    }

    let sx = scale;
    let sy = scale;

    switch (layer.animIn) {
      case 'popIn': {
        const s = lerp(0.82, 1, easeOutBack(clamp01(elapsed / Math.max(0.001, layer.animInDur))));
        sx *= s;
        sy *= s;
        break;
      }
      case 'scaleIn': {
        const s = lerp(0.9, 1, inE);
        sx *= s;
        sy *= s;
        break;
      }
      case 'zoomIn': {
        const s = lerp(1.4, 1, inE);
        sx *= s;
        sy *= s;
        break;
      }
      case 'slideL':
        x += (1 - inE) * W * 0.14;
        break;
      case 'slideR':
        x -= (1 - inE) * W * 0.14;
        break;
      case 'slideU':
        y += (1 - inE) * H * 0.1;
        break;
      case 'slideD':
        y -= (1 - inE) * H * 0.1;
        break;
      case 'fadeUp':
        y += (1 - inE) * W * 0.0146;
        break;
      case 'riseIn':
        y += (1 - inE) * W * 0.0375;
        break;
      default:
        break;
    }

    switch (layer.animOut) {
      case 'scaleDown': {
        const s = lerp(0.94, 1, outE);
        sx *= s;
        sy *= s;
        break;
      }
      case 'popOut': {
        const s = lerp(1, 1.14, 1 - outE);
        sx *= s;
        sy *= s;
        break;
      }
      case 'zoomOut': {
        const s = lerp(0.86, 1, outE);
        sx *= s;
        sy *= s;
        break;
      }
      case 'slideOutL':
        x -= (1 - outE) * W * 0.14;
        break;
      case 'slideOutR':
        x += (1 - outE) * W * 0.14;
        break;
      default:
        break;
    }

    // Emphasis loops for the layer's whole life; it is a texture, not an event.
    if (layer.props.emph === 'pulse') {
      const s = 1 + 0.035 * Math.sin((elapsed / 1.1) * Math.PI * 2);
      sx *= s;
      sy *= s;
    } else if (layer.props.emph === 'shake') {
      rotation += Math.sin(elapsed * 34) * 1.1;
      x += Math.sin(elapsed * 41) * scaleUnit * 3;
    }

    // `anchor` moves the element so `pos` means an edge instead of the centre.
    // `align` aligns the glyphs inside the `w` box, so only the hit box — not
    // the box itself — shifts off centre.
    let ox = 0;
    let oy = 0;
    let hitOx = 0;
    if (layer.kind === 'shape' && layer.props.anchor) {
      const box = shapeDefaults(layer, t);
      if (layer.props.anchor === 'left') ox = box.w / 2;
      else if (layer.props.anchor === 'right') ox = -box.w / 2;
      else if (layer.props.anchor === 'top') oy = box.h / 2;
      else if (layer.props.anchor === 'bottom') oy = -box.h / 2;
    } else if (layer.kind === 'text' && (layer.props.align === 'left' || layer.props.align === 'right')) {
      const metrics = textMetrics(layer, t);
      const slack = metrics.maxWidth - metrics.lineWidth;
      hitOx = layer.props.align === 'left' ? -slack / 2 : slack / 2;
    }

    return { alpha, inE, outE, x: x + ox, y: y + oy, hitOx, sx, sy, rotation };
  }

  function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, t: number) {
    const frame = layerFrame(layer, t);
    if (frame.alpha <= 0.002) return;
    const { alpha, inE, outE, x, y, sx, sy, rotation } = frame;

    ctx.save();
    if (layer.animOut === 'blurOut') {
      ctx.filter = `blur(${((1 - outE) * 14).toFixed(2)}px)`;
    } else if (layer.animIn === 'blurIn') {
      ctx.filter = `blur(${((1 - inE) * 16).toFixed(2)}px)`;
    }
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(sx, sy);

    if (layer.kind === 'text') drawText(ctx, layer, t, alpha, inE);
    else if (layer.kind === 'shape') drawShape(ctx, layer, t, alpha);
    else if (layer.kind === 'card') drawCard(ctx, layer);

    ctx.restore();
    ctx.filter = 'none';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.globalAlpha = 1;
  }

  function cameraAt(active: Layer[], t: number) {
    const cameras = active.filter((l) => l.kind === 'camera');
    const layer = cameras[cameras.length - 1];
    if (!layer) return null;
    return {
      zoom: evalKeys(layer.keys.zoom, t, layer.nums.zoom ?? 1),
      x: evalKeys(layer.keys.x, t, layer.nums.x ?? 0.5),
      y: evalKeys(layer.keys.y, t, layer.nums.y ?? 0.5),
    };
  }

  function draw(ctx: CanvasRenderingContext2D, t: number) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0B0F14';
    ctx.fillRect(0, 0, W, H);

    const active = recipe.layers.filter((l) => t >= l.start - 1e-6 && t <= l.end + 1e-6);

    for (const layer of active) {
      if (layer.kind === 'scene') drawScene(ctx, layer);
    }

    const camera = cameraAt(active, t);

    const drawn = active
      .filter((l) => l.kind !== 'scene' && l.kind !== 'camera')
      .sort((a, b) => a.z - b.z || a.start - b.start);

    for (const layer of drawn) {
      ctx.save();
      if (camera) {
        // Depth: 0 pins the layer to the frame, 1 follows the camera fully.
        // The difference between two depths is the parallax.
        const depth = layer.nums.d ?? 1;
        const z = 1 + (camera.zoom - 1) * depth;
        ctx.translate(W * 0.5, H * 0.5);
        ctx.scale(z, z);
        ctx.translate(-camera.x * W, -camera.y * H);
      }
      drawLayer(ctx, layer, t);
      ctx.restore();
    }
    ctx.restore();
  }

  function measureLayer(layer: Layer, t: number): { w: number; h: number } {
    if (layer.kind === 'text') {
      if (!measureCtx) return { w: 0, h: 0 };
      const metrics = textMetrics(layer, t);
      return { w: metrics.lineWidth, h: metrics.height };
    }

    if (layer.kind === 'shape') {
      const { w, h } = shapeDefaults(layer, t);
      const shapeW = Math.abs(w);
      const shapeH = layer.shape === 'circle' || layer.shape === 'check' ? Math.abs(w) : Math.abs(h);
      return { w: shapeW, h: shapeH };
    }

    if (layer.kind === 'card') {
      return {
        w: dim(layer.nums.w, W, W * 0.5),
        h: dim(layer.nums.h, W, H * 0.3),
      };
    }

    return { w: 0, h: 0 };
  }

  /**
   * Axis-aligned boxes for every visible, selectable layer at time t, in canvas
   * pixels, front-most first. Used by the studio for click-to-select.
   */
  function hits(t: number): HitBox[] {
    const active = recipe.layers.filter((l) => t >= l.start - 1e-6 && t <= l.end + 1e-6);
    const camera = cameraAt(active, t);
    const boxes: HitBox[] = [];

    // Same paint order as draw(), so the last painted layer wins a click.
    const drawn = active
      .filter((l) => l.kind !== 'scene' && l.kind !== 'camera')
      .sort((a, b) => a.z - b.z || a.start - b.start);

    for (const layer of drawn) {
      const frame = layerFrame(layer, t);
      if (frame.alpha <= 0.05) continue;

      const size = measureLayer(layer, t);
      if (size.w <= 0 || size.h <= 0) continue;

      const depth = layer.nums.d ?? 1;
      const zoom = camera ? 1 + (camera.zoom - 1) * depth : 1;

      let cx = frame.x + frame.hitOx;
      let cy = frame.y;
      if (camera) {
        cx = (cx - camera.x * W) * zoom + W / 2;
        cy = (cy - camera.y * H) * zoom + H / 2;
      }

      const pad = W * 0.006;
      boxes.push({
        id: layer.id,
        x: cx,
        y: cy,
        w: size.w * Math.abs(frame.sx) * zoom + pad,
        h: size.h * Math.abs(frame.sy) * zoom + pad,
        bw: size.w * Math.abs(frame.sx),
        bh: size.h * Math.abs(frame.sy),
        z: layer.z,
      });
    }

    return boxes.reverse();
  }

  return { draw, hits, width: W, height: H };
}

export interface HitBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Size before camera zoom, in canvas pixels — used when resizing. */
  bw: number;
  bh: number;
  z: number;
}

export function selectionHandles(box: HitBox): { x: number; y: number }[] {
  const x = box.x - box.w / 2;
  const y = box.y - box.h / 2;
  return [
    { x, y },
    { x: x + box.w, y },
    { x, y: y + box.h },
    { x: x + box.w, y: y + box.h },
  ];
}

/** Draws the selection frame and its four corner handles in canvas pixels. */
export function drawSelection(ctx: CanvasRenderingContext2D, box: HitBox, unit = 1920) {
  const x = box.x - box.w / 2;
  const y = box.y - box.h / 2;
  const line = Math.max(2, unit * 0.0022);
  const handle = Math.max(12, unit * 0.012);

  ctx.save();
  ctx.lineWidth = line;
  ctx.strokeStyle = 'rgba(139, 147, 248, 0.85)';
  ctx.setLineDash([line * 2.4, line * 1.6]);
  ctx.strokeRect(x, y, box.w, box.h);
  ctx.setLineDash([]);

  ctx.fillStyle = '#8B93F8';
  ctx.strokeStyle = '#0F1012';
  ctx.lineWidth = Math.max(1, line * 0.5);
  for (const point of selectionHandles(box)) {
    ctx.beginPath();
    ctx.rect(point.x - handle / 2, point.y - handle / 2, handle, handle);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export type Scene = ReturnType<typeof createScene>;
