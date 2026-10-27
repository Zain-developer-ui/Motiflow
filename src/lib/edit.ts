import type { Layer } from '../engine/types';

const RECIPE_OPEN = /\[RECIPE\][ \t]*\r?\n?/i;

function bodyOffset(source: string): number {
  const match = source.match(RECIPE_OPEN);
  return match && match.index !== undefined ? match.index + match[0].length : 0;
}

/**
 * The absolute line index of a parsed layer inside the raw source string.
 * `parseRecipe` numbers lines relative to the recipe body, so the `[RECIPE]`
 * wrapper has to be accounted for before editing anything.
 */
function absoluteLine(source: string, layer: Layer): number | null {
  const offset = bodyOffset(source);
  const base = (source.slice(0, offset).match(/\n/g) ?? []).length;
  const index = base + (layer.line - 1);
  const lines = source.split('\n');
  return index >= 0 && index < lines.length ? index : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Appends a token while preserving a trailing CR of CRLF files. */
function appendToken(line: string, token: string): string {
  const cr = line.endsWith('\r') ? '\r' : '';
  const body = cr ? line.slice(0, -1) : line;
  return `${body.replace(/[ \t]+$/, '')} ${token}${cr}`;
}

/** Sets (or adds) a `key=value` token on a layer's line. */
export function setProp(source: string, layer: Layer, key: string, value: string): string {
  const index = absoluteLine(source, layer);
  if (index === null) return source;

  const lines = source.split('\n');
  const line = lines[index];
  const pattern = new RegExp(`(^|[ \\t])${escapeRegex(key)}=[^\\s]+`);

  if (pattern.test(line)) {
    lines[index] = line.replace(pattern, (_match, lead: string) => `${lead}${key}=${value}`);
  } else {
    lines[index] = appendToken(line, `${key}=${value}`);
  }

  return lines.join('\n');
}

export function setNumber(source: string, layer: Layer, key: string, value: number): string {
  if (!Number.isFinite(value)) return source;
  const rounded = Math.abs(value - Math.round(value)) < 0.001 ? String(Math.round(value)) : value.toFixed(3);
  return setProp(source, layer, key, rounded);
}

export function setPosition(source: string, layer: Layer, x: number, y: number): string {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return setProp(source, layer, 'pos', `${clamp(x).toFixed(3)},${clamp(y).toFixed(3)}`);
}

/** Replaces the quoted string of a layer, keeping the recipe syntactically valid. */
export function setText(source: string, layer: Layer, text: string): string {
  const index = absoluteLine(source, layer);
  if (index === null) return source;

  const lines = source.split('\n');
  const line = lines[index];
  // The parser has no escape syntax, so a plain double quote would break the
  // line. A real newline is written back as the `\n` escape the parser reads.
  const quoted = `"${text.replace(/"/g, '”').replace(/\r?\n/g, '\\n')}"`;

  if (/"[^"]*"/.test(line)) {
    lines[index] = line.replace(/"[^"]*"/, quoted);
  } else {
    const firstKey = line.search(/[ \t]+[A-Za-z]+=/);
    lines[index] =
      firstKey >= 0 ? `${line.slice(0, firstKey)} ${quoted}${line.slice(firstKey)}` : appendToken(line, quoted);
  }

  return lines.join('\n');
}

export function deleteLayer(source: string, layer: Layer): string {
  const index = absoluteLine(source, layer);
  if (index === null) return source;

  const lines = source.split('\n');
  lines.splice(index, 1);
  return lines.join('\n');
}

/* ------------------------------ time range -------------------------------- */

const RANGE_PREFIX = /^(\s*)\d{1,3}:\d{2}(?:\.\d{1,3})?\s*-->\s*\d{1,3}:\d{2}(?:\.\d{1,3})?/;

