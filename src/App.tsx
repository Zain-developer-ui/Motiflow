import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PromptPanel } from './components/PromptPanel';
import { canExportInThisBrowser, exportMp4 } from './engine/export';
import { parseRecipe } from './engine/parse';
import { createScene, drawSelection, selectionHandles, type HitBox, type Scene } from './engine/scene';
import type { Layer } from './engine/types';
import { deleteLayer, setNumber, setPosition, setProp, setText } from './lib/edit';
import { SAMPLE_RECIPE } from './sample';

type Aspect = '16:9' | '9:16';
type Quality = '1080p' | '720p';
type Tab = 'recipe' | 'prompt';

const SIZE = (aspect: Aspect, quality: Quality) => {
  if (aspect === '16:9') {
    return quality === '1080p' ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
  }
  return quality === '1080p' ? { width: 1080, height: 1920 } : { width: 720, height: 1280 };
};

/** Pixel values in a recipe are authored against a 1080 px short side. */
const REFERENCE_SHORT_SIDE = 1080;
const DEFAULT_TEXT_SIZE = Math.round(REFERENCE_SHORT_SIDE * 0.098);

const formatTime = (t: number) => {
  const safe = Math.max(0, t);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  const cents = Math.floor((safe % 1) * 100);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(cents).padStart(2, '0')}`;
};

const KIND_LABEL: Record<string, string> = {
  scene: 'Scene',
  text: 'Text',
  card: 'Card',
  camera: 'Camera',
  shape: 'Shape',
};

const layerLabel = (layer: Layer) => {
  if (layer.kind === 'text') return layer.text || 'Text';
  return `${KIND_LABEL[layer.kind]}${layer.shape ? ` · ${layer.shape}` : ''}`;
};

// The recipe *is* the project, so a reload must not throw it away. Everything
// stays in this browser; there is no account and no upload.
const PROJECT_KEY = 'motiflow.project.v1';

interface ProjectDraft {
  source: string;
  aspect: Aspect;
  quality: Quality;
  fps: 30 | 60;
}

function readProject(): Partial<ProjectDraft> {
  try {
    const raw = localStorage.getItem(PROJECT_KEY);
    if (!raw) return {};
    const value = JSON.parse(raw) as Partial<ProjectDraft> | null;
    if (!value || typeof value !== 'object') return {};
    return {
      source: typeof value.source === 'string' ? value.source : undefined,
      aspect: value.aspect === '9:16' || value.aspect === '16:9' ? value.aspect : undefined,
      quality: value.quality === '1080p' || value.quality === '720p' ? value.quality : undefined,
      fps: value.fps === 60 ? 60 : value.fps === 30 ? 30 : undefined,
    };
  } catch {
    return {};
  }
}

type Drag =
  | {
      mode: 'move';
      layer: Layer;
      startX: number;
      startY: number;
      baseX: number;
      baseY: number;
      moved: boolean;
    }
  | {
      mode: 'resize';
      layer: Layer;
      cx: number;
      cy: number;
      startDist: number;
      baseW: number;
      baseH: number;
      hasH: boolean;
    };

export default function App() {
  const project = useMemo(readProject, []);
  const [source, setSource] = useState(project.source ?? SAMPLE_RECIPE);
  const [aspect, setAspect] = useState<Aspect>(project.aspect ?? '16:9');
  const [quality, setQuality] = useState<Quality>(project.quality ?? '1080p');
  const [fps, setFps] = useState<30 | 60>(project.fps ?? 30);
  const [time, setTime] = useState(1.6);
  const [playing, setPlaying] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('recipe');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timeRef = useRef(time);
  const sceneRef = useRef<Scene | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const exportable = useMemo(() => canExportInThisBrowser(), []);
  const recipe = useMemo(() => parseRecipe(source), [source]);
  const duration = Math.max(0.1, recipe.duration);

  const errors = recipe.issues.filter((i) => i.severity === 'error');
  const warnings = recipe.issues.filter((i) => i.severity === 'warn');

  const layers = recipe.layers.filter((l) => l.kind !== 'camera');
  const selected = useMemo(
    () => (selectedId ? recipe.layers.find((l) => l.id === selectedId) ?? null : null),
    [selectedId, recipe],
  );

  useEffect(() => {
    document.fonts.ready.then(() => setFontsReady(true));
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const next: ProjectDraft = { source, aspect, quality, fps };
      try {
        localStorage.setItem(PROJECT_KEY, JSON.stringify(next));
      } catch {
        // Quota or private mode — the editor still works, it just will not restore.
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [source, aspect, quality, fps]);

  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  useEffect(() => {
    if (!audioFile) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(audioFile);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  // Load — or unload — the element whenever the track changes. Clearing the
  // `src` attribute is not enough: a media element keeps playing what it has
  // already buffered unless it is paused and reloaded.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!audioUrl) {
      el.pause();
      el.removeAttribute('src');
      el.load();
      return;
    }
    el.src = audioUrl;
    el.load();
  }, [audioUrl]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!playing || !audioUrl) {
      el.pause();
      return;
    }
    if (Math.abs(el.currentTime - timeRef.current) > 0.25) {
      try {
        el.currentTime = Math.max(0, timeRef.current);
      } catch {
        // Metadata has not arrived yet; playback will start at 0.
      }
    }
    void el.play().catch(() => undefined);
  }, [playing, audioUrl]);

  useEffect(() => {
    setTime((t) => Math.min(t, duration));
  }, [duration]);

  useEffect(() => {
    setConfirmDelete(false);
  }, [selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = SIZE(aspect, quality);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const scene = createScene(recipe, { width, height });
    sceneRef.current = scene;

    const at = Math.min(time, duration);
    scene.draw(ctx, at);

    if (selectedId) {
      const box = scene.hits(at).find((b) => b.id === selectedId);
      if (box) drawSelection(ctx, box, width);
    }
  }, [recipe, time, aspect, quality, fontsReady, duration, selectedId]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      setTime((prev) => {
        const next = prev + delta;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  const togglePlay = useCallback(() => {
    setTime((t) => (t >= duration - 0.01 ? 0 : t));
    setPlaying((p) => !p);
  }, [duration]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT')) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        togglePlay();
        return;
      }

      const layer = selectedId ? recipe.layers.find((l) => l.id === selectedId) : null;
      if (!layer) return;

      if (event.key === 'Delete') {
        event.preventDefault();
        setSource((prev) => deleteLayer(prev, layer));
        setSelectedId(null);
        return;
      }

      const step = event.shiftKey ? 0.02 : 0.002;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      if (dx || dy) {
        event.preventDefault();
        setSource((prev) =>
          setPosition(prev, layer, (layer.nums.x ?? 0.5) + dx, (layer.nums.y ?? 0.5) + dy),
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, selectedId, recipe]);

  /* ----------------------------- canvas editing ---------------------------- */

  const canvasBox = () => {
    const canvas = canvasRef.current;
    const { width, height } = SIZE(aspect, quality);
    const rect = canvas?.getBoundingClientRect();
    return {
      rect,
      width,
      height,
      scale: rect && rect.width ? width / rect.width : 1,
    };
  };

  const pointFrom = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { rect, width, height } = canvasBox();
    if (!rect) return { x: 0, y: 0, scale: 1, width, height };
    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height,
      scale: width / rect.width,
      width,
      height,
    };
  };

  const hitTest = (boxes: HitBox[], x: number, y: number) =>
    boxes.find((box) => Math.abs(x - box.x) <= box.w / 2 && Math.abs(y - box.y) <= box.h / 2);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const point = pointFrom(event);
    const at = Math.min(time, duration);
    const boxes = scene.hits(at);

    // Corner handles of the current selection take priority over layer hits.
    if (selectedId) {
      const box = boxes.find((b) => b.id === selectedId);
      const layer = recipe.layers.find((l) => l.id === selectedId);
      if (box && layer) {
        const radius = Math.max(22 * point.scale, box.w * 0.03);
        const onHandle = selectionHandles(box).some((h) => Math.hypot(h.x - point.x, h.y - point.y) <= radius);
        if (onHandle) {
          // Screen px → authored px, which are relative to a 1080 short side.
          const ratio = (point.scale * REFERENCE_SHORT_SIDE) / Math.min(point.width, point.height);
          dragRef.current = {
            mode: 'resize',
            layer,
            cx: box.x,
            cy: box.y,
            startDist: Math.max(24 * point.scale, Math.hypot(point.x - box.x, point.y - box.y)),
            baseW: layer.kind === 'text' ? layer.nums.size ?? DEFAULT_TEXT_SIZE : box.bw * ratio,
            baseH: box.bh * ratio,
            hasH: layer.nums.h !== undefined,
          };
          setPlaying(false);
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* synthetic events have no active pointer to capture */
          }
          return;
        }
      }
    }

    const hit = hitTest(boxes, point.x, point.y);
    if (!hit) {
      setSelectedId(null);
      return;
    }

    setSelectedId(hit.id);
    setPlaying(false);

    const layer = recipe.layers.find((l) => l.id === hit.id);
    if (!layer) return;

    dragRef.current = {
      mode: 'move',
      layer,
      startX: point.x,
      startY: point.y,
      baseX: layer.nums.x ?? 0.5,
      baseY: layer.nums.y ?? 0.5,
      moved: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic events have no active pointer to capture */
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointFrom(event);

    if (drag.mode === 'move') {
      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 3 * point.scale) return;
      drag.moved = true;
      const nx = drag.baseX + dx / point.width;
      const ny = drag.baseY + dy / point.height;
      setSource((prev) => setPosition(prev, drag.layer, nx, ny));
      return;
    }

    const dist = Math.hypot(point.x - drag.cx, point.y - drag.cy);
    const factor = Math.min(8, Math.max(0.15, dist / drag.startDist));
    const { layer } = drag;

    if (layer.kind === 'text') {
      setSource((prev) => setNumber(prev, layer, 'size', Math.round(drag.baseW * factor)));
      return;
    }

    setSource((prev) => {
      let next = setNumber(prev, layer, 'w', Math.round(drag.baseW * factor));
      if (drag.hasH) next = setNumber(next, layer, 'h', Math.round(drag.baseH * factor));
      return next;
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* nothing captured */
    }
  };

  /* -------------------------------- actions ------------------------------- */

  const bringForward = () => {
    if (!selected) return;
    const others = recipe.layers.filter((l) => l.kind !== 'camera' && l.id !== selected.id);
    const above = others.filter((l) => l.z > selected.z).sort((a, b) => a.z - b.z)[0];
    const target = above ? above.z + 1 : selected.z + 1;
    setSource((prev) => setProp(prev, selected, 'z', String(target)));
  };

  const sendBackward = () => {
    if (!selected) return;
    const others = recipe.layers.filter((l) => l.kind !== 'camera' && l.id !== selected.id);
    const below = others.filter((l) => l.z < selected.z).sort((a, b) => b.z - a.z)[0];
    const target = below ? below.z - 1 : selected.z - 1;
    setSource((prev) => setProp(prev, selected, 'z', String(target)));
  };

  const removeSelected = () => {
    if (!selected) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 3200);
      return;
    }
    setSource((prev) => deleteLayer(prev, selected));
    setSelectedId(null);
    setConfirmDelete(false);
  };

  const handleExport = async () => {
    if (exporting) return;
    setError(null);
    setDone(null);
    setNotice(null);
    setProgress(0);
    setStage('Preparing');
    setExporting(true);
    try {
      const { width, height } = SIZE(aspect, quality);
      const result = await exportMp4({
        recipe,
        width,
        height,
        fps,
        bitrate: 8_000_000,
        audio: audioFile,
        onProgress: (ratio, label) => {
          setProgress(ratio);
          setStage(label);
        },
      });
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `motiflow-${Date.now()}.mp4`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      const mb = (result.blob.size / 1024 / 1024).toFixed(1);
      const audioLabel = result.hasAudio ? ' · audio' : '';
      setDone(`${result.frames} frames · ${mb} MB${audioLabel} · ${(result.ms / 1000).toFixed(1)}s`);
      setNotice(result.audioWarning ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
      setStage('');
    }
  };

  const sizeValue =
    selected && selected.kind !== 'text' && selected.nums.w === undefined
      ? ''
      : selected
        ? Math.round(selected.nums.size ?? selected.nums.w ?? DEFAULT_TEXT_SIZE)
        : '';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Motiflow</span>
          <span className="brand-tag">Write motion.</span>
        </div>

        <div className="settings">
          <label className="field">
            <span>Aspect</span>
            <select value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)}>
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
            </select>
          </label>
          <label className="field">
            <span>Size</span>
            <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
              <option value="1080p">1080p</option>
              <option value="720p">720p</option>
            </select>
          </label>
          <label className="field">
            <span>FPS</span>
            <select value={fps} onChange={(e) => setFps(Number(e.target.value) as 30 | 60)}>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </label>
        </div>

        <div className="top-actions">
          {exporting ? (
            <div className="export-progress" role="status" aria-live="polite">
              <span>{stage}</span>
              <div className="bar">
                <div className="fill" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <span className="pct">{Math.round(progress * 100)}%</span>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={handleExport} disabled={!exportable || !!errors.length}>
              Export MP4
            </button>
          )}
        </div>
      </header>

      <main className="main">
        <section className="panel panel-left" aria-label="Workspace">
          <div className="panel-head">
            <div className="tabs" aria-label="Workspace">
              <button
                type="button"
                aria-pressed={tab === 'recipe'}
                className="tab"
                onClick={() => setTab('recipe')}
              >
                Recipe
              </button>
              <button
                type="button"
                aria-pressed={tab === 'prompt'}
                className="tab"
                onClick={() => setTab('prompt')}
              >
                Prompt
              </button>
            </div>
            {tab === 'recipe' && (
              <div className="panel-head-actions">
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    setSource(SAMPLE_RECIPE);
                    setSelectedId(null);
                  }}
                >
                  Sample
                </button>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    setSource('');
                    setSelectedId(null);
                  }}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {tab === 'recipe' ? (
            <div className="recipe-body">
              <textarea
                className="code"
                spellCheck={false}
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setSelectedId(null);
                }}
                aria-label="Recipe source"
                placeholder={
                  'v1\n00:00.00 --> 00:04.00 scene bg=#0B0F14\n00:00.20 --> 00:04.00 text "Hello" pos=0.5,0.5 size=96 in=charIn'
                }
              />

              <div className="issues" aria-live="polite">
                {errors.length === 0 && warnings.length === 0 && (
                  <p className="issue issue-ok">
                    {layers.length} layers · {formatTime(recipe.duration)}
                  </p>
                )}
                {errors.slice(0, 4).map((issue, i) => (
                  <p className="issue issue-error" key={`e${i}`}>
                    <span>Line {issue.line}</span> {issue.message}
                  </p>
                ))}
                {warnings.slice(0, 3).map((issue, i) => (
                  <p className="issue issue-warn" key={`w${i}`}>
                    <span>Line {issue.line}</span> {issue.message}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <PromptPanel aspect={aspect} fps={fps} onOpenRecipe={() => setTab('recipe')} />
          )}
        </section>

        <section className="stage" aria-label="Preview">
          <div className={`canvas-frame ${aspect === '9:16' ? 'portrait' : 'landscape'} ${selected ? 'is-editing' : ''}`}>
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onDoubleClick={() => {
                if (selected?.kind === 'text') textInputRef.current?.focus();
              }}
            />
          </div>

          <div className="transport">
            <button className="btn btn-icon" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? '❚❚' : '▶'}
            </button>
            <span className="time">{formatTime(time)}</span>
            <input
              className="scrub"
              type="range"
              min={0}
              max={duration}
              step={0.01}
              value={Math.min(time, duration)}
              onChange={(e) => {
                const next = Number(e.target.value);
                setPlaying(false);
                setTime(next);
                if (audioRef.current) audioRef.current.currentTime = next;
              }}
              aria-label="Playhead"
            />
            <span className="time muted">{formatTime(duration)}</span>

            <label
              className={`audio-btn ${audioFile ? 'has-audio' : ''}`}
              title={audioFile?.name ?? 'Add an audio track'}
            >
              <input type="file" accept="audio/*" onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)} />
              <span aria-hidden="true">♪</span>
              <span className="audio-name">{audioFile ? audioFile.name : 'Audio'}</span>
            </label>
            {audioFile && (
              <button
                className="audio-clear"
                onClick={() => {
                  audioRef.current?.pause();
                  setAudioFile(null);
                }}
                aria-label="Remove audio"
              >
                ✕
              </button>
            )}
            <audio ref={audioRef} preload="auto" />
          </div>
        </section>

        <aside className="panel panel-right" aria-label="Layers">
          <div className="panel-head">
            <div>
              <h2>{selected ? 'Selected' : 'Layers'}</h2>
              <p className="hint">{selected ? layerLabel(selected) : `${layers.length} in this recipe`}</p>
            </div>
          </div>

          {selected && (
            <div className="inspector">
              {selected.kind === 'text' && (
                <label className="inspector-field">
                  <span>Text</span>
                  <input
                    ref={textInputRef}
                    value={selected.text}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSource((prev) => setText(prev, selected, value));
                    }}
                  />
                </label>
              )}

              <div className="inspector-row">
                <label className="inspector-field">
                  <span>{selected.kind === 'text' ? 'Size' : 'Width'}</span>
                  <input
                    type="number"
                    min={1}
                    value={sizeValue}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isFinite(value) || value < 1) return;
                      const key = selected.kind === 'text' ? 'size' : 'w';
                      setSource((prev) => setProp(prev, selected, key, String(Math.round(value))));
                    }}
                  />
                </label>

                <div className="inspector-field">
                  <span>Stack</span>
                  <div className="inspector-buttons">
                    <button type="button" onClick={bringForward} title="Bring forward">
                      ↑
                    </button>
                    <button type="button" onClick={sendBackward} title="Send backward">
                      ↓
                    </button>
                  </div>
                </div>
              </div>

              {(selected.keys.x?.length || selected.keys.y?.length) && (
                <p className="inspector-hint">Position is animated by <code>keys=</code> — dragging won't stick.</p>
              )}

              <button
                type="button"
                className={`btn btn-xs inspector-delete ${confirmDelete ? 'is-confirming' : ''}`}
                onClick={removeSelected}
              >
                {confirmDelete ? 'Really delete?' : 'Delete layer'}
              </button>
            </div>
          )}

          <ul className="layer-list">
            {layers.map((layer) => (
              <li
                key={layer.id}
                className={`layer-row ${time >= layer.start && time <= layer.end ? 'is-live' : ''} ${
                  layer.id === selectedId ? 'is-selected' : ''
                }`}
                onClick={() => {
                  setPlaying(false);
                  setSelectedId(layer.id);
                  setTime(Math.min(Math.max(layer.start, 0), duration));
                }}
              >
                <span className={`dot dot-${layer.kind}`} aria-hidden="true" />
                <span className="layer-name">{layerLabel(layer)}</span>
                <span className="layer-time">{formatTime(layer.start)}</span>
              </li>
            ))}
            {layers.length === 0 && <li className="layer-empty">No layers yet.</li>}
          </ul>

          <div className="panel-foot">
            {done && <p className="note note-ok">Exported · {done}</p>}
            {notice && <p className="note note-warn">{notice}</p>}
            {error && <p className="note note-error">{error}</p>}
            {!exportable && (
              <p className="note note-warn">This browser has no WebCodecs. Open in Chrome or Edge to export.</p>
            )}
          </div>
        </aside>
      </main>

      <footer className="timeline" aria-label="Timeline">
        <div className="ruler">
          {Array.from({ length: Math.floor(duration) + 1 }).map((_, i) => (
            <span key={i} className="tick" style={{ left: `${(i / Math.max(1, duration)) * 100}%` }}>
              {i}s
            </span>
          ))}
          <span className="playhead" style={{ left: `${(Math.min(time, duration) / Math.max(0.1, duration)) * 100}%` }} />
        </div>

        <div className="tracks">
          {layers.map((layer) => {
            const left = (layer.start / Math.max(0.1, duration)) * 100;
            const width = ((layer.end - layer.start) / Math.max(0.1, duration)) * 100;
            return (
              <div
                className={`track ${layer.id === selectedId ? 'is-selected' : ''}`}
                key={`t-${layer.id}`}
                onClick={() => setSelectedId(layer.id)}
              >
                <span className="track-label">
                  <span className={`dot dot-${layer.kind}`} aria-hidden="true" />
                  {layer.kind === 'text' ? layer.text.slice(0, 28) || 'Text' : `${KIND_LABEL[layer.kind]}${layer.shape ? ` · ${layer.shape}` : ''}`}
                </span>
                <div className="track-lane">
                  <div className={`clip clip-${layer.kind}`} style={{ left: `${left}%`, width: `${Math.max(0.6, width)}%` }} />
                </div>
              </div>
            );
          })}
          {layers.length === 0 && <p className="track-empty">Nothing on the timeline yet.</p>}
        </div>
      </footer>
    </div>
  );
}
