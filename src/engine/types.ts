export type LayerKind = 'scene' | 'text' | 'shape' | 'card' | 'image' | 'camera';

export type ShapeKind = 'rect' | 'circle' | 'pill' | 'ring' | 'line' | 'check' | 'arrow';

export type AnimName =
  | 'charIn'
  | 'typeOn'
  | 'wordIn'
  | 'charFade'
  | 'fadeUp'
  | 'riseIn'
  | 'slideL'
  | 'slideR'
  | 'slideU'
  | 'slideD'
  | 'zoomIn'
  | 'blurIn'
  | 'fadeOut'
  | 'blurOut'
  | 'scaleIn'
  | 'scaleDown'
  | 'popIn'
  | 'popOut'
  | 'zoomOut'
  | 'slideOutL'
  | 'slideOutR'
  | 'none';

export interface Keyframe {
  t: number;
  v: number;
  linear: boolean;
}

export interface Procedural {
  prop: string;
  from: number;
  to: number;
  start: number;
  end: number;
  suffix?: string;
}

export interface Layer {
  id: string;
  kind: LayerKind;
  shape?: ShapeKind;
  start: number;
  end: number;
  z: number;
  text: string;
  props: Record<string, string>;
  nums: Record<string, number>;
  keys: Record<string, Keyframe[]>;
  grow?: Procedural;
  count?: Procedural;
  animIn: AnimName;
  animInDur: number;
  animOut: AnimName;
  animOutDur: number;
  delay: number;
  line: number;
  raw: string;
}

export interface Issue {
  line: number;
  message: string;
  severity: 'error' | 'warn';
}

export interface Recipe {
  version: string;
  layers: Layer[];
  issues: Issue[];
  duration: number;
  assets: string[];
}
