import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { createScene } from './scene';
import type { Recipe } from './types';

export interface ExportOptions {
  recipe: Recipe;
  width: number;
  height: number;
  fps: number;
  bitrate?: number;
  audio?: File | null;
  /** Resolves `asset:` handles so image layers render in the exported file. */
  resolveImage?: (src: string) => HTMLImageElement | null;
  onProgress?: (ratio: number, stage: string) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  extension: 'mp4';
  frames: number;
  ms: number;
  hasAudio: boolean;
  /** Set when an audio track was supplied but could not be muxed. */
  audioWarning?: string;
}

const VIDEO_CODECS = ['avc1.640028', 'avc1.4D0028', 'avc1.42E01F'];
const AUDIO_SAMPLE_RATE = 48_000;
const AUDIO_CHANNELS = 2;
const AUDIO_BITRATE = 160_000;

interface AudioPlan {
  left: Float32Array;
  right: Float32Array;
  frames: number;
  sampleRate: number;
  channels: number;
}

/**
 * Renders the recipe frame by frame and encodes it straight to an MP4 in memory.
 * Frames are never buffered — each one is encoded and muxed immediately, which is
 * what keeps a long 1080p export inside a normal browser's memory budget.
 */
export async function exportMp4(options: ExportOptions): Promise<ExportResult> {
  const { recipe, width, height, fps, bitrate = 8_000_000, audio, onProgress, signal } = options;

  const VideoEncoderCtor = (globalThis as unknown as { VideoEncoder?: unknown }).VideoEncoder;
  if (!VideoEncoderCtor) {
    throw new Error('This browser cannot encode video. Open Motiflow in Chrome, Edge or a recent Safari.');
  }

  const started = performance.now();
  const totalFrames = Math.max(1, Math.ceil(recipe.duration * fps));

  let audioPlan: AudioPlan | null = null;
  let audioWarning: string | undefined;
  if (audio) {
    onProgress?.(0, 'Reading audio');
    try {
      audioPlan = await prepareAudio(audio, recipe.duration);
      if (!audioPlan) audioWarning = 'This browser cannot encode AAC audio, so the file was exported silent.';
    } catch (err) {
      audioPlan = null;
      audioWarning = `The audio track could not be read (${err instanceof Error ? err.message : 'unknown error'}), so the file was exported silent.`;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not create a drawing surface.');

  const scene = createScene(recipe, { width, height }, { resolveImage: options.resolveImage });

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: fps },
    ...(audioPlan
      ? { audio: { codec: 'aac', numberOfChannels: audioPlan.channels, sampleRate: audioPlan.sampleRate } }
      : {}),
    fastStart: 'in-memory',
  });

  if (audioPlan) {
    onProgress?.(0.02, 'Encoding audio');
    await addAudio(audioPlan, muxer);
  }

  let encoderFailure: Error | null = null;
  const encoder = new (VideoEncoderCtor as any)({
    output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
    error: (err: Error) => {
      encoderFailure = err;
    },
  });

  const config = await pickConfig(width, height, fps, bitrate);
  encoder.configure(config);

  const frameDuration = 1_000_000 / fps;
  const keyEvery = Math.max(1, Math.round(fps * 2));

  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) {
      encoder.close();
      throw new Error('Export cancelled.');
    }
    if (encoderFailure) throw encoderFailure;

    scene.draw(ctx, i / fps);

    const frame = new (globalThis as any).VideoFrame(canvas, {
      timestamp: Math.round(i * frameDuration),
      duration: Math.round(frameDuration),
    });
    encoder.encode(frame, { keyFrame: i % keyEvery === 0 });
    frame.close();

    while (encoder.encodeQueueSize > 6) {
      await new Promise((r) => setTimeout(r, 1));
    }

    if (i % 4 === 0) {
      onProgress?.(0.03 + (i / totalFrames) * 0.95, 'Rendering frames');
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
  }

  onProgress?.(0.98, 'Writing file');
  await encoder.flush();
  encoder.close();
  muxer.finalize();

  const buffer = (target as ArrayBufferTarget).buffer;
  if (!buffer) throw new Error('The encoder produced no data.');

  const blob = new Blob([buffer], { type: 'video/mp4' });
  if (blob.size < 1024) throw new Error('The encoded file is empty.');

  onProgress?.(1, 'Done');

  return {
    blob,
    extension: 'mp4',
    frames: totalFrames,
    ms: performance.now() - started,
    hasAudio: Boolean(audioPlan),
    audioWarning,
  };
}

