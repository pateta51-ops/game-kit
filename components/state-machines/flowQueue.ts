// Flow requests guarded by the context they were made in (boardgame.io events.ts idea).
export interface FlowRequest<C> {
  readonly name: string;
  readonly at: C;
  readonly site: string;
}
export class FlowQueue<C> {
  private q: FlowRequest<C>[] = [];
  constructor(private readonly max = 100) {}
  /** `at` is the turn/phase now; `site` names the caller (default: the call's stack line). */
  request(name: string, at: C, site = new Error().stack?.split('\n')[2]?.trim() ?? ''): void {
    this.q.push({ name, at, site });
  }
  get size(): number {
    return this.q.length;
  }
  /** Runs each request whose `at` still equals `now()`; drops the others (returned). Requests made while flushing are run too. More than `max` runs throws, naming the request and its call site. */
  flush(now: () => C, same: (a: C, b: C) => boolean, run: (r: FlowRequest<C>) => void): FlowRequest<C>[] {
    const dropped: FlowRequest<C>[] = [];
    let n = 0;
    for (let r = this.q.shift(); r !== undefined; r = this.q.shift()) {
      if (!same(r.at, now())) {
        dropped.push(r);
        continue;
      }
      if (++n > this.max) {
        this.q = [];
        throw new Error(`flow request "${r.name}" ran more than ${this.max} times in one flush (called at ${r.site})`);
      }
      run(r);
    }
    return dropped;
  }
}
