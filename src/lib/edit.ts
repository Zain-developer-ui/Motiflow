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

/** Moves a layer one step forward (delta > 0) or backward through the stack. */
export function nudgeZ(source: string, layer: Layer, delta: number): string {
  return setProp(source, layer, 'z', String(Math.round(layer.z + delta)));
}

/** True when both layers belong to the same recipe line. */
export function sameLine(a: Layer, b: Layer): boolean {
  return a.line === b.line;
}