/** Decodes any audio file the browser understands and resamples it to 48 kHz stereo. */
async function prepareAudio(file: File, duration: number): Promise<AudioPlan | null> {
  const AudioEncoderCtor = (globalThis as any).AudioEncoder;
  if (!AudioEncoderCtor) return null;

  const support = await AudioEncoderCtor.isConfigSupported({
    codec: 'mp4a.40.2',
    sampleRate: AUDIO_SAMPLE_RATE,
    numberOfChannels: AUDIO_CHANNELS,
    bitrate: AUDIO_BITRATE,
  }).catch(() => null);
  if (!support?.supported) return null;

  const bytes = await file.arrayBuffer();
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(bytes);
  } finally {
    void ctx.close();
  }

  const frames = Math.max(
    1,
    Math.min(Math.ceil(duration * AUDIO_SAMPLE_RATE), Math.ceil(decoded.duration * AUDIO_SAMPLE_RATE)),
  );

  const offline = new OfflineAudioContext(AUDIO_CHANNELS, frames, AUDIO_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();

  return {
    left: rendered.getChannelData(0),
    right: rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : rendered.getChannelData(0),
    frames,
    sampleRate: AUDIO_SAMPLE_RATE,
    channels: AUDIO_CHANNELS,
  };
}

async function addAudio(plan: AudioPlan, muxer: Muxer<ArrayBufferTarget>): Promise<void> {
  const AudioEncoderCtor = (globalThis as any).AudioEncoder;
  const AudioDataCtor = (globalThis as any).AudioData;

  let failure: Error | null = null;
  const encoder = new AudioEncoderCtor({
    output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
    error: (err: Error) => {
      failure = err;
    },
  });

  encoder.configure({
    codec: 'mp4a.40.2',
    sampleRate: plan.sampleRate,
    numberOfChannels: plan.channels,
    bitrate: AUDIO_BITRATE,
  });

  const chunkFrames = 1024;
  for (let offset = 0; offset < plan.frames; offset += chunkFrames) {
    if (failure) throw failure;
    const count = Math.min(chunkFrames, plan.frames - offset);

    // f32-planar expects channel 0 first, then channel 1.
    const plane = new Float32Array(count * 2);
    plane.set(plan.left.subarray(offset, offset + count), 0);
    plane.set(plan.right.subarray(offset, offset + count), count);

    const data = new AudioDataCtor({
      format: 'f32-planar',
      sampleRate: plan.sampleRate,
      numberOfFrames: count,
      numberOfChannels: plan.channels,
      timestamp: Math.round((offset / plan.sampleRate) * 1_000_000),
      data: plane,
    });
    encoder.encode(data);
    data.close();

    while (encoder.encodeQueueSize > 24) {
      await new Promise((r) => setTimeout(r, 1));
    }
  }

  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
}

async function pickConfig(width: number, height: number, fps: number, bitrate: number) {
  const VideoEncoderCtor = (globalThis as any).VideoEncoder;
  const base = { width, height, bitrate, framerate: fps };
  for (const codec of VIDEO_CODECS) {
    const candidate = { codec, ...base };
    try {
      const support = await VideoEncoderCtor.isConfigSupported(candidate);
      if (support?.supported) return support.config ?? candidate;
    } catch {
      // try the next profile
    }
  }
  throw new Error('No H.264 encoder profile is available in this browser.');
}

export function canExportInThisBrowser(): boolean {
  return typeof (globalThis as any).VideoEncoder === 'function';
}

export function canPlayAudioInThisBrowser(): boolean {
  return typeof (globalThis as any).AudioEncoder === 'function';
}
