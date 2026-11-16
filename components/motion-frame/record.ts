// Node only (not exported from index): records a clip of a page by CDP screencast, then ffmpeg (webm) and python3 with PIL (stills sheet).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { clipTimes, frameAt, stillFrames, stillTimes, type Frame } from './clips.ts';

type Cdp = { send(m: string, p?: unknown): Promise<unknown>; on(e: string, f: (p: { data: string; sessionId: number; metadata: { timestamp?: number } }) => void): void };
export type ClipPage = { ctx: { newCDPSession(page: unknown): Promise<Cdp> }; page: unknown; waitMs(ms: number): Promise<void> };

// `play` starts the beat and resolves to the page clock (seconds, the screencast's timestamp scale) when the step begins. Cost: one clip of the 1920-wide page.
export const recordClip = async (
  cp: ClipPage,
  o: { id: string; out: string; tmp: string; spec: { steps: { t: number; dur: number }[] }; ms: number; play: () => Promise<number>; fps?: number },
) => {
  const frames: Frame[] = [];
  const cdp = await cp.ctx.newCDPSession(cp.page);
  cdp.on('Page.screencastFrame', (f) => { frames.push({ data: f.data, t: f.metadata.timestamp ?? 0 }); void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
  await cp.waitMs(500);
  const at = await o.play();
  await cp.waitMs(o.ms);
  await cdp.send('Page.stopScreencast');
  const dir = `${o.tmp}/${o.id}`;
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); mkdirSync(o.out, { recursive: true });
  if (!frames.length || at < frames[0]!.t || at > frames[frames.length - 1]!.t + 1) throw new Error(`clip ${o.id}: play() time ${String(at)} is outside the screencast clock (epoch seconds)`);
  let n = 0;
  for (const t of clipTimes(at, o.ms, o.fps)) { const f = frameAt(frames, t); if (f) writeFileSync(`${dir}/f${String(n++).padStart(5, '0')}.jpg`, Buffer.from(f.data, 'base64')); }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(o.fps ?? 30), '-i', `${dir}/f%05d.jpg`, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-pix_fmt', 'yuv420p', `${o.out}/${o.id}.webm`]);
  const sf = stillFrames(frames, at, stillTimes(o.spec));
  sf.forEach((f, i) => writeFileSync(`${dir}/still${String(i)}.jpg`, Buffer.from(f.data, 'base64')));
  execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nfs=[Image.open(p) for p in sys.argv[2:]]\nw,h=fs[0].size\nw2,h2=w//2,h//2\ns=Image.new("RGB",(w2*3,h2*2))\nfor i,f in enumerate(fs[:6]): s.paste(f.resize((w2,h2)),((i%3)*w2,(i//3)*h2))\ns.save(sys.argv[1],quality=82)', `${o.out}/${o.id}-stills.jpg`, ...sf.map((_, i) => `${dir}/still${String(i)}.jpg`)]);
  return { frames: frames.length, written: n };
};
