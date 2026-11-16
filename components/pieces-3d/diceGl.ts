// Dice as true rounded solids, drawn by one offscreen WebGL canvas into a small 2D canvas (.p3-die-gl) inside each element
// matching `sel` with data-p3-die="d6|d10" and data-v="<value>", so covers, clipping and opacity of the page apply to it as to
// any element. One light from the top-left, a cast shadow under it. data-roll="t0,dur,seed" tumbles it to its value, data-turn="t0,dur,out|in" turns it a quarter
// (times of performance.now()). No model file, no dependency. Returns null where WebGL is not available.
import { cube, mesh, rest, trapezohedron, tumble, turned, type M3, type Solid } from './solids';

export interface DiceLook { body: string; ink: string; font: string; tilt: number }
export interface DiceLayer { canvas: HTMLCanvasElement; stop: () => void; frames: () => number }

const VS = 'attribute vec3 aP;attribute vec3 aN;attribute vec2 aT;uniform mat3 uR;uniform vec2 uC;uniform vec2 uV;uniform float uS;varying vec3 vN;varying vec2 vT;void main(){vec3 p=uR*aP*uS;vN=uR*aN;vT=aT;gl_Position=vec4((uC.x+p.x)/uV.x*2.-1.,1.-(uC.y-p.y)/uV.y*2.,0.,1.);}';
const FS = 'precision mediump float;uniform sampler2D uX;uniform float uA;varying vec3 vN;varying vec2 vT;void main(){vec3 n=normalize(vN);vec3 l=normalize(vec3(-.45,.6,.66));float d=max(dot(n,l),0.);float s=pow(max(dot(n,normalize(l+vec3(0.,0.,1.))),0.),28.)*.22;vec3 c=texture2D(uX,vT).rgb*(.68+.46*d)+s;gl_FragColor=vec4(c*uA,uA);}';
const SV = 'attribute vec2 aQ;uniform vec2 uC;uniform vec2 uV;uniform float uS;varying vec2 vQ;void main(){vQ=aQ;gl_Position=vec4((uC.x+aQ.x*uS)/uV.x*2.-1.,1.-(uC.y+aQ.y*uS)/uV.y*2.,0.,1.);}';
const SF = 'precision mediump float;uniform float uA;varying vec2 vQ;void main(){float a=smoothstep(1.,.3,length(vQ))*uA;gl_FragColor=vec4(0.,0.,0.,a);}';
const PIPS: Record<number, [number, number][]> = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };

