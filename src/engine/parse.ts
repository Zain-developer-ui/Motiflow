import type { AnimName, Issue, Keyframe, Layer, LayerKind, Procedural, Recipe, ShapeKind } from './types';

const TIME = /^(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?$/;
const RANGE = /^\s*(\d{1,3}:\d{2}(?:\.\d{1,3})?)\s*-->\s*(\d{1,3}:\d{2}(?:\.\d{1,3})?)\s*(.*)$/;

const KINDS: Record<string, LayerKind> = {
  scene: 'scene',
  text: 'text',
  shape: 'shape',
  card: 'card',
  camera: 'camera',
};

const SHAPES: ShapeKind[] = ['rect', 'circle', 'pill', 'ring', 'line', 'check', 'arrow'];

const ANIMS: AnimName[] = [
  'charIn',
  'typeOn',
  'wordIn',
  'charFade',
  'fadeUp',
  'riseIn',
  'slideL',
  'slideR',
  'slideU',
  'slideD',
  'zoomIn',
  'blurIn',
  'fadeOut',
  'blurOut',
  'scaleIn',
  'scaleDown',
  'popIn',
  'popOut',
  'zoomOut',
  'slideOutL',
  'slideOutR',
  'none',
];

export function parseTime(raw: string): number | null {
  const m = raw.trim().match(TIME);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const frac = m[3] ? Number(`0.${m[3]}`) : 0;
  return major * 60 + minor + frac;
}

function num(raw: string | undefined): number {
  if (raw === undefined) return NaN;
  const t = parseTime(raw);
  if (t !== null) return t;
  return Number(raw);
}

function stripComment(line: string): string {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    if (!inQuote && ch === '#') {
      const prev = line[i - 1];
      if (i === 0 || prev === ' ' || prev === '\t') return line.slice(0, i);
    }
  }
  return line;
}

