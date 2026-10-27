import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MediaPanel } from './components/MediaPanel';
import { PromptPanel } from './components/PromptPanel';
import { canExportInThisBrowser, exportMp4 } from './engine/export';
import { evalKeys } from './engine/easing';
import { parseRecipe } from './engine/parse';
import { createScene, drawSelection, selectionHandles, type HitBox, type Scene } from './engine/scene';
import type { Layer } from './engine/types';
import {
  deleteAsset,
  loadAssetUrls,
  putAsset,
  resolveImageUrl,
  updateAsset,
  type AssetRecord,
} from './lib/assets';
import {
  appendLine,
  deleteLayer,
  setNumber,
  setPosition,
  setProp,
  setText,
  setTimeRange,
  timecode,
  toggleKey,
} from './lib/edit';
import { playhead, previewFps, PreviewFps, Scrub, TimeLabel, usePlayhead, usePlayheadIn } from './lib/playhead';
import { formatTime } from './lib/time';
import { SAMPLE_RECIPE } from './sample';

type Aspect = '16:9' | '9:16';
type Quality = '1080p' | '720p';
type Tab = 'recipe' | 'prompt' | 'media';
/** Below ~1120 px the side panels become drawers; this says which one is open. */
type Pane = 'workspace' | 'inspector' | null;

const SIZE = (aspect: Aspect, quality: Quality) => {
  if (aspect === '16:9') {
    return quality === '1080p' ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
  }
  return quality === '1080p' ? { width: 1080, height: 1920 } : { width: 720, height: 1280 };
};

/** Pixel values in a recipe are authored against a 1080 px short side. */
const REFERENCE_SHORT_SIDE = 1080;
const DEFAULT_TEXT_SIZE = Math.round(REFERENCE_SHORT_SIDE * 0.098);

/** Ruler steps, in seconds. The first one wide enough to label wins. */
const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

/** Undo stack depth and the pause that separates one edit group from the next. */
const HISTORY_LIMIT = 100;
const HISTORY_PAUSE = 400;

