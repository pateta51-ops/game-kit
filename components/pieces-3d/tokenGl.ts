// K718: die-cut tokens as true extruded solids, drawn like the dice: one offscreen WebGL context, a small 2D canvas
// (.p3-token-gl) inside each element matching `sel` with data-p3-token, data-src (the die-cut scan), data-back?, data-size="w,h,d" (px),
// data-rot="tilt,turn,spin" (radians) and data-edge? (#rrggbb). Light from the top-left, a cast shadow. The element's own children
// (a <Chip dieCut>) show until the solid is drawn (data-p3-drawn). Returns null where WebGL is not available.
import { mmul, rotX, rotY, type M3 } from './solids.ts';
import { edgeColour, extrude, simplify, traceAlpha, type Pt } from './token.ts';

export interface TokenLook { tilt?: number; edge?: string }
export interface TokenLayer { canvas: HTMLCanvasElement; stop: () => void; frames: () => number }

const VS = 'attribute vec3 aP;attribute vec3 aN;attribute vec2 aT;attribute float aK;uniform mat3 uR;uniform vec2 uC;uniform vec2 uV;uniform float uS;varying vec3 vN;varying vec2 vT;varying float vK;void main(){vec3 p=uR*aP*uS;vN=uR*aN;vT=aT;vK=aK;gl_Position=vec4((uC.x+p.x)/uV.x*2.-1.,1.-(uC.y-p.y)/uV.y*2.,-p.z/(uV.x+uV.y),1.);}';
const FS = 'precision mediump float;uniform sampler2D uX;uniform sampler2D uB;uniform vec3 uE;varying vec3 vN;varying vec2 vT;varying float vK;void main(){vec3 n=normalize(vN);vec3 l=normalize(vec3(-.45,.6,.66));float d=max(dot(n,l),0.);float s=pow(max(dot(n,normalize(l+vec3(0.,0.,1.))),0.),28.)*.22;vec4 t=vK<.5?texture2D(uX,vT):texture2D(uB,vT);vec3 b=vK>1.5?uE:mix(uE,t.rgb,t.a);gl_FragColor=vec4(b*(.68+.46*d)+s,1.);}';
const SV = 'attribute vec2 aQ;uniform vec2 uC;uniform vec2 uV;uniform vec2 uS;varying vec2 vQ;void main(){vQ=aQ;gl_Position=vec4((uC.x+aQ.x*uS.x)/uV.x*2.-1.,1.-(uC.y+aQ.y*uS.y)/uV.y*2.,0.,1.);}';
const SF = 'precision mediump float;uniform float uA;varying vec2 vQ;void main(){float a=smoothstep(1.,.3,length(vQ))*uA;gl_FragColor=vec4(0.,0.,0.,a);}';
const rotZ = (a: number): M3 => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
const hex = (c: string) => { const n = parseInt(c.replace('#', '').slice(0, 6), 16) || 0; return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const; };

interface Scan { img: HTMLImageElement; outline: Pt[]; w: number; h: number; edge: string }
const scans = new Map<string, Promise<Scan | null>>();
/** The scan, its outline traced from its alpha (at most 512 px on its long side) and the colour just inside its edge. */
export function loadScan(src: string): Promise<Scan | null> {
  let p = scans.get(src);
  if (!p) {
    p = new Promise<Scan | null>((ok) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d', { willReadFrequently: true });
        if (!g) { ok(null); return; }
        g.drawImage(img, 0, 0, w, h);
        const d = g.getImageData(0, 0, w, h).data, t = traceAlpha(d, w, h);
        ok(t.length < 3 ? null : { img, outline: simplify(t, 0.6), w, h, edge: edgeColour(d, w, t) });
      };
      img.onerror = () => { ok(null); };
      img.src = src;
    });
    scans.set(src, p);
  }
  return p;
}

