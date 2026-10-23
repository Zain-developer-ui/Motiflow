import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildPrompt,
  estimateDuration,
  isSrt,
  parseSrt,
  STYLE_PRESETS,
  toRecipeTime,
  type Aspect,
  type Cue,
  type PromptStyle,
} from '../lib/prompt';

interface Props {
  aspect: Aspect;
  fps: number;
  onOpenRecipe: () => void;
}

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

// The panel unmounts when you switch to the Recipe tab, and a reload during a
// long build would lose the transcript. Both are worth surviving, so the draft
// lives in localStorage.
const STORE_KEY = 'motiflow.prompt.v1';

interface PromptDraft {
  transcript: string;
  cues: Cue[];
  style: PromptStyle;
  duration: string;
  prompt: string;
}

function readDraft(): Partial<PromptDraft> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const value = JSON.parse(raw) as Partial<PromptDraft> | null;
    if (!value || typeof value !== 'object') return {};
    return {
      transcript: typeof value.transcript === 'string' ? value.transcript : undefined,
      cues: Array.isArray(value.cues) ? value.cues.filter((cue) => cue && typeof cue.text === 'string') : undefined,
      style: STYLE_PRESETS.some((preset) => preset.id === value.style) ? value.style : undefined,
      duration: typeof value.duration === 'string' ? value.duration : undefined,
      prompt: typeof value.prompt === 'string' ? value.prompt : undefined,
    };
  } catch {
    return {};
  }
}

export function PromptPanel({ aspect, fps, onOpenRecipe }: Props) {
  const draft = useMemo(readDraft, []);
  const [transcript, setTranscript] = useState(draft.transcript ?? '');
  const [cues, setCues] = useState<Cue[]>(draft.cues ?? []);
  const [style, setStyle] = useState<PromptStyle>(draft.style ?? 'punch');
  const [durationInput, setDurationInput] = useState(draft.duration ?? '');
  const [prompt, setPrompt] = useState(draft.prompt ?? '');
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const next: PromptDraft = { transcript, cues, style, duration: durationInput, prompt };
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      // Private mode or a full quota — the draft just will not survive a reload.
    }
  }, [transcript, cues, style, durationInput, prompt]);

  const words = useMemo(() => countWords(transcript), [transcript]);
  const cueDuration = cues.length ? cues[cues.length - 1].end : null;
  const typedDuration = Number(durationInput.replace(',', '.'));
  const runtime = cueDuration ?? (Number.isFinite(typedDuration) && typedDuration > 0 ? typedDuration : null);
  const hint = estimateDuration(transcript, cues);

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setPrompt('');

    if (isSrt(text)) {
      const parsed = parseSrt(text);
      if (!parsed.length) {
        setNote('That file has no readable cues.');
        return;
      }
      setCues(parsed);
      setTranscript(parsed.map((cue) => cue.text).join('\n'));
      setNote(`${file.name} · ${parsed.length} cues · ${toRecipeTime(parsed[parsed.length - 1].end)}`);
      return;
    }

    setCues([]);
    setTranscript(text);
    setNote(file.name);
  };

  const build = () => {
    setPrompt(buildPrompt({ transcript, cues, aspect, fps, style, duration: runtime }));
    setCopied(false);
    setNote(runtime ? null : 'No duration yet — the model will answer with NEED_DURATION first.');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setNote('Clipboard is blocked here — select the text and copy it manually.');
    }
  };

  const canBuild = words > 0;

  return (
    <div className="prompt">
      <div className="prompt-block">
        <div className="prompt-label">
          <label htmlFor="transcript">Transcript</label>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => fileRef.current?.click()}
          >
            Upload .txt / .srt
          </button>
        </div>

        <textarea
          id="transcript"
          className="prompt-textarea"
          value={transcript}
          spellCheck={false}
          placeholder={
            'Paste what is said, one line per beat.\n\nOr upload an .srt/.vtt and the real timings come along with it.'
          }
          onChange={(event) => {
            setTranscript(event.target.value);
            setPrompt('');
            if (cues.length) {
              setCues([]);
              setNote('Timings cleared — reload the subtitle file to restore them.');
            }
          }}
        />

        <input
          ref={fileRef}
          type="file"
          accept=".txt,.srt,.vtt,text/plain"
          className="sr-only"
          onChange={(event) => {
            void loadFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>

      <div className="style-picker">
        <div className="prompt-label">
          <span id="style-label">Edit style</span>
          <span className="prompt-count">{STYLE_PRESETS.length} presets</span>
        </div>

        <div className="style-list" role="radiogroup" aria-labelledby="style-label">
          {STYLE_PRESETS.map((option) => {
            const on = option.id === style;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={on}
                className={`style-card${on ? ' is-on' : ''}`}
                onClick={() => {
                  setStyle(option.id);
                  setPrompt('');
                }}
              >
                <span className="style-icon" aria-hidden="true">
                  {option.icon}
                </span>
                <span className="style-copy">
                  <span className="style-name">{option.name}</span>
                  <span className="style-blurb" title={option.tags.join(' · ')}>
                    {option.blurb}
                  </span>
                </span>
                <span className="style-dot" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="prompt-row">
        <label className="prompt-field prompt-duration">
          <span>Duration</span>
          <span className="prompt-input-wrap">
            <input
              type="text"
              inputMode="decimal"
              value={cueDuration ? cueDuration.toFixed(2) : durationInput}
              readOnly={Boolean(cueDuration)}
              placeholder={words ? hint.toFixed(0) : '—'}
              onChange={(event) => {
                setDurationInput(event.target.value);
                setPrompt('');
              }}
              aria-label="Voiceover duration in seconds"
            />
            <span aria-hidden="true">s</span>
          </span>
        </label>

        <div className="prompt-meta" aria-live="polite">
          <span>{words} words</span>
          <span>
            {cueDuration
              ? `${cues.length} cues · exact`
              : runtime
                ? `${runtime.toFixed(1)}s · typed`
                : `~${hint.toFixed(1)}s · unknown`}
          </span>
          <span>
            {aspect} · {fps}fps
          </span>
        </div>
      </div>

      {!runtime && words > 0 && (
        <p className="prompt-hint">
          No duration means the model answers <code>NEED_DURATION</code> first. Type the
          voiceover length above to skip that round trip.
        </p>
      )}

      <button type="button" className="btn btn-primary btn-wide" onClick={build} disabled={!canBuild}>
        Build prompt
      </button>

      {note && <p className="prompt-note">{note}</p>}

      {prompt && (
        <div className="prompt-block prompt-result">
          <div className="prompt-label">
            <label htmlFor="prompt-out">Prompt</label>
            <div className="prompt-actions">
              <button type="button" className="btn btn-ghost btn-xs" onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={onOpenRecipe}>
                Recipe tab
              </button>
            </div>
          </div>
          <textarea id="prompt-out" className="prompt-textarea prompt-out" readOnly value={prompt} />
          <p className="prompt-help">
            Paste it into ChatGPT, Claude or any model, then paste the <code>[RECIPE]</code> block
            back into the Recipe tab.
          </p>
        </div>
      )}
    </div>
  );
}