const KIND_LABEL: Record<string, string> = {
  scene: 'Scene',
  text: 'Text',
  card: 'Card',
  image: 'Image',
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
      layers: Layer[];
      startX: number;
      startY: number;
      base: { layer: Layer; x: number; y: number }[];
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

/** A clip drag owns the window pointer listeners until it is released. */
interface ClipDrag {
  mode: 'move' | 'trim-l' | 'trim-r';
  startX: number;
  laneWidth: number;
  duration: number;
  snap: boolean;
  moved: boolean;
  items: { layer: Layer; start: number; end: number }[];
  ids: string[];
}

/** Nearest snap target within `threshold`, or null. */
function nearestSnap(points: number[], value: number, threshold: number): number | null {
  let best: number | null = null;
  let bestGap = threshold;
  for (const point of points) {
    const gap = Math.abs(point - value);
    if (gap <= bestGap) {
      bestGap = gap;
      best = point;
    }
  }
  return best;
}

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
  const [pane, setPane] = useState<Pane>(null);
  const [tlOpen, setTlOpen] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [tlBox, setTlBox] = useState(() => ({
    width: typeof window === 'undefined' ? 900 : Math.max(360, window.innerWidth - 620),
    label: 196,
  }));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [snapOn, setSnapOn] = useState(true);
  const [snapAt, setSnapAt] = useState<number | null>(null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [assetEpoch, setAssetEpoch] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timeRef = useRef(time);
  const playheadRef = useRef(time);
  const selectionRef = useRef<string[]>([]);
  const sceneRef = useRef<Scene | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const clipDrag = useRef<ClipDrag | null>(null);
  const pendingRaw = useRef<string | null>(null);
  const assetUrls = useRef(new Map<string, string>());
  const textInputRef = useRef<HTMLInputElement>(null);
  const tlScrollRef = useRef<HTMLDivElement>(null);

  /* ------------------------------- history -------------------------------- */

  // Undo is snapshot-based: the recipe string is the whole truth, so a stack of
  // previous strings is a complete undo record. Edits are grouped by a short
  // pause, which makes one drag — or one burst of typing — a single step.
  const history = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const committed = useRef(source);
  const sourceRef = useRef(source);
  const historyTimer = useRef<number | null>(null);
  const [historyDepth, setHistoryDepth] = useState({ past: 0, future: 0 });

  const syncHistory = () =>
    setHistoryDepth({ past: history.current.past.length, future: history.current.future.length });

  const pushPast = (snapshot: string) => {
    const stack = history.current;
    stack.past.push(snapshot);
    if (stack.past.length > HISTORY_LIMIT) stack.past.shift();
    stack.future.length = 0;
  };

  const flushHistory = () => {
    if (historyTimer.current !== null) {
      window.clearTimeout(historyTimer.current);
      historyTimer.current = null;
    }
    const now = sourceRef.current;
    if (now === committed.current) return;
    pushPast(committed.current);
    committed.current = now;
    syncHistory();
  };

  const undo = useCallback(() => {
    flushHistory();
    const previous = history.current.past.pop();
    if (previous === undefined) return;
    history.current.future.push(sourceRef.current);
    committed.current = previous;
    setSource(previous);
    syncHistory();
  }, []);

  const redo = useCallback(() => {
    flushHistory();
    const next = history.current.future.pop();
    if (next === undefined) return;
    history.current.past.push(sourceRef.current);
    committed.current = next;
    setSource(next);
    syncHistory();
  }, []);

  useEffect(() => {
    sourceRef.current = source;
    if (source === committed.current) return;
    if (historyTimer.current !== null) window.clearTimeout(historyTimer.current);
    historyTimer.current = window.setTimeout(() => {
      historyTimer.current = null;
      if (sourceRef.current === committed.current) return;
      pushPast(committed.current);
      committed.current = sourceRef.current;
      syncHistory();
    }, HISTORY_PAUSE);
    return () => {
      if (historyTimer.current !== null) {
        window.clearTimeout(historyTimer.current);
        historyTimer.current = null;
      }
    };
  }, [source]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return; // the source editor keeps its own native undo
      }
      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  const exportable = useMemo(() => canExportInThisBrowser(), []);
  const recipe = useMemo(() => parseRecipe(source), [source]);
  const recipeRef = useRef(recipe);
  useEffect(() => {
    recipeRef.current = recipe;
  }, [recipe]);
  const duration = Math.max(0.1, recipe.duration);

  const errors = recipe.issues.filter((i) => i.severity === 'error');
  const warnings = recipe.issues.filter((i) => i.severity === 'warn');

  const layers = useMemo(
    () => [...recipe.layers].sort((a, b) => a.start - b.start || a.z - b.z),
    [recipe],
  );
  const selectedId = selectedIds.length ? selectedIds[selectedIds.length - 1] : null;
  const selected = useMemo(
    () => (selectedId ? recipe.layers.find((l) => l.id === selectedId) ?? null : null),
    [selectedId, recipe],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  /** How many recipe lines point at each stored image. */
  const assetUsage = useMemo(() => {
    const map = new Map<string, number>();
    for (const layer of recipe.layers) {
      if (layer.kind !== 'image') continue;
      const id = layer.text.startsWith('asset:') ? layer.text.slice(6) : null;
      if (id) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }, [recipe]);

  const selectedAssetId =
    selected?.kind === 'image' && selected.text.startsWith('asset:') ? selected.text.slice(6) : null;
  const selectedAsset = useMemo(
    () => (selectedAssetId ? assets.find((asset) => asset.id === selectedAssetId) ?? null : null),
    [assets, selectedAssetId],
  );
  const selectedAssetUrl = selectedAssetId ? assetUrls.current.get(selectedAssetId) : undefined;

  // Timeline geometry. `zoom` widens the content; everything on the ruler, the
  // clips and the playhead is positioned from the same pixels-per-second.
  const laneViewport = Math.max(160, tlBox.width - tlBox.label - 18);
  const pxPerSec = Math.max(4, (laneViewport / Math.max(0.1, duration)) * zoom);
  const contentW = Math.max(laneViewport, Math.round(duration * pxPerSec));
  const tickStep = TICK_STEPS.find((step) => step * pxPerSec >= 62) ?? 120;
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = 0; t <= duration + 0.001; t = Number((t + tickStep).toFixed(3))) out.push(t);
    return out;
  }, [duration, tickStep]);

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
    if (!playing) {
      playheadRef.current = time;
      playhead.set(time);
    }
  }, [time, playing]);

  // Seed the readout store with the time the editor opens on.
  useEffect(() => {
    playhead.set(timeRef.current);
  }, []);

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
    const clamped = Math.min(playheadRef.current, duration);
    playheadRef.current = clamped;
    playhead.set(clamped);
    setTime((t) => Math.min(t, duration));
  }, [duration]);

  useEffect(() => {
    setConfirmDelete(false);
  }, [selectedId]);

  // Escape closes the drawer on narrow screens, the same way it dismisses any
  // modal surface. It stays out of the undo keydown handler on purpose.
  useEffect(() => {
    if (!pane) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPane(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pane]);

  // Assets arrive from IndexedDB once, then every decoded image bumps `assetEpoch`
  // so a paused frame can repaint itself.
  useEffect(() => {
    let alive = true;
    loadAssetUrls()
      .then(({ assets: rows, urls }) => {
        if (!alive) return;
        assetUrls.current = urls;
        setAssets(rows);
        setAssetEpoch((v) => v + 1);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const resolveImage = useCallback((src: string) => {
    if (!src) return null;
    const url = src.startsWith('asset:') ? assetUrls.current.get(src.slice(6)) : src;
    if (!url) return null;
    return resolveImageUrl(url, () => setAssetEpoch((v) => v + 1));
  }, []);

  // The timeline is laid out in pixels, not percentages, so that zoom can widen
  // the content and the ruler, clips and playhead stay on the same grid. The
  // label column can change width with a media query, so read it back on resize.
  useEffect(() => {
    const el = tlScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const label = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--label-col')) || 168;
      setTlBox({ width: el.clientWidth, label });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------ painting -------------------------------- */

  // The scene only depends on the recipe and the frame size, so build it once per
  // edit — not once per frame. Measured at 24 layers: rebuild 0.1 ms, paint 5–9 ms,
  // which is why the paint is the only work a playing preview should repeat.
  const size = useMemo(() => SIZE(aspect, quality), [aspect, quality]);
  const scene = useMemo(
    () => createScene(recipe, { width: size.width, height: size.height }, { resolveImage }),
    [recipe, size, resolveImage],
  );

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    selectionRef.current = selectedIds;
  }, [selectedIds]);

  // One painter for both modes. Paused previews go through React, but playback
  // paints straight from the animation loop so a frame never waits on a re-render.
  const paint = useCallback((at: number, withSelection: boolean) => {
    const canvas = canvasRef.current;
    const current = sceneRef.current;
    if (!canvas || !current) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    current.draw(ctx, at);
    const ids = selectionRef.current;
    if (!withSelection || !ids.length) return;
    const boxes = current.hits(at);
    for (const id of ids) {
      const box = boxes.find((b) => b.id === id);
      if (box) drawSelection(ctx, box, canvas.width);
    }
  }, []);

  // The backing store follows the export size, not the CSS box.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
  }, [size]);

  useEffect(() => {
    if (playing) return; // the animation loop owns the canvas while playing
    paint(Math.min(time, duration), true);
  }, [playing, time, duration, paint, scene, size, selectedIds, fontsReady, assetEpoch]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let windowStart = last;
    playheadRef.current = Math.min(timeRef.current, duration);
    const tick = (now: number) => {
      // Clamp the step so a stalled tab does not jump the playhead on resume.
      const delta = Math.min(0.25, (now - last) / 1000);
      last = now;
      const next = Math.min(duration, playheadRef.current + delta);
      playheadRef.current = next;
      timeRef.current = next;
      paint(next, false);

      // Only the readout subscribes to this — the app itself does not re-render.
      playhead.set(next);

      frames += 1;
      if (now - windowStart >= 500) {
        previewFps.set((frames * 1000) / (now - windowStart));
        frames = 0;
        windowStart = now;
      }

      if (next >= duration) {
        setTime(duration);
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      previewFps.set(0);
    };
  }, [playing, duration, paint]);

  const seekTo = useCallback(
    (value: number) => {
      const next = Math.max(0, Math.min(duration, value));
      playheadRef.current = next;
      timeRef.current = next;
      playhead.set(next);
      setTime(next);
      if (audioRef.current) audioRef.current.currentTime = next;
    },
    [duration],
  );

  const zoomBy = (factor: number) =>
    setZoom((value) => Math.min(8, Math.max(1, Number((value * factor).toFixed(2)))));

  // Scrubbing the ruler is the studio gesture everyone expects: press anywhere
  // on the scale, drag, release. Playback stops so the frame under the cursor is
  // the frame you see.
  const seekFromRuler = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setPlaying(false);
    const rect = event.currentTarget.getBoundingClientRect();
    const apply = (clientX: number) => {
      seekTo(Math.max(0, Math.min(duration, (clientX - rect.left) / pxPerSec)));
    };
    apply(event.clientX);
    const move = (ev: PointerEvent) => apply(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const togglePlay = useCallback(() => {
    if (playing) {
      // Park the UI exactly where the last painted frame is, so pausing does not
      // snap the playhead back to the last throttled tick.
      setTime(playhead.get());
      setPlaying(false);
      return;
    }
    const start = playheadRef.current >= duration - 0.01 ? 0 : playheadRef.current;
    playheadRef.current = start;
    timeRef.current = start;
    playhead.set(start);
    setTime(start);
    setPlaying(true);
  }, [playing, duration]);

  const selectLayer = useCallback(
    (layer: Layer, additive = false) => {
      setPlaying(false);
      if (additive) {
        setSelectedIds((prev) =>
          prev.includes(layer.id) ? prev.filter((id) => id !== layer.id) : [...prev, layer.id],
        );
        return;
      }
      setSelectedIds([layer.id]);
      seekTo(layer.start);
    },
    [seekTo],
  );

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

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        const targets = recipe.layers.filter((l) => selectedIds.includes(l.id));
        if (!targets.length) return;
        setSource((prev) => targets.reduce((src, target) => deleteLayer(src, target), prev));
        setSelectedIds([]);
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
  }, [togglePlay, selectedId, selectedIds, recipe]);

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
    const at = Math.min(playhead.get(), duration);
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
      setSelectedIds([]);
      return;
    }

    if (event.shiftKey) {
      setSelectedIds((prev) =>
        prev.includes(hit.id) ? prev.filter((id) => id !== hit.id) : [...prev, hit.id],
      );
      return;
    }

    const ids = selectedIds.includes(hit.id) ? selectedIds : [hit.id];
    setSelectedIds(ids);
    setPlaying(false);

    const base = ids
      .map((id) => recipe.layers.find((l) => l.id === id))
      .filter((l): l is Layer => Boolean(l))
      .map((l) => ({ layer: l, x: l.nums.x ?? 0.5, y: l.nums.y ?? 0.5 }));

    dragRef.current = {
      mode: 'move',
      layers: base.map((b) => b.layer),
      startX: point.x,
      startY: point.y,
      base,
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
      const fx = dx / point.width;
      const fy = dy / point.height;
      setSource((prev) => drag.base.reduce((src, item) => setPosition(src, item.layer, item.x + fx, item.y + fy), prev));
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
    const targets = recipe.layers.filter((l) => selectedIds.includes(l.id));
    setSource((prev) => targets.reduce((src, target) => deleteLayer(src, target), prev));
    setSelectedIds([]);
    setConfirmDelete(false);
  };

  /* ------------------------------ new layers ------------------------------- */

  // A new layer lands at the playhead and is selected for editing straight away.
  // The raw line is remembered so the next parse can hand back its real layer.
  const addLayerLine = useCallback(
    (spec: string) => {
      const start = Math.max(0, Math.min(playhead.get(), Math.max(0, duration - 0.1)));
      const end = start + 3;
      const line = `${timecode(start)} --> ${timecode(end)} ${spec}`;
      pendingRaw.current = line;
      setPlaying(false);
      setSource((prev) => appendLine(prev, line));
    },
    [duration],
  );

  useEffect(() => {
    const raw = pendingRaw.current;
    if (!raw) return;
    const layer = recipe.layers.find((l) => l.raw === raw);
    if (!layer) return;
    pendingRaw.current = null;
    setSelectedIds([layer.id]);
    seekTo(layer.start);
  }, [recipe, seekTo]);

  const addImage = async (files: FileList | File[] | undefined) => {
    const list = Array.from(files ?? []).filter((file) => file.type.startsWith('image/') || /\.svg$/i.test(file.name));
    if (!list.length) return;

    let first: AssetRecord | null = null;
    for (const file of list) {
      const record = await putAsset(file);
      assetUrls.current.set(record.id, URL.createObjectURL(file));
      setAssets((prev) => [record, ...prev]);
      first ??= record;
    }
    setAssetEpoch((v) => v + 1);
    if (first) insertAsset(first);
  };

  const insertAsset = (asset: AssetRecord) => {
    addLayerLine(
      `image "asset:${asset.id}" pos=0.5,0.56 w=0.62 fit=contain radius=24 shadow=0.45 bob=0.012 in=popIn`,
    );
  };

  const removeAsset = (asset: AssetRecord) => {
    const used = assetUsage.get(asset.id) ?? 0;
    const prompt = used
      ? `Delete "${asset.name}"? ${used} recipe line(s) use it and will show a placeholder.`
      : `Delete "${asset.name}" from this browser?`;
    if (!window.confirm(prompt)) return;
    void deleteAsset(asset.id);
    const url = assetUrls.current.get(asset.id);
    if (url) URL.revokeObjectURL(url);
    assetUrls.current.delete(asset.id);
    setAssets((prev) => prev.filter((row) => row.id !== asset.id));
    setAssetEpoch((v) => v + 1);
  };

  const patchAsset = (asset: AssetRecord, patch: { name?: string; prompt?: string }) => {
    setAssets((prev) => prev.map((row) => (row.id === asset.id ? { ...row, ...patch, id: row.id } : row)));
    void updateAsset(asset.id, patch);
  };

  /** Swaps the picture behind an existing `asset:` handle, keeping the shot as-is. */
  const replaceImage = async (file: File | undefined) => {
    if (!file || !selected || selected.kind !== 'image') return;
    const record = await putAsset(file);
    assetUrls.current.set(record.id, URL.createObjectURL(file));
    setAssets((prev) => [record, ...prev]);
    setAssetEpoch((v) => v + 1);
    setSource((prev) => setText(prev, selected, `asset:${record.id}`));
  };

  /* ------------------------------ keyframing ------------------------------- */

  const baseValue = (layer: Layer, prop: string) => {
    if (prop === 'x' || prop === 'y') return layer.nums[prop] ?? 0.5;
    if (prop === 'zoom') return layer.nums.zoom ?? 1;
    if (prop === 'scale' || prop === 'opacity') return 1;
    return 0;
  };

  const keyAtPlayhead = (layer: Layer, prop: string) => {
    const at = Math.min(playhead.get(), duration);
    return (layer.keys[prop] ?? []).some((k) => Math.abs(k.t - at) <= 0.05);
  };

  const toggleKeyAt = (prop: string) => {
    if (!selected) return;
    const at = Math.min(playhead.get(), duration);
    const value = evalKeys(selected.keys[prop], at, baseValue(selected, prop));
    setSource((prev) => toggleKey(prev, selected, prop, at, value));
  };

  /* ---------------------------- timeline drag ------------------------------ */

  const onClipMove = useCallback((event: PointerEvent) => {
    const drag = clipDrag.current;
    if (!drag) return;
    const dxPx = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(dxPx) < 2) return;
    drag.moved = true;

    const raw = (dxPx / drag.laneWidth) * drag.duration;
    const threshold = (8 / drag.laneWidth) * drag.duration;
    const primary = drag.items[0];
    let dt = raw;
    let line: number | null = null;

    if (drag.snap && primary) {
      const recipeNow = recipeRef.current;
      const points = [playhead.get(), 0, drag.duration];
      for (const layer of recipeNow.layers) {
        if (drag.ids.includes(layer.id)) continue;
        points.push(layer.start, layer.end);
      }
      const anchor = drag.mode === 'trim-r' ? primary.end : primary.start;
      const target = nearestSnap(points, anchor + raw, threshold);
      if (target !== null) {
        dt = target - anchor;
        line = target;
      }
    }

    setSnapAt(line);

    const next = drag.items.map((item) => {
      if (drag.mode === 'move') {
        const start = Math.max(0, item.start + dt);
        return { start, end: start + (item.end - item.start) };
      }
      if (drag.mode === 'trim-l') {
        const start = Math.max(0, Math.min(item.start + dt, item.end - 0.1));
        return { start, end: item.end };
      }
      const end = Math.max(item.start + 0.1, item.end + dt);
      return { start: item.start, end };
    });

    setSource((prev) =>
      drag.items.reduce((src, item, i) => setTimeRange(src, item.layer, next[i].start, next[i].end), prev),
    );
  }, []);

  const endClipDrag = useCallback(() => {
    clipDrag.current = null;
    setSnapAt(null);
    window.removeEventListener('pointermove', onClipMove);
    window.removeEventListener('pointerup', endClipDrag);
  }, [onClipMove]);

  const beginClipDrag = (
    event: React.PointerEvent<HTMLElement>,
    layer: Layer,
    mode: ClipDrag['mode'],
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const lane = (event.currentTarget.closest('.track-lane') as HTMLElement | null) ?? null;
    const laneWidth = lane?.getBoundingClientRect().width ?? 1;
    const inSelection = selectedIds.includes(layer.id);
    const ids = inSelection ? selectedIds : [layer.id];
    if (!inSelection) setSelectedIds([layer.id]);
    setPlaying(false);

    const items = recipe.layers
      .filter((l) => ids.includes(l.id))
      .map((l) => ({ layer: l, start: l.start, end: l.end }));
    if (!items.length) return;

    clipDrag.current = {
      mode,
      startX: event.clientX,
      laneWidth,
      duration,
      snap: snapOn,
      moved: false,
      items,
      ids,
    };
    window.addEventListener('pointermove', onClipMove);
    window.addEventListener('pointerup', endClipDrag);
  };

  useEffect(() => () => {
    window.removeEventListener('pointermove', onClipMove);
    window.removeEventListener('pointerup', endClipDrag);
  }, [onClipMove, endClipDrag]);

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
        resolveImage,
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
    selected && selected.kind === 'camera'
      ? ''
      : selected && selected.kind !== 'text' && selected.nums.w === undefined
        ? ''
        : selected
          ? selected.kind === 'text'
            ? Math.round(selected.nums.size ?? DEFAULT_TEXT_SIZE)
            : selected.nums.w!
          : '';

  return (
    <div className={`app ${tlOpen ? '' : 'is-tl-collapsed'}`}>
      <header className="topbar">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="mfMark" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#5A63C4" />
                <stop offset="1" stopColor="#8B93F8" />
              </linearGradient>
            </defs>
            <circle cx="16" cy="16" r="10.6" fill="none" stroke="url(#mfMark)" strokeWidth="2.5" />
            <polygon
              points="12.95,11.13 12.95,20.87 20.26,16"
              fill="url(#mfMark)"
              stroke="url(#mfMark)"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
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

        <div className="pane-tabs" role="group" aria-label="Panels">
          <button
            type="button"
            className={`btn btn-ghost btn-xs ${pane === 'workspace' ? 'is-on' : ''}`}
            aria-pressed={pane === 'workspace'}
            onClick={() => setPane((prev) => (prev === 'workspace' ? null : 'workspace'))}
          >
            Script
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn-xs ${pane === 'inspector' ? 'is-on' : ''}`}
            aria-pressed={pane === 'inspector'}
            onClick={() => setPane((prev) => (prev === 'inspector' ? null : 'inspector'))}
          >
            Layers
          </button>
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

      <main className="main" data-pane={pane ?? undefined}>
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
              <button
                type="button"
                aria-pressed={tab === 'media'}
                className="tab"
                onClick={() => setTab('media')}
              >
                Images
              </button>
            </div>
            <button
              type="button"
              className="panel-close"
              onClick={() => setPane(null)}
              aria-label="Close panel"
              title="Close panel"
            >
              ✕
            </button>
            {tab === 'recipe' && (
              <div className="panel-head-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-undo"
                  onClick={undo}
                  disabled={historyDepth.past === 0}
                  aria-label="Undo"
                  title="Undo (Ctrl+Z)"
                >
                  ↶
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-undo"
                  onClick={redo}
                  disabled={historyDepth.future === 0}
                  aria-label="Redo"
                  title="Redo (Ctrl+Shift+Z)"
                >
                  ↷
                </button>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    setSource(SAMPLE_RECIPE);
                    setSelectedIds([]);
                  }}
                >
                  Sample
                </button>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    setSource('');
                    setSelectedIds([]);
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
                  setSelectedIds([]);
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
          ) : tab === 'prompt' ? (
            <PromptPanel aspect={aspect} fps={fps} onOpenRecipe={() => setTab('recipe')} />
          ) : (
            <MediaPanel
              assets={assets}
              urls={assetUrls.current}
              usage={assetUsage}
              onUpload={addImage}
              onInsert={insertAsset}
              onDelete={removeAsset}
              onUpdate={patchAsset}
            />
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
            <TimeLabel />
            <Scrub
              duration={duration}
              onSeek={(value) => {
                setPlaying(false);
                seekTo(value);
              }}
            />
            <span className="time muted">{formatTime(duration)}</span>
            <PreviewFps />

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
            <button
              type="button"
              className="panel-close"
              onClick={() => setPane(null)}
              aria-label="Close panel"
              title="Close panel"
            >
              ✕
            </button>
          </div>

          <div className="panel-body">
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
                  <span>X</span>
                  <input
                    type="number"
                    step={0.005}
                    value={(selected.nums.x ?? 0.5).toFixed(3)}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isFinite(value)) return;
                      setSource((prev) => setPosition(prev, selected, value, selected.nums.y ?? 0.5));
                    }}
                  />
                </label>
                <label className="inspector-field">
                  <span>Y</span>
                  <input
                    type="number"
                    step={0.005}
                    value={(selected.nums.y ?? 0.5).toFixed(3)}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isFinite(value)) return;
                      setSource((prev) => setPosition(prev, selected, selected.nums.x ?? 0.5, value));
                    }}
                  />
                </label>
              </div>

              {selected.kind === 'camera' ? (
                <div className="inspector-row">
                  <label className="inspector-field">
                    <span>Zoom</span>
                    <input
                      type="number"
                      step={0.01}
                      min={0.5}
                      max={3}
                      value={(selected.nums.zoom ?? 1).toFixed(2)}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (!Number.isFinite(value)) return;
                        setSource((prev) => setNumber(prev, selected, 'zoom', value));
                      }}
                    />
                  </label>
                  <div className="inspector-field">
                    <span>Depth</span>
                    <input
                      type="number"
                      step={0.05}
                      min={0}
                      max={1}
                      value={(selected.nums.d ?? 1).toFixed(2)}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (!Number.isFinite(value)) return;
                        setSource((prev) => setNumber(prev, selected, 'd', value));
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="inspector-row">
                  <label className="inspector-field">
                    <span>{selected.kind === 'text' ? 'Size' : 'Width'}</span>
                    <input
                      type="number"
                      min={selected.kind === 'text' ? 1 : 0.005}
                      step={selected.kind === 'text' ? 1 : 0.01}
                      value={sizeValue}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (!Number.isFinite(value) || value <= 0) return;
                        if (selected.kind === 'text') {
                          setSource((prev) => setProp(prev, selected, 'size', String(Math.round(value))));
                          return;
                        }
                        setSource((prev) => setNumber(prev, selected, 'w', value));
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
              )}

              {selected.kind === 'image' && (
                <>
                  <div className="asset-card">
                    <span
                      className={`asset-thumb ${selectedAssetUrl ? '' : 'is-missing'}`}
                      style={selectedAssetUrl ? { backgroundImage: `url("${selectedAssetUrl}")` } : undefined}
                      aria-hidden="true"
                    />
                    <div className="asset-meta">
                      <strong>{selectedAsset?.name ?? 'Image not in this browser'}</strong>
                      <code>asset:{selectedAssetId ?? '—'}</code>
                      <span>
                        {selectedAsset
                          ? `used in ${assetUsage.get(selectedAsset.id) ?? 0} line(s)`
                          : 'the recipe still has the handle; upload it again to fill the frame'}
                      </span>
                    </div>
                    <label className="btn btn-ghost btn-xs asset-replace">
                      Replace
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          void replaceImage(e.target.files?.[0]);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                  </div>

                  <label className="inspector-field">
                    <span>Fit</span>
                    <select
                      value={selected.props.fit ?? 'contain'}
                      onChange={(e) => setSource((prev) => setProp(prev, selected, 'fit', e.target.value))}
                    >
                      <option value="contain">Contain — whole picture, letterboxed</option>
                      <option value="cover">Cover — fill the box, crop the rest</option>
                      <option value="fill">Fill — stretch to the box</option>
                    </select>
                  </label>
                </>
              )}

              {selected.kind !== 'camera' && selected.kind !== 'scene' && (
                <label className="inspector-field">
                  <span>Reveal</span>
                  <select
                    value={selected.props.reveal ?? 'none'}
                    onChange={(e) => setSource((prev) => setProp(prev, selected, 'reveal', e.target.value))}
                  >
                    <option value="none">None</option>
                    <option value="left">Wipe from left</option>
                    <option value="right">Wipe from right</option>
                    <option value="up">Wipe up</option>
                    <option value="down">Wipe down</option>
                  </select>
                </label>
              )}

              <div className="inspector-field">
                <span>Key at playhead</span>
                <div className="key-row">
                  {(selected.kind === 'camera' ? ['zoom', 'x', 'y'] : ['x', 'y', 'scale', 'opacity']).map((prop) => (
                    <button
                      key={prop}
                      type="button"
                      className={`key-chip ${keyAtPlayhead(selected, prop) ? 'is-on' : ''}`}
                      onClick={() => toggleKeyAt(prop)}
                      title={`Add or remove a ${prop} key at ${formatTime(time)}`}
                    >
                      {prop}
                    </button>
                  ))}
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
                {confirmDelete ? 'Really delete?' : selectedIds.length > 1 ? `Delete ${selectedIds.length} layers` : 'Delete layer'}
              </button>
            </div>
          )}

          <ul className="layer-list">
            {layers.map((layer) => (
              <LayerRow
                key={layer.id}
                layer={layer}
                selected={selectedSet.has(layer.id)}
                onSelect={selectLayer}
              />
            ))}
            {layers.length === 0 && <li className="layer-empty">No layers yet.</li>}
          </ul>
          </div>

          <div className="panel-foot">
            {done && <p className="note note-ok">Exported · {done}</p>}
            {notice && <p className="note note-warn">{notice}</p>}
            {error && <p className="note note-error">{error}</p>}
            {assets.length > 0 && (
              <p className="note asset-note">
                {assets.length} image{assets.length === 1 ? '' : 's'} in this browser
              </p>
            )}
            {!exportable && (
              <p className="note note-warn">This browser has no WebCodecs. Open in Chrome or Edge to export.</p>
            )}
          </div>
        </aside>
      </main>

      {pane && <button className="pane-scrim" aria-label="Close panel" onClick={() => setPane(null)} />}

      <footer className={`timeline ${tlOpen ? '' : 'is-collapsed'}`} aria-label="Timeline">
        <div className="tl-bar">
          <div className="tl-add">
            <span className="tl-add-label">Add</span>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => addLayerLine('text "New line" pos=0.5,0.5 size=96 in=charIn')}
            >
              + Text
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() =>
                addLayerLine('shape rect pos=0.5,0.5 w=0.3 h=0.12 radius=18 color=#5A63C4 in=popIn')
              }
            >
              + Shape
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => addLayerLine('card pos=0.5,0.5 w=0.52 h=0.3 radius=28 shadow=0.5 in=slideU')}
            >
              + Card
            </button>
            <label className="btn btn-ghost btn-xs add-file">
              + Image
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  void addImage(e.target.files ?? undefined);
                  e.currentTarget.value = '';
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => addLayerLine('camera x=0.5 y=0.5 zoom=1.03')}
            >
              + Camera
            </button>
          </div>

          <div className="tl-tools">
            <div className="tl-zoom" role="group" aria-label="Timeline zoom">
              <button
                type="button"
                className="tl-zoom-btn"
                onClick={() => zoomBy(1 / 1.6)}
                disabled={zoom <= 1}
                aria-label="Zoom out"
                title="Zoom out"
              >
                −
              </button>
              <button
                type="button"
                className="tl-zoom-value"
                onClick={() => setZoom(1)}
                title="Back to fit"
              >
                {zoom <= 1.001 ? 'Fit' : `${zoom.toFixed(1)}×`}
              </button>
              <button
                type="button"
                className="tl-zoom-btn"
                onClick={() => zoomBy(1.6)}
                disabled={zoom >= 8}
                aria-label="Zoom in"
                title="Zoom in"
              >
                +
              </button>
            </div>
            <span className="tl-time">{formatTime(time)}</span>
            <button
              type="button"
              className={`btn btn-ghost btn-xs addbar-snap ${snapOn ? 'is-on' : ''}`}
              aria-pressed={snapOn}
              onClick={() => setSnapOn((v) => !v)}
              title="Snap cuts to the playhead and to other cuts"
            >
              Snap
            </button>
            <button
              type="button"
              className="tl-collapse"
              onClick={() => setTlOpen((v) => !v)}
              aria-expanded={tlOpen}
              aria-label={tlOpen ? 'Collapse timeline' : 'Expand timeline'}
              title={tlOpen ? 'Collapse timeline' : 'Expand timeline'}
            >
              {tlOpen ? '▾' : '▴'}
            </button>
          </div>
        </div>

        <div className="tl-scroll" ref={tlScrollRef}>
          <div className="tl-content" style={{ width: tlBox.label + contentW }}>
            <div className="tl-row tl-ruler-row">
              <div className="tl-corner">
                <span className="tl-corner-time">{formatTime(time)}</span>
                <span className="tl-corner-meta">{layers.length} layers</span>
              </div>
              <div
                className="ruler"
                style={
                  {
                    width: contentW,
                    '--minor': `${Math.max(10, (tickStep * pxPerSec) / 4)}px`,
                  } as React.CSSProperties
                }
                onPointerDown={seekFromRuler}
                role="slider"
                tabIndex={0}
                aria-label="Timeline ruler"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Number(time.toFixed(2))}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft') seekTo(time - (event.shiftKey ? 1 : 0.1));
                  if (event.key === 'ArrowRight') seekTo(time + (event.shiftKey ? 1 : 0.1));
                }}
              >
                {ticks.map((t) => (
                  <span key={t} className="tick" style={{ left: t * pxPerSec, transform: t === 0 ? 'none' : undefined }}>
                    {tickLabel(t)}
                  </span>
                ))}
              </div>
            </div>

            {layers.map((layer) => {
              const thumb = layer.kind === 'image' && layer.text.startsWith('asset:')
                ? assetUrls.current.get(layer.text.slice(6))
                : undefined;
              return (
                <div
                  className={`tl-row track ${selectedSet.has(layer.id) ? 'is-selected' : ''}`}
                  key={`t-${layer.id}`}
                  onClick={(event) => selectLayer(layer, event.shiftKey)}
                >
                  <div className="track-label">
                    <span className={`dot dot-${layer.kind}`} aria-hidden="true" />
                    <span className="track-name">{layerLabel(layer)}</span>
                    <span className="track-dur">{formatTime(layer.end - layer.start)}</span>
                  </div>
                  <div
                    className="track-lane"
                    style={{ width: contentW }}
                    onPointerDown={(event) => {
                      if (event.target === event.currentTarget) setSelectedIds([]);
                    }}
                  >
                    <div
                      className={`clip clip-${layer.kind}`}
                      style={{
                        left: layer.start * pxPerSec,
                        width: Math.max(10, (layer.end - layer.start) * pxPerSec),
                      }}
                      onPointerDown={(event) => beginClipDrag(event, layer, 'move')}
                      title={`${formatTime(layer.start)} → ${formatTime(layer.end)}`}
                    >
                      <span
                        className="clip-grip grip-l"
                        onPointerDown={(event) => beginClipDrag(event, layer, 'trim-l')}
                      />
                      <span
                        className="clip-grip grip-r"
                        onPointerDown={(event) => beginClipDrag(event, layer, 'trim-r')}
                      />
                      {thumb && <span className="clip-thumb" style={{ backgroundImage: `url("${thumb}")` }} />}
                      <span className="clip-name">{layerLabel(layer)}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {layers.length === 0 && <p className="track-empty">Nothing on the timeline yet.</p>}

            <TimelineCursor duration={duration} pxPerSec={pxPerSec} labelW={tlBox.label} />
            {snapAt !== null && (
              <div className="snap-line" style={{ left: tlBox.label + snapAt * pxPerSec }} />
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

/** A layer row subscribes to the playhead itself, so the live highlight costs
 *  nothing until the playhead actually crosses this layer's span. */
function LayerRow({
  layer,
  selected,
  onSelect,
}: {
  layer: Layer;
  selected: boolean;
  onSelect: (layer: Layer, additive?: boolean) => void;
}) {
  const live = usePlayheadIn(layer.start, layer.end);
  return (
    <li
      className={`layer-row ${live ? 'is-live' : ''} ${selected ? 'is-selected' : ''}`}
      onClick={(event) => onSelect(layer, event.shiftKey)}
    >
      <span className={`dot dot-${layer.kind}`} aria-hidden="true" />
      <span className="layer-name">{layerLabel(layer)}</span>
      <span className="layer-time">{formatTime(layer.start)}</span>
    </li>
  );
}

/** Ruler label: seconds until a minute, then m:ss. */
function tickLabel(seconds: number) {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return `${minutes}:${String(rest).padStart(2, '0')}`;
  }
  return Number.isInteger(seconds) ? `${seconds}s` : `${Number(seconds.toFixed(2))}s`;
}

/**
 * The playhead subscribes to the clock directly, so dragging or playing moves a
 * single 1 px line instead of re-rendering the whole timeline.
 */
function TimelineCursor({
  duration,
  pxPerSec,
  labelW,
}: {
  duration: number;
  pxPerSec: number;
  labelW: number;
}) {
  const at = Math.min(usePlayhead(), duration);
  return (
    <div className="tl-cursor" style={{ left: labelW + at * pxPerSec }} aria-hidden="true">
      <span className="tl-cursor-head" />
    </div>
  );
}