function tokenize(input: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (const ch of input) {
    if (ch === '"') {
      inQuote = !inQuote;
      cur += ch;
      continue;
    }
    if (!inQuote && (ch === ' ' || ch === '\t')) {
      if (cur) {
        out.push(cur);
        cur = '';
      }
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function parseKeys(raw: string, issues: Issue[], line: number): Record<string, Keyframe[]> {
  const tracks: Record<string, Keyframe[]> = {};
  for (const part of raw.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const prop = part.slice(0, colon).trim();
    const frames: Keyframe[] = [];
    for (const chunk of part.slice(colon + 1).split(',')) {
      const eq = chunk.indexOf('=');
      if (eq < 0) continue;
      const tRaw = chunk.slice(0, eq).trim();
      let vRaw = chunk.slice(eq + 1).trim();
      let linear = false;
      if (vRaw.endsWith('~l')) {
        linear = true;
        vRaw = vRaw.slice(0, -2);
      }
      const t = num(tRaw);
      const v = Number(vRaw);
      if (!Number.isFinite(t) || !Number.isFinite(v)) {
        issues.push({ line, message: `Bad keyframe "${chunk}" on "${prop}" — expected t=value`, severity: 'warn' });
        continue;
      }
      frames.push({ t, v, linear });
    }
    if (frames.length) tracks[prop] = frames.sort((a, b) => a.t - b.t);
  }
  return tracks;
}

function parseProcedural(raw: string, issues: Issue[], line: number, label: string): Procedural | undefined {
  const parts = raw.split(',').map((p) => p.trim());
  // growTo=prop,from,to,t0,t1[,fmt]  ·  count=from,to,t0,t1[,fmt]
  const hasProp = !Number.isFinite(num(parts[0]));
  const offset = hasProp ? 1 : 0;
  const numeric = parts.slice(offset, offset + 4).map((p) => num(p));
  if (numeric.length < 4 || numeric.some((n) => !Number.isFinite(n))) {
    issues.push({ line, message: `${label} needs 4 numbers — got "${raw}"`, severity: 'warn' });
    return undefined;
  }
  return {
    prop: hasProp ? parts[0] : '',
    from: numeric[0],
    to: numeric[1],
    start: numeric[2],
    end: numeric[3],
    suffix: parts[offset + 4],
  };
}

/** Pulls the recipe body out of an [RECIPE]…[/RECIPE] paste, or returns the source as-is. */
export function extractRecipe(source: string): string {
  const match = source.match(/\[RECIPE\]([\s\S]*?)(?:\[\/RECIPE\]|$)/i);
  return match ? match[1] : source;
}

export function extractAssets(source: string): string[] {
  const match = source.match(/\[ASSETS\]([\s\S]*?)\[\/ASSETS\]/i);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export function parseRecipe(source: string): Recipe {
  const issues: Issue[] = [];
  const layers: Layer[] = [];
  const assets = extractAssets(source);
  const body = extractRecipe(source);

  let version = 'v1';
  let index = 0;

  const lines = body.split(/\r?\n/);
  lines.forEach((rawLine, i) => {
    const lineNo = i + 1;
    const line = stripComment(rawLine).trim();
    if (!line) return;

    if (/^v\d+/i.test(line)) {
      version = line;
      return;
    }

    const range = line.match(RANGE);
    if (!range) {
      issues.push({ line: lineNo, message: `Not a timed line — expected "00:00.00 --> 00:04.00 …"`, severity: 'warn' });
      return;
    }

    const start = parseTime(range[1]) ?? 0;
    const end = parseTime(range[2]) ?? start + 1;
    if (end <= start) {
      issues.push({ line: lineNo, message: `End time is not after start time`, severity: 'error' });
    }

    const tokens = tokenize(range[3]);
    if (tokens.length === 0) {
      issues.push({ line: lineNo, message: `Missing element type`, severity: 'error' });
      return;
    }

    const kindToken = tokens[0].toLowerCase();
    const kind = KINDS[kindToken];
    if (!kind) {
      issues.push({
        line: lineNo,
        message: `Unknown element "${tokens[0]}" — use scene, text, shape, card or camera`,
        severity: 'error',
      });
      return;
    }

    let cursor = 1;
    let shape: ShapeKind | undefined;
    if (kind === 'shape') {
      const candidate = (tokens[cursor] ?? '').toLowerCase() as ShapeKind;
      if (SHAPES.includes(candidate)) {
        shape = candidate;
        cursor++;
      } else {
        shape = 'rect';
        issues.push({
          line: lineNo,
          message: `Unknown shape "${tokens[cursor]}" — defaulting to rect`,
          severity: 'warn',
        });
      }
    }

    let text = '';
    if (tokens[cursor]?.startsWith('"')) {
      text = tokens[cursor]
        .slice(1, tokens[cursor].endsWith('"') ? -1 : undefined)
        // `\n` in the quoted string is a hard line break the renderer honours.
        .replace(/\\n/g, '\n');
      cursor++;
    }

    const props: Record<string, string> = {};
    const nums: Record<string, number> = {};
    const keys: Record<string, Keyframe[]> = {};
    let grow: Procedural | undefined;
    let count: Procedural | undefined;
    let animIn: AnimName = 'none';
    let animOut: AnimName = 'none';
    let animInDur = 0.4;
    let animOutDur = 0.3;
    let delay = 0;

    for (; cursor < tokens.length; cursor++) {
      const token = tokens[cursor];
      const eq = token.indexOf('=');
      if (eq < 0) {
        issues.push({ line: lineNo, message: `Ignored stray token "${token}"`, severity: 'warn' });
        continue;
      }
      const key = token.slice(0, eq).trim();
      const value = token.slice(eq + 1).trim();

      switch (key) {
        case 'keys':
          Object.assign(keys, parseKeys(value, issues, lineNo));
          break;
        case 'growTo':
          grow = parseProcedural(value, issues, lineNo, 'growTo');
          break;
        case 'count':
          count = parseProcedural(value, issues, lineNo, 'count');
          break;
        case 'in': {
          const a = value as AnimName;
          if (ANIMS.includes(a)) animIn = a;
          else issues.push({ line: lineNo, message: `Unknown in-animation "${value}"`, severity: 'warn' });
          break;
        }
        case 'out': {
          const a = value as AnimName;
          if (ANIMS.includes(a)) animOut = a;
          else issues.push({ line: lineNo, message: `Unknown out-animation "${value}"`, severity: 'warn' });
          break;
        }
        case 'inDur':
          animInDur = Math.max(0.01, num(value));
          break;
        case 'outDur':
          animOutDur = Math.max(0.01, num(value));
          break;
        case 'd':
          // Depth: how much the layer follows the camera. 0 pins it to the
          // frame, 1 is full parallax. Older recipes used `d` as a delay that
          // nothing ever read, so the name is free.
          nums.d = Math.min(1, Math.max(0, num(value) || 0));
          break;
        case 'id':
          props.id = value;
          break;
        case 'emph': {
          const e = value.toLowerCase();
          if (e !== 'pulse' && e !== 'shake' && e !== 'none') {
            issues.push({ line: lineNo, message: `Unknown emph "${value}" — use pulse, shake or none`, severity: 'warn' });
          }
          props.emph = e;
          break;
        }
        case 'pos': {
          const [x, y] = value.split(',').map((p) => Number(p));
          if (Number.isFinite(x)) nums.x = x;
          if (Number.isFinite(y)) nums.y = y;
          props.pos = value;
          break;
        }
        case 'z':
          nums.z = num(value) || 0;
          break;
        case 'follow':
          props.follow = value;
          break;
        default: {
          props[key] = value;
          const n = num(value);
          if (Number.isFinite(n)) nums[key] = n;
        }
      }
    }

    layers.push({
      id: props.id ?? `${kind}${shape ? `-${shape}` : ''}-${index++}`,
      kind,
      shape,
      start,
      end,
      z: nums.z ?? 0,
      text,
      props,
      nums,
      keys,
      grow,
      count,
      animIn,
      animOut,
      animInDur,
      animOutDur,
      delay,
      line: lineNo,
      raw: rawLine.trim(),
    });
  });

  const duration = layers.reduce((max, l) => Math.max(max, l.end), 0);

  if (layers.length === 0) {
    issues.push({ line: 0, message: 'No layers found. Paste a recipe that starts with "v1".', severity: 'error' });
  }

  return { version, layers, issues, duration, assets };
}
