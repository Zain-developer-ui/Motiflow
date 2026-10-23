/** Splits a string on a separator, ignoring separators inside parentheses. */
export function splitTopLevel(input: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of input) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

export function isGradient(value: string | undefined): boolean {
  if (!value) return false;
  return splitTopLevel(value, ',').length >= 2;
}

/**
 * Returns a fill for a colour or a gradient spec.
 * `grad=c1,c2` goes top → bottom, `gradr=c1,c2` goes centre → edge.
 */
export function fillFor(
  ctx: CanvasRenderingContext2D,
  value: string | undefined,
  opts: { x: number; y: number; w: number; h: number; radial: boolean },
): string | CanvasGradient {
  const fallback = value ?? '#FFFFFF';
  const parts = splitTopLevel(fallback, ',');
  if (parts.length < 2) return fallback;

  if (opts.radial) {
    const r = Math.max(opts.w, opts.h) / 2;
    const g = ctx.createRadialGradient(opts.x, opts.y, 0, opts.x, opts.y, Math.max(1, r));
    parts.forEach((c, i) => g.addColorStop(i / (parts.length - 1), c));
    return g;
  }

  const g = ctx.createLinearGradient(opts.x, opts.y - opts.h / 2, opts.x, opts.y + opts.h / 2);
  parts.forEach((c, i) => g.addColorStop(i / (parts.length - 1), c));
  return g;
}

/** Best-effort solid colour from a gradient spec, used for glow tints. */
export function firstColor(value: string | undefined, fallback = '#FFFFFF'): string {
  if (!value) return fallback;
  const parts = splitTopLevel(value, ',');
  return parts[0] || fallback;
}

export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const expand = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const n = parseInt(expand.slice(0, 6), 16);
    if (Number.isNaN(n)) return color;
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}
