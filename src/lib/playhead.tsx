import { useCallback, useSyncExternalStore } from 'react';
import { formatTime } from './time';

// The playhead deliberately lives outside React state.
//
// A playing preview paints the canvas from its own animation loop. If the time
// also lived in App state, every frame would re-render the recipe editor, the
// inspector and all 24 layer rows before the next frame could be drawn — which
// is what made previews choppy. Here only the three controls that actually show
// the time re-render, and a layer row re-renders only when the playhead crosses
// its start or end.
let seconds = 0;
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const playhead = {
  get: () => seconds,
  set(next: number) {
    if (!Number.isFinite(next) || next === seconds) return;
    seconds = next;
    for (const fn of listeners) fn();
  },
};

/** Seconds of playhead, subscribed. */
export const usePlayhead = () => useSyncExternalStore(subscribe, playhead.get, playhead.get);

/** True only while the playhead sits inside a layer span. */
export const usePlayheadIn = (start: number, end: number) => {
  const read = useCallback(() => {
    const t = playhead.get();
    return t >= start && t <= end;
  }, [start, end]);
  return useSyncExternalStore(subscribe, read, read);
};

export function TimeLabel({ className = 'time' }: { className?: string }) {
  return <span className={className}>{formatTime(usePlayhead())}</span>;
}

export function Scrub({ duration, onSeek }: { duration: number; onSeek: (value: number) => void }) {
  const value = usePlayhead();
  return (
    <input
      className="scrub"
      type="range"
      min={0}
      max={duration}
      step={0.01}
      value={Math.min(value, duration)}
      onChange={(event) => onSeek(Number(event.target.value))}
      aria-label="Playhead"
    />
  );
}

export function TimelinePlayhead({ duration }: { duration: number }) {
  const left = (Math.min(usePlayhead(), duration) / Math.max(0.1, duration)) * 100;
  return <span className="playhead" style={{ left: `${left}%` }} />;
}

// Preview frame rate, published by the playback loop twice a second. Showing it
// turns "is the preview smooth?" into a number the user can read.
let fps = 0;
const fpsListeners = new Set<() => void>();
const subscribeFps = (fn: () => void) => {
  fpsListeners.add(fn);
  return () => {
    fpsListeners.delete(fn);
  };
};

export const previewFps = {
  get: () => fps,
  set(next: number) {
    const rounded = next > 0 ? Math.max(1, Math.round(next)) : 0;
    if (rounded === fps) return;
    fps = rounded;
    for (const fn of fpsListeners) fn();
  },
};

export function PreviewFps() {
  const value = useSyncExternalStore(subscribeFps, previewFps.get, previewFps.get);
  // Always rendered: unmounting the readout re-flowed the transport, which
  // narrowed the scrub bar by its width every time playback started.
  return (
    <span className="fps" title="Preview frames per second" aria-hidden={value === 0}>
      {value ? `${value} fps` : null}
    </span>
  );
}