function atlas(s: Solid, look: DiceLook, numerals: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas'), k = 128;
  c.width = s.cols * k; c.height = s.rows <= 2 ? 2 * k : 4 * k;
  const g = c.getContext('2d');
  if (!g) return c;
  g.fillStyle = look.body; g.fillRect(0, 0, c.width, c.height);
  const ch = c.height / s.rows;
  s.faces.forEach((_, i) => {
    const x = ((i % s.cols) + 0.5) * k, y = (Math.floor(i / s.cols) + 0.5) * ch;
    g.fillStyle = look.ink;
    if (numerals) { g.font = `${look.font.replace(/\d+px/, `${String(Math.round(ch * 0.3))}px`)}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), x, y + ch * 0.06); return; }
    for (const [px, py] of PIPS[i + 1] ?? []) {
      const cx = x + px * k * 0.25, cy = y + py * ch * 0.25, r = k * 0.085;
      g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
      // a recessed pip: the far wall of the hollow catches the light
      g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = r * 0.3; g.beginPath(); g.arc(cx, cy, r * 0.82, 0.1, 1.5); g.stroke();
    }
  });
  return c;
}

export function startDiceLayer(look: DiceLook, sel = '[data-p3-die]', on: (ok: boolean) => void = (ok) => { document.documentElement.classList.toggle('p3-gl', ok); }): DiceLayer | null {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
  if (!gl) return null;
  const init = () => {
    const sh = (t: number, src: string) => { const s = gl.createShader(t) as WebGLShader; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = (v: string, f: string) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f)); gl.linkProgram(p); return p; };
    const P = prog(VS, FS), S = prog(SV, SF);
    if (!gl.getProgramParameter(P, gl.LINK_STATUS) || !gl.getProgramParameter(S, gl.LINK_STATUS)) return null;
    const buf = (target: number, data: AllowSharedBufferSource) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
    const kinds = Object.fromEntries((['d6', 'd10'] as const).map((kind) => {
      const solid = kind === 'd6' ? cube() : trapezohedron(), m = mesh(solid), tex = gl.createTexture();
      const paint = () => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas(solid, look, kind === 'd10'));
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      };
      paint();
      return [kind, { solid, tex, paint, n: m.idx.length, pos: buf(gl.ARRAY_BUFFER, m.pos), nor: buf(gl.ARRAY_BUFFER, m.nor), uv: buf(gl.ARRAY_BUFFER, m.uv), idx: buf(gl.ELEMENT_ARRAY_BUFFER, m.idx) }];
    }));
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const locs = new Map<string, WebGLUniformLocation | null>();
    const U = (p: WebGLProgram, n: string) => { const k = (p === P ? 'P' : 'S') + n; if (!locs.has(k)) locs.set(k, gl.getUniformLocation(p, n)); return locs.get(k) ?? null; };
    return { P, S, kinds, U, quad: buf(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])) };
  };
  let R = init();
  if (!R) return null;
  const A = (p: WebGLProgram, n: string, b: WebGLBuffer | null, size: number) => { const l = gl.getAttribLocation(p, n); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); };
  let raf = 0, drawn = 0, lost = false, sizes = new WeakMap<Element, { w: number; h: number; s: number }>();
  const live = new Set<HTMLElement>(), dirty = new Set<HTMLElement>(), own = new WeakMap<Element, HTMLCanvasElement>();
  const kick = () => { if (!raf && !lost && dirty.size) raf = requestAnimationFrame(tick); };
  const ro = new ResizeObserver((es) => { for (const e of es) { sizes.delete(e.target); dirty.add(e.target as HTMLElement); } kick(); });
  // true while the die is still moving
  const draw = (el: HTMLElement, now: number) => {
    const r = R, kind = el.getAttribute('data-p3-die') ?? '', K = r?.kinds[kind];
    if (!r || !K) return false;
    let c = own.get(el);
    if (!c || c.parentNode !== el) {
      // a clone of a die (motion layer) brings a blank copy of the canvas
      for (const x of el.querySelectorAll(':scope>canvas.p3-die-gl')) x.remove();
      c = document.createElement('canvas'); c.className = 'p3-die-gl'; el.appendChild(c); own.set(el, c); sizes.delete(el); ro.observe(el);
    }
    let z = sizes.get(el);
    if (!z) {
      const ow = el.offsetWidth, oh = el.offsetHeight, k = Math.min(window.devicePixelRatio || 1, 2) * Math.min(4, el.getBoundingClientRect().width / (ow || 1) || 1);
      z = { w: Math.round(2 * ow * k), h: Math.round(2 * oh * k), s: (Math.min(ow, oh) * k * 0.5 * 0.92) / (kind === 'd6' ? 1 : K.solid.reach * 0.74) };
      sizes.set(el, z); c.width = z.w; c.height = z.h;
    }
    if (z.w < 2 || z.h < 2) return false;
    const v = Number(el.getAttribute('data-v')) || 1, roll = el.getAttribute('data-roll')?.split(','), turn = el.getAttribute('data-turn')?.split(',');
    let m: M3 = rest(K.solid, v, look.tilt), hop = 0, moving = false;
    const at = (q: string[]) => { const p = (now - Number(q[0])) / Math.max(1, Number(q[1])); moving = p < 1; return Math.min(1, Math.max(0, p)); };
    if (roll) { const p = at(roll); m = tumble(K.solid, v, look.tilt, p, Number(roll[2]) || 1); hop = Math.sin(Math.PI * p); }
    else if (turn) { const p = at(turn); m = turned(K.solid, v, look.tilt, turn[2] === 'in' ? (-Math.PI / 2) * (1 - Math.min(1, Math.max(0, 2 * p - 1))) : (Math.PI / 2) * Math.min(1, 2 * p)); }
    if (canvas.width < z.w || canvas.height < z.h) { canvas.width = Math.max(canvas.width, z.w); canvas.height = Math.max(canvas.height, z.h); }
    const W = z.w, H = z.h, x = W / 2, y = H / 2, s = z.s, u = kind === 'd6' ? s : s * 0.8, { P, S, U } = r;
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.CULL_FACE); gl.useProgram(S); A(S, 'aQ', r.quad, 2); gl.uniform2f(U(S, 'uV'), W, H);
    gl.uniform2f(U(S, 'uC'), x + u * (0.16 + 0.25 * hop), y + u * (0.26 + 0.35 * hop)); gl.uniform1f(U(S, 'uS'), u * 1.42); gl.uniform1f(U(S, 'uA'), 0.5 * (1 - 0.4 * hop)); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.CULL_FACE); gl.useProgram(P); gl.uniform2f(U(P, 'uV'), W, H); gl.uniform1i(U(P, 'uX'), 0);
    A(P, 'aP', K.pos, 3); A(P, 'aN', K.nor, 3); A(P, 'aT', K.uv, 2);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, K.idx); gl.bindTexture(gl.TEXTURE_2D, K.tex);
    // column-major for GLSL
    gl.uniformMatrix3fv(U(P, 'uR'), false, [0, 3, 6, 1, 4, 7, 2, 5, 8].map((n) => m[n] ?? 0));
    gl.uniform2f(U(P, 'uC'), x, y - s * 0.12 * hop); gl.uniform1f(U(P, 'uS'), s * (1 + 0.1 * hop)); gl.uniform1f(U(P, 'uA'), 1);
    gl.drawElements(gl.TRIANGLES, K.n, gl.UNSIGNED_SHORT, 0);
    const g = c.getContext('2d');
    if (g) { g.clearRect(0, 0, W, H); g.drawImage(canvas, 0, canvas.height - H, W, H, 0, 0, W, H); }
    drawn += 1;
    return moving;
  };
  const tick = () => {
    raf = 0;
    const now = performance.now();
    for (const el of dirty) { if (!el.isConnected) { live.delete(el); ro.unobserve(el); } if (!el.isConnected || !draw(el, now)) dirty.delete(el); }
    kick();
  };
  const add = (el: Element) => { if (el instanceof HTMLElement) { live.add(el); dirty.add(el); } };
  const found = (n: Node) => { if (n instanceof Element) { if (n.matches(sel)) add(n); n.querySelectorAll(sel).forEach(add); } };
  const mo = new MutationObserver((ms) => {
    for (const m of ms) if (m.type === 'attributes') { if ((m.target as Element).matches(sel)) add(m.target as Element); } else m.addedNodes.forEach(found);
    kick();
  });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-p3-die', 'data-v', 'data-roll', 'data-turn'] });
  const all = () => { for (const el of live) dirty.add(el); kick(); };
  const resize = () => { sizes = new WeakMap(); all(); };
  window.addEventListener('resize', resize);
  found(document.body);
  let stopped = false;
  void document.fonts?.ready.then(() => { if (stopped) return; R?.kinds['d10']?.paint(); all(); });
  // a lost context (tab in the background, driver reset): the flat dice show until it is back
  const onLost = (e: Event) => { e.preventDefault(); lost = true; cancelAnimationFrame(raf); raf = 0; on(false); };
  const onBack = () => { if (stopped) return; R = init(); if (!R) return; lost = false; on(true); all(); };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onBack);
  on(true);
  kick();
  return { canvas, stop: () => {
    if (stopped) return;
    stopped = lost = true; cancelAnimationFrame(raf); raf = 0; mo.disconnect(); ro.disconnect(); window.removeEventListener('resize', resize);
    canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onBack);
    on(false); for (const el of live) own.get(el)?.remove(); live.clear(); dirty.clear(); R = null;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }, frames: () => drawn };
}
