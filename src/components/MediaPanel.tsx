import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssetRecord } from '../lib/assets';

/**
 * The image side of a recipe.
 *
 * A recipe line can only carry a handle (`asset:abc123`), so the studio owes the
 * user two answers the text cannot give: *which* picture is behind that handle,
 * and *where the picture came from*. The grid answers the first; the prompt
 * field answers the second, and doubles as the brief you paste into any free
 * image model before uploading the result.
 */

const STYLES: { id: string; label: string; line: string }[] = [
  {
    id: 'explainer',
    label: 'Flat explainer',
    line: 'flat vector explainer illustration, soft rounded shapes, thick gentle outlines, subtle paper grain',
  },
  {
    id: 'paper',
    label: 'Paper cut',
    line: 'layered paper-cut illustration, soft drop shadows between layers, matte paper texture, hand-cut edges',
  },
  {
    id: 'line',
    label: 'Line art',
    line: 'clean single-weight line art with flat spot colour, generous white space, editorial feel',
  },
  {
    id: 'clay',
    label: 'Soft 3D',
    line: 'soft 3D render, matte clay material, gentle ambient occlusion, studio light from the top left',
  },
  {
    id: 'sticker',
    label: 'Sticker',
    line: 'die-cut sticker illustration, bold outline, flat colour, tiny white margin, playful proportions',
  },
];

const PALETTE = 'warm cream background #FBF3E7, ink #1B1710, ochre accent #E8B23A, muted sage #8FB99C';

function buildPrompt(subject: string, styleId: string) {
  const style = STYLES.find((s) => s.id === styleId) ?? STYLES[0];
  const clean = subject.trim() || 'a friendly character explaining an idea to the camera';
  return [
    `${style.line}.`,
    `Subject: ${clean}.`,
    `Palette: ${PALETTE}.`,
    'Centered composition, room for a caption underneath, no text, no letters, no watermark, no border.',
    'Transparent background, 3:4 portrait, 1536x2048.',
  ].join('\n');
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface MediaPanelProps {
  assets: AssetRecord[];
  urls: Map<string, string>;
  /** asset id -> how many recipe lines point at it */
  usage: Map<string, number>;
  onUpload: (files: FileList | File[]) => void;
  onInsert: (asset: AssetRecord) => void;
  onDelete: (asset: AssetRecord) => void;
  onUpdate: (asset: AssetRecord, patch: { name?: string; prompt?: string }) => void;
}

export function MediaPanel({ assets, urls, usage, onUpload, onInsert, onDelete, onUpdate }: MediaPanelProps) {
  const [activeId, setActiveId] = useState<string | null>(assets[0]?.id ?? null);
  const [subject, setSubject] = useState('');
  const [styleId, setStyleId] = useState('explainer');
  const [copied, setCopied] = useState<'prompt' | 'asset' | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!assets.length) {
      setActiveId(null);
      return;
    }
    if (!activeId || !assets.some((a) => a.id === activeId)) setActiveId(assets[0].id);
  }, [assets, activeId]);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  const active = useMemo(() => assets.find((a) => a.id === activeId) ?? null, [assets, activeId]);
  const prompt = useMemo(() => buildPrompt(subject, styleId), [subject, styleId]);

  const pick = (files: FileList | null) => {
    if (!files || !files.length) return;
    onUpload(files);
  };

  return (
    <div className="media">
      <div className="media-drop">
        <label
          className={`media-dropzone ${dragging ? 'is-dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            multiple
            hidden
            onChange={(e) => {
              pick(e.target.files);
              e.currentTarget.value = '';
            }}
          />
          <span className="media-drop-title">Drop images here</span>
          <span className="media-drop-sub">
            PNG, JPG, WebP or SVG · stays in this browser · inserted at the playhead
          </span>
        </label>
      </div>

      {assets.length === 0 ? (
        <p className="media-empty">
          No images yet. Build a prompt below, generate it in any free image tool, then drop the file here.
        </p>
      ) : (
        <ul className="media-grid" aria-label="Images in this browser">
          {assets.map((asset) => {
            const used = usage.get(asset.id) ?? 0;
            return (
              <li key={asset.id} className={`media-card ${asset.id === activeId ? 'is-active' : ''}`}>
                <button
                  type="button"
                  className="media-pick"
                  onClick={() => setActiveId(asset.id)}
                  title={asset.name}
                >
                  <span
                    className="media-thumb"
                    style={{ backgroundImage: urls.get(asset.id) ? `url("${urls.get(asset.id)}")` : undefined }}
                  />
                  <span className="media-card-name">{asset.name}</span>
                </button>
                <button
                  type="button"
                  className="media-insert"
                  onClick={() => onInsert(asset)}
                  title="Insert at playhead"
                  aria-label={`Insert ${asset.name} at the playhead`}
                >
                  +
                </button>
                {used > 0 && <span className="media-badge">{used}×</span>}
              </li>
            );
          })}
        </ul>
      )}

      {active && (
        <section className="media-detail" aria-label="Selected image">
          <div className="media-detail-head">
            <span className="media-detail-preview" style={{ backgroundImage: urls.get(active.id) ? `url("${urls.get(active.id)}")` : undefined }} />
            <div className="media-detail-meta">
              <input
                className="media-name"
                value={active.name}
                aria-label="Image name"
                onChange={(e) => onUpdate(active, { name: e.target.value })}
              />
              <code className="media-handle">asset:{active.id}</code>
              <span className="media-usage">
                {usage.get(active.id) ? `used in ${usage.get(active.id)} line(s)` : 'not used yet'}
              </span>
            </div>
          </div>

          <label className="media-prompt">
            <span>Prompt this image was made from</span>
            <textarea
              rows={3}
              placeholder="Paste the prompt you used, so the shot can be regenerated later."
              value={active.prompt ?? ''}
              onChange={(e) => onUpdate(active, { prompt: e.target.value })}
            />
          </label>

          <div className="media-actions">
            <button type="button" className="btn btn-primary btn-xs" onClick={() => onInsert(active)}>
              Insert at playhead
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              disabled={!active.prompt}
              onClick={() => {
                void copyText(active.prompt ?? '').then((ok) => ok && setCopied('asset'));
              }}
            >
              {copied === 'asset' ? 'Copied' : 'Copy prompt'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs media-remove"
              onClick={() => onDelete(active)}
              title="Delete from this browser"
            >
              Delete
            </button>
          </div>
        </section>
      )}

      <section className="prompt-lab" aria-label="Image prompt builder">
        <h3>Prompt an image</h3>
        <p className="media-hint">
          Free tools only: generate this in ChatGPT, Gemini or any image model, download it, then drop it above.
        </p>
        <label className="media-prompt">
          <span>What should the picture show?</span>
          <textarea
            rows={2}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="a woman in a mustard kurta pointing at a chart, half body"
          />
        </label>
        <label className="media-prompt">
          <span>Look</span>
          <select value={styleId} onChange={(e) => setStyleId(e.target.value)}>
            {STYLES.map((style) => (
              <option key={style.id} value={style.id}>
                {style.label}
              </option>
            ))}
          </select>
        </label>
        <pre className="media-prompt-out">{prompt}</pre>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => {
            void copyText(prompt).then((ok) => ok && setCopied('prompt'));
          }}
        >
          {copied === 'prompt' ? 'Copied to clipboard' : 'Copy prompt'}
        </button>
      </section>
    </div>
  );
}