export function startTokenLayer(look: TokenLook = {}, sel = '[data-p3-token]', on: (ok: boolean) => void = () => {}): TokenLayer | null {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, depth: true });
  if (!gl) return null;
  const sh = (t: number, src: string) => { const s = gl.createShader(t) as WebGLShader; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = (v: string, f: string) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f)); gl.linkProgram(p); return p; };
  const buf = (target: number, data: AllowSharedBufferSource) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
  let P: WebGLProgram, S: WebGLProgram, quad: WebGLBuffer | null;
  let texs = new Map<string, WebGLTexture>(), meshes = new Map<string, { n: number; pos: WebGLBuffer | null; nor: WebGLBuffer | null; uv: WebGLBuffer | null; kind: WebGLBuffer | null; idx: WebGLBuffer | null }>();
  const locs = new Map<string, WebGLUniformLocation | null>();
  const init = () => {
    P = prog(VS, FS); S = prog(SV, SF); locs.clear(); texs = new Map(); meshes = new Map();
    if (!gl.getProgramParameter(P, gl.LINK_STATUS) || !gl.getProgramParameter(S, gl.LINK_STATUS)) return false;
    quad = buf(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    return true;
  };
  if (!init()) return null;
  const U = (p: WebGLProgram, n: string) => { const k = (p === P ? 'P' : 'S') + n; if (!locs.has(k)) locs.set(k, gl.getUniformLocation(p, n)); return locs.get(k) ?? null; };
  const A = (p: WebGLProgram, n: string, b: WebGLBuffer | null, size: number) => { const l = gl.getAttribLocation(p, n); if (l < 0) return; gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); };
  const tex = (src: string, img: HTMLImageElement) => {
    let t = texs.get(src);
    if (t) return t;
    // a power-of-two copy, so it mipmaps
    const c = document.createElement('canvas'), p2 = (v: number) => 2 ** Math.min(11, Math.ceil(Math.log2(Math.max(1, v))));
    c.width = p2(img.naturalWidth); c.height = p2(img.naturalHeight); c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
    t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    texs.set(src, t);
    return t;
  };
  let raf = 0, drawn = 0, lost = false, stopped = false, sizes = new WeakMap<Element, { w: number; h: number; k: number }>();
  const live = new Set<HTMLElement>(), dirty = new Set<HTMLElement>(), own = new WeakMap<Element, HTMLCanvasElement>(), ready = new Map<string, Scan | null>();
  const kick = () => { if (!raf && !lost && dirty.size) raf = requestAnimationFrame(tick); };
  const ro = new ResizeObserver((es) => { for (const e of es) { sizes.delete(e.target); dirty.add(e.target as HTMLElement); } kick(); });
  const scan = (el: HTMLElement, src: string | null) => {
    if (!src) return null;
    if (ready.has(src)) return ready.get(src) ?? null;
    void loadScan(src).then((s) => { ready.set(src, s); if (!stopped) { dirty.add(el); kick(); } });
    return undefined;
  };
  // true when drawn
  const draw = (el: HTMLElement) => {
    const front = scan(el, el.getAttribute('data-src')), backSrc = el.getAttribute('data-back'), back = backSrc ? scan(el, backSrc) : null;
    if (!front || back === undefined) { el.removeAttribute('data-p3-drawn'); return false; }
    let c = own.get(el);
    if (!c || c.parentNode !== el) {
      for (const x of el.querySelectorAll(':scope>canvas.p3-token-gl')) x.remove();
      c = document.createElement('canvas'); c.className = 'p3-token-gl'; el.appendChild(c); own.set(el, c); sizes.delete(el); ro.observe(el);
    }
    const [sw, sh2, sd] = (el.getAttribute('data-size') ?? '').split(',').map(Number), ow = el.offsetWidth, oh = el.offsetHeight;
    const size = { w: sw || ow, h: sh2 || oh, d: sd || 2 };
    let z = sizes.get(el);
    if (!z) {
      const k = Math.min(window.devicePixelRatio || 1, 2) * Math.min(4, el.getBoundingClientRect().width / (ow || 1) || 1);
      z = { w: Math.round(2 * ow * k), h: Math.round(2 * oh * k), k };
      sizes.set(el, z); c.width = z.w; c.height = z.h;
    }
    if (z.w < 2 || z.h < 2) return false;
    const key = `${String(el.getAttribute('data-src'))}|${String(backSrc)}|${String(size.w)},${String(size.h)},${String(size.d)}`;
    let M = meshes.get(key);
    if (!M) { const m = extrude(front.outline, front, size, !!back); M = { n: m.idx.length, pos: buf(gl.ARRAY_BUFFER, m.pos), nor: buf(gl.ARRAY_BUFFER, m.nor), uv: buf(gl.ARRAY_BUFFER, m.uv), kind: buf(gl.ARRAY_BUFFER, m.kind), idx: buf(gl.ELEMENT_ARRAY_BUFFER, m.idx) }; meshes.set(key, M); }
    const [tilt = look.tilt ?? (15 * Math.PI) / 180, turn = 0, spin = 0] = (el.getAttribute('data-rot') ?? '').split(',').map((v) => (v === '' ? undefined : Number(v)));
    const m = mmul(rotX(-tilt), mmul(rotY(turn), rotZ(spin)));
    if (canvas.width < z.w || canvas.height < z.h) { canvas.width = Math.max(canvas.width, z.w); canvas.height = Math.max(canvas.height, z.h); }
    const W = z.w, H = z.h, s = z.k, x = W / 2, y = H / 2;
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.useProgram(S); A(S, 'aQ', quad, 2); gl.uniform2f(U(S, 'uV'), W, H);
    const reach = Math.hypot(size.w, size.h) / 2;
    gl.uniform2f(U(S, 'uC'), x + s * (0.04 * reach + 0.3 * size.d), y + s * (0.08 * reach + 0.6 * size.d)); gl.uniform2f(U(S, 'uS'), s * size.w * 0.62, s * size.h * 0.62 * Math.max(0.3, Math.abs(Math.cos(tilt)))); gl.uniform1f(U(S, 'uA'), 0.45); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.useProgram(P); gl.uniform2f(U(P, 'uV'), W, H);
    A(P, 'aP', M.pos, 3); A(P, 'aN', M.nor, 3); A(P, 'aT', M.uv, 2); A(P, 'aK', M.kind, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex(front.img.src, front.img)); gl.uniform1i(U(P, 'uX'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, back ? tex(back.img.src, back.img) : tex(front.img.src, front.img)); gl.uniform1i(U(P, 'uB'), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform3f(U(P, 'uE'), ...hex(el.getAttribute('data-edge') || look.edge || front.edge));
    gl.uniformMatrix3fv(U(P, 'uR'), false, [0, 3, 6, 1, 4, 7, 2, 5, 8].map((n) => m[n] ?? 0));
    gl.uniform2f(U(P, 'uC'), x, y); gl.uniform1f(U(P, 'uS'), s);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, M.idx); gl.drawElements(gl.TRIANGLES, M.n, gl.UNSIGNED_SHORT, 0);
    const g = c.getContext('2d');
    if (g) { g.clearRect(0, 0, W, H); g.drawImage(canvas, 0, canvas.height - H, W, H, 0, 0, W, H); }
    el.setAttribute('data-p3-drawn', '');
    drawn += 1;
    return true;
  };
  const tick = () => {
    raf = 0;
    for (const el of [...dirty]) { dirty.delete(el); if (!el.isConnected) { live.delete(el); ro.unobserve(el); } else draw(el); }
  };
  const add = (el: Element) => { if (el instanceof HTMLElement) { live.add(el); dirty.add(el); } };
  const found = (n: Node) => { if (n instanceof Element) { if (n.matches(sel)) add(n); n.querySelectorAll(sel).forEach(add); } };
  const mo = new MutationObserver((ms) => {
    for (const m of ms) if (m.type === 'attributes') { if ((m.target as Element).matches(sel)) add(m.target as Element); } else m.addedNodes.forEach(found);
    kick();
  });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-p3-token', 'data-src', 'data-back', 'data-size', 'data-rot', 'data-edge'] });
  const all = () => { for (const el of live) dirty.add(el); kick(); };
  const resize = () => { sizes = new WeakMap(); all(); };
  window.addEventListener('resize', resize);
  found(document.body);
  // a lost context: the flat chips show until it is back
  const onLost = (e: Event) => { e.preventDefault(); lost = true; cancelAnimationFrame(raf); raf = 0; for (const el of live) el.removeAttribute('data-p3-drawn'); on(false); };
  const onBack = () => { if (stopped || !init()) return; lost = false; on(true); all(); };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onBack);
  on(true);
  kick();
  return { canvas, stop: () => {
    if (stopped) return;
    stopped = lost = true; cancelAnimationFrame(raf); raf = 0; mo.disconnect(); ro.disconnect(); window.removeEventListener('resize', resize);
    canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onBack);
    on(false); for (const el of live) { own.get(el)?.remove(); el.removeAttribute('data-p3-drawn'); } live.clear(); dirty.clear();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }, frames: () => drawn };
}
