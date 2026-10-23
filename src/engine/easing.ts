export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

export const easeInCubic = (t: number) => Math.pow(clamp01(t), 3);

export const easeInOutCubic = (t: number) => {
  const p = clamp01(t);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
};

export const easeOutQuint = (t: number) => 1 - Math.pow(1 - clamp01(t), 5);

export const easeOutBack = (t: number) => {
  const c = 1.70158;
  const p = clamp01(t) - 1;
  return 1 + (c + 1) * p * p * p + c * p * p;
};

/** Evaluates a keyframe track at time t, falling back to `fallback` when empty. */
export function evalKeys(
  kfs: { t: number; v: number; linear: boolean }[] | undefined,
  t: number,
  fallback: number,
): number {
  if (!kfs || kfs.length === 0) return fallback;
  if (kfs.length === 1) return kfs[0].v;
  if (t <= kfs[0].t) return kfs[0].v;
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return last.v;

  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t >= a.t && t < b.t) {
      const span = b.t - a.t;
      const p = span <= 0 ? 1 : (t - a.t) / span;
      const e = b.linear ? p : easeInOutCubic(p);
      return a.v + (b.v - a.v) * e;
    }
  }
  return last.v;
}

/** Maps a 0..1 progress to a value along a procedural range. */
export function evalProcedural(p: { from: number; to: number }, t: number): number {
  return p.from;
}

export function progressBetween(t: number, start: number, end: number): number {
  if (end <= start) return t >= start ? 1 : 0;
  return clamp01((t - start) / (end - start));
}
