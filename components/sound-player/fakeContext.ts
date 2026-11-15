// A fake AudioContext for node tests. The test moves `currentTime`; a gain keeps its scheduled events, and
// `valueAt(t)` works its value out from them alone, as a browser would.

export interface FakeBuffer {
  id: string;
  duration: number;
}
export interface FakeSource {
  buffer: FakeBuffer | null;
  loop: boolean;
  startedAt: number | null;
  stoppedAt: number | null;
  onended: (() => void) | null;
  out: FakeGain | null;
}
export interface FakeGain {
  gain: FakeParam;
  out: FakeGain | null;
  connected: boolean;
}
export class FakeParam {
  events: { t: number; v: number; ramp: boolean }[] = [];
  constructor(public value = 1) {}
  setValueAtTime(v: number, t: number): void {
    this.events.push({ t, v, ramp: false });
  }
  linearRampToValueAtTime(v: number, t: number): void {
    this.events.push({ t, v, ramp: true });
  }
  cancelScheduledValues(t: number): void {
    this.events = this.events.filter((e) => e.t < t);
  }
  valueAt(t: number): number {
    let v = this.value;
    let at = 0;
    for (const e of this.events) {
      if (e.t <= t) {
        v = e.v;
        at = e.t;
      } else return e.ramp ? v + ((e.v - v) * (t - at)) / (e.t - at) : v;
    }
    return v;
  }
}

export class FakeAudioContext {
  currentTime = 0;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  readonly destination = { gain: new FakeParam(1), out: null, connected: true };
  readonly sources: FakeSource[] = [];
  readonly gains: FakeGain[] = [];

  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
  createGain() {
    const g = {
      gain: new FakeParam(1),
      out: null as FakeGain | null,
      connected: false,
      connect(n: FakeGain) {
        g.out = n;
        g.connected = true;
      },
      disconnect() {
        g.connected = false;
      },
    };
    this.gains.push(g);
    return g;
  }
  createDynamicsCompressor() {
    const p = () => ({ value: 0 });
    return { ...this.createGain(), threshold: p(), ratio: p(), knee: p(), attack: p(), release: p() };
  }
  createBufferSource() {
    const s = {
      buffer: null as FakeBuffer | null,
      loop: false,
      startedAt: null as number | null,
      stoppedAt: null as number | null,
      onended: null as (() => void) | null,
      out: null as FakeGain | null,
      connect(n: FakeGain) {
        s.out = n;
      },
      start(when = 0) {
        s.startedAt = when;
      },
      stop(when = 0) {
        s.stoppedAt = when;
      },
    };
    this.sources.push(s);
    return s;
  }
  /** The fake fetch's body is the file's url as text: the buffer is named after it. `long` in the name: 40 s. */
  decodeAudioData(data: ArrayBuffer): Promise<FakeBuffer> {
    const id = new TextDecoder().decode(data);
    if (id.includes('broken')) return Promise.reject(new Error('cannot decode'));
    return Promise.resolve({ id, duration: id.includes('long') ? 40 : 0.5 });
  }
  /** Finish a source as the clock would. */
  end(s: FakeSource): void {
    s.onended?.();
  }
  /** The product of the gains from a source to the destination at `t`. */
  heard(s: FakeSource, t: number): number {
    let v = 1;
    for (let g = s.out; g; g = g.out) v *= g.gain.valueAt(t);
    return v;
  }
}

/** Every url answers with its own name as the body, but the ones ending in a `missing` entry (404). */
export function fakeFetch(missing: readonly string[] = []) {
  const urls: string[] = [];
  const fetch = (url: string): Promise<Response> => {
    urls.push(url);
    if (missing.some((m) => url.endsWith(m))) return Promise.resolve({ ok: false, status: 404 } as Response);
    return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new TextEncoder().encode(url).buffer) } as Response);
  };
  return { fetch, urls };
}
