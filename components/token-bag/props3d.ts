// The props of the 3D parts, kept free of three.js so the 2D view can name them.
import type { Exterior } from './exterior.ts';
import type { FallbackReason } from './mode.ts';

export interface RestProps {
  faceUrl: (kind: string) => string;
  exterior?: Exterior | undefined;
  backdrop?: string | undefined;
  onFail: (reason: FallbackReason) => void;
  className?: string | undefined;
  /** leave the canvas size to the host's CSS (default: inline 100% x 100%) */
  hostSized?: boolean | undefined;
  /** set window.__bagDockFrames (frames rendered so far) for e2e (default off) */
  e2eHooks?: boolean | undefined;
}

export interface DrawProps {
  contents: readonly string[];
  drawn: readonly string[];
  faceUrl: (kind: string) => string;
  exterior?: Exterior | undefined;
  backdrop?: string | undefined;
  /** set window.__bag3dStats / __bag3dSeek for e2e (default off) */
  e2eHooks?: boolean | undefined;
  /** the scene's rate (1 = as approved; 2 = twice as fast) */
  rate: number;
  countLabel: string;
  skipText: string;
  onDone: () => void;
  onFail: (reason: FallbackReason) => void;
}