/** mm:ss.cc — the same shape the parser reads back. */
export function timecode(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const cents = Math.round((safe - Math.floor(safe)) * 100) % 100;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cents).padStart(2, '0')}`;
}

/** Moves, trims or stretches a layer's time range. */
export function setTimeRange(source: string, layer: Layer, start: number, end: number): string {
  const index = absoluteLine(source, layer);
  if (index === null) return source;
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart + 0.05, end);

  const lines = source.split('\n');
  const line = lines[index];
  const cr = line.endsWith('\r') ? '\r' : '';
  const body = cr ? line.slice(0, -1) : line;
  if (!RANGE_PREFIX.test(body)) return source;

  lines[index] = body.replace(RANGE_PREFIX, (_m, lead: string) => `${lead}${timecode(safeStart)} --> ${timecode(safeEnd)}`) + cr;
  return lines.join('\n');
}

/* -------------------------------- keyframes ------------------------------- */

interface KeyEntry {
  t: number;
  v: number;
  linear: boolean;
}

function parseKeyTracks(raw: string): Map<string, KeyEntry[]> {
  const tracks = new Map<string, KeyEntry[]>();
  for (const part of raw.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const prop = part.slice(0, colon).trim();
    const entries: KeyEntry[] = [];
    for (const chunk of part.slice(colon + 1).split(',')) {
      const eq = chunk.indexOf('=');
      if (eq < 0) continue;
      const t = Number(chunk.slice(0, eq).trim());
      let vRaw = chunk.slice(eq + 1).trim();
      const linear = vRaw.endsWith('~l');
      if (linear) vRaw = vRaw.slice(0, -2);
      const v = Number(vRaw);
      if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
      entries.push({ t, v, linear });
    }
    if (entries.length) tracks.set(prop, entries.sort((a, b) => a.t - b.t));
  }
  return tracks;
}

const roundKey = (value: number) =>
  Math.abs(value - Math.round(value)) < 0.001 ? String(Math.round(value)) : value.toFixed(3);

function buildKeyValue(tracks: Map<string, KeyEntry[]>): string {
  return [...tracks.entries()]
    .filter(([, entries]) => entries.length)
    .map(
      ([prop, entries]) =>
        `${prop}:${entries
          .sort((a, b) => a.t - b.t)
          .map((k) => `${k.t.toFixed(2)}=${roundKey(k.v)}${k.linear ? '~l' : ''}`)
          .join(',')}`,
    )
    .join(';');
}

/** Adds or replaces a keyframe for `prop` at time `t`. */
export function setKey(source: string, layer: Layer, prop: string, t: number, value: number): string {
  const index = absoluteLine(source, layer);
  if (index === null || !Number.isFinite(value)) return source;

  const lines = source.split('\n');
  const line = lines[index];
  const cr = line.endsWith('\r') ? '\r' : '';
  const body = cr ? line.slice(0, -1) : line;
  const match = body.match(/(^|\s)keys=(\S+)/);

  const tracks = match ? parseKeyTracks(match[2]) : new Map<string, KeyEntry[]>();
  const entries = tracks.get(prop) ?? [];
  const at = Math.max(0, t);
  const existing = entries.find((k) => Math.abs(k.t - at) <= 0.02);
  if (existing) {
    existing.v = value;
    existing.t = at;
  } else {
    entries.push({ t: at, v: value, linear: false });
  }
  tracks.set(prop, entries);

  const value_ = buildKeyValue(tracks);
  const token = `keys=${value_}`;
  lines[index] = match
    ? body.replace(/(^|\s)keys=\S+/, (_m, lead: string) => `${lead}${token}`) + cr
    : appendToken(body, token) + cr;
  return lines.join('\n');
}

/** Adds a key at `t`, or removes it when one already sits there. */
export function toggleKey(source: string, layer: Layer, prop: string, t: number, value: number): string {
  const index = absoluteLine(source, layer);
  if (index === null) return source;
  const line = source.split('\n')[index];
  const match = line.match(/(^|\s)keys=(\S+)/);
  const entries = match ? parseKeyTracks(match[2]).get(prop) ?? [] : [];
  const at = Math.max(0, t);
  if (entries.some((k) => Math.abs(k.t - at) <= 0.02)) {
    return removeKeyAt(source, layer, prop, at);
  }
  return setKey(source, layer, prop, at, value);
}

/** Removes the single keyframe nearest `t` (±0.02 s). */
export function removeKeyAt(source: string, layer: Layer, prop: string, t: number): string {
  const index = absoluteLine(source, layer);
  if (index === null) return source;

  const lines = source.split('\n');
  const line = lines[index];
  const cr = line.endsWith('\r') ? '\r' : '';
  const body = cr ? line.slice(0, -1) : line;
  const match = body.match(/(^|\s)keys=(\S+)/);
  if (!match) return source;

  const tracks = parseKeyTracks(match[2]);
  const left = (tracks.get(prop) ?? []).filter((k) => Math.abs(k.t - t) > 0.02);
  if (left.length) tracks.set(prop, left);
  else tracks.delete(prop);

  const next = buildKeyValue(tracks);
  lines[index] = next
    ? body.replace(/(^|\s)keys=\S+/, (_m, lead: string) => `${lead}keys=${next}`) + cr
    : body.replace(/(^|\s)keys=\S+/, '').replace(/[ \t]{2,}/g, ' ').trimEnd() + cr;
  return lines.join('\n');
}

/** Drops every key of `prop` (or the whole `keys=` token when prop is omitted). */
export function clearKeys(source: string, layer: Layer, prop?: string): string {
  const index = absoluteLine(source, layer);
  if (index === null) return source;

  const lines = source.split('\n');
  const line = lines[index];
  const cr = line.endsWith('\r') ? '\r' : '';
  const body = cr ? line.slice(0, -1) : line;
  const match = body.match(/(^|\s)keys=(\S+)/);
  if (!match) return source;

  if (!prop) {
    lines[index] = body.replace(/(^|\s)keys=\S+/, '').replace(/[ \t]{2,}/g, ' ').trimEnd() + cr;
    return lines.join('\n');
  }

  const tracks = parseKeyTracks(match[2]);
  tracks.delete(prop);
  const next = buildKeyValue(tracks);
  lines[index] = next
    ? body.replace(/(^|\s)keys=\S+/, (_m, lead: string) => `${lead}keys=${next}`) + cr
    : body.replace(/(^|\s)keys=\S+/, '').replace(/[ \t]{2,}/g, ' ').trimEnd() + cr;
  return lines.join('\n');
}

/* -------------------------------- inserting ------------------------------- */

/** Appends a recipe line, keeping it inside an `[RECIPE]…[/RECIPE]` wrapper. */
export function appendLine(source: string, line: string): string {
  const close = source.search(/\[\/RECIPE\]/i);
  if (close >= 0) {
    const head = source.slice(0, close).replace(/\s+$/, '');
    const tail = source.slice(close);
    return `${head}\n${line}\n${tail}`;
  }
  const trimmed = source.replace(/\s+$/, '');
  return `${trimmed}${trimmed ? '\n' : ''}${line}\n`;
}

/** Moves a layer one step forward (delta > 0) or backward through the stack. */
export function nudgeZ(source: string, layer: Layer, delta: number): string {
  return setProp(source, layer, 'z', String(Math.round(layer.z + delta)));
}

/** True when both layers belong to the same recipe line. */
export function sameLine(a: Layer, b: Layer): boolean {
  return a.line === b.line;
}
