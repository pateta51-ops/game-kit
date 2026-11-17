// Port of Warp's Edge bagScene.ts (decision 017): the three.js scene of the 3D bag. A low-poly cloth bag with an open
// top, coins as thin cylinders whose front is the game's token face rasterised once and whose back is a blank
// disc, and the scripted shake-and-draw of timeline.ts. three.js is imported only here; this file is reached only
// through the dynamic imports of TokenBag.tsx, so a game's main bundle does not carry it.
import * as THREE from 'three';
import { exteriorCanvas, weaveCanvas, type ExteriorPrint } from './exterior.ts';
import {
  COIN_HEIGHT,
  COIN_RADIUS,
  assignDraws,
  bagCountAt,
  bagPose,
  coinPose,
  pileLayout,
  restOrder,
  totalDuration,
  type Pose,
} from './timeline.ts';
import { faceSize as budgetFaceSize, fpsWatch, textureBytes } from './mode.ts';

export interface BagSceneOptions {
  /**
   * the bag's real contents before the draw, unordered (token kinds, each a key of `faceUrl`);
   * its length is the bag's count. Shown inside the bag by owner decision (decision 017); the order never is.
   */
  contents: readonly string[];
  /** the drawn tokens' faces in draw order (the engine's draw event in D1); each must be one of `contents` */
  drawn: readonly string[];
  /** the image (SVG or raster) of a token kind: the coin's face */
  faceUrl: (kind: string) => string;
  /** the game's print on the bag's cloth (drawn over the plain weave, see exterior.ts); none: plain cloth */
  exterior?: ExteriorPrint;
  /** the clear colour, fog and table edge (default #0a121a) */
  backdrop?: string;
  onCount?: (n: number) => void;
  onDone?: () => void;
  /** Phase D1: the script's speed (1 = as approved; the game's motion speed scales it). */
  rate?: number;
  /** called once when the frame rate stays below 30 fps for 2 s while playing. */
  onSlow?: () => void;
  /** called when the WebGL context is lost. */
  onLost?: () => void;
  /** Phase D1: called once when rendering throws after construction (a frame, a resize, a skip); the scene stops. */
  onError?: (e: unknown) => void;
  /**
   * `rest`: the bag at rest in the dock (owner, 2026-11-04): no table, a clear background, the dock's framing, and a
   * frame only when it is ready or resized (never a loop). `draw` (the default): the shake-and-draw.
   */
  view?: 'draw' | 'rest';
  /**
   * A draw that starts from the dock's bag: the dock canvas's place on the screen. The draw's first frame shows the bag
   * exactly where the dock shows it, then the camera pulls back to the draw's framing while the backdrop fades in;
   * `back()` returns to it. Without it the draw is framed as before from its first frame (the mock).
   */
  from?: () => DOMRect | null;
}

export interface FrameStats {
  frames: number;
  seconds: number;
  fps: number;
  worstFrameMs: number;
}

export interface BagScene {
  ready: Promise<void>;
  play: () => void;
  /** pose the scene at time t of the script (for stills) */
  seek: (t: number) => void;
  duration: number;
  /** frame rate of the last play (or of the play running now) */
  stats: () => FrameStats;
  /** how many frames the scene has rendered in all (a bag at rest renders only when ready or resized) */
  renders: () => number;
  /** jump to the end of the script (a skip) and report done */
  finish: () => void;
  /** after the draw: the camera returns to the dock's framing (with `from`); resolves when it is there */
  back: () => Promise<void>;
  /** the face size chosen for the texture budget (bagMode.faceSize) and the estimated GPU texture bytes */
  faceSize: number;
  textureBytes: number;
  dispose: () => void;
}

/** Phase D1: each face is rasterised once per session and size; every later draw reuses the canvas. */
const rastered = new Map<string, Promise<HTMLCanvasElement>>();

function rasterise(url: string, size: number): Promise<HTMLCanvasElement> {
  const key = `${url}@${String(size)}`;
  let p = rastered.get(key);
  if (p === undefined) {
    p = rasteriseOnce(url, size);
    rastered.set(key, p);
    void p.catch(() => rastered.delete(key));
  }
  return p;
}

/** Rasterise a token SVG to a `size` px canvas (512 px; the SVG gets an explicit size so it renders sharp). */
async function rasteriseOnce(url: string, size: number): Promise<HTMLCanvasElement> {
  const svg = /\.svg($|\?)/.test(url);
  const text = svg ? await (await fetch(url)).text() : '';
  const sized = text.replace('<svg ', `<svg width="${String(size)}" height="${String(size)}" `);
  const blobUrl = svg ? URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' })) : url;
  try {
    const img = new Image();
    img.src = blobUrl;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (ctx === null) throw new Error('no 2d context');
    ctx.fillStyle = '#1b2530';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    return c;
  } finally {
    if (svg) URL.revokeObjectURL(blobUrl);
  }
}

/** The colour of a face's rim, sampled on a ring near its edge and darkened, for the coin's edge band. */
function rimColour(c: HTMLCanvasElement): THREE.Color {
  const ctx = c.getContext('2d');
  const out = new THREE.Color('#5d6b78');
  if (ctx === null) return out;
  let r = 0;
  let g = 0;
  let b = 0;
  const n = 16;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const d = ctx.getImageData(
      Math.round(c.width / 2 + Math.cos(a) * c.width * 0.43),
      Math.round(c.width / 2 + Math.sin(a) * c.width * 0.43),
      1,
      1,
    ).data;
    r += d[0] ?? 0;
    g += d[1] ?? 0;
    b += d[2] ?? 0;
  }
  out.setRGB((r / n / 255) * 0.75, (g / n / 255) * 0.75, (b / n / 255) * 0.75, THREE.SRGBColorSpace);
  return out;
}

/** The blank back of a token: a dark disc with a thin ring. */
function blankBack(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx !== null) {
    const g = ctx.createRadialGradient(128, 118, 10, 128, 128, 130);
    g.addColorStop(0, '#3a4652');
    g.addColorStop(1, '#1a222b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#56636f';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(128, 128, 112, 0, Math.PI * 2);
    ctx.stroke();
  }
  return c;
}

/** A coin: caps mapped so the face reads upright when the coin lies face up and is seen from the front. */
function coinGeometry(): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, COIN_HEIGHT, 48, 1);
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i += 1) {
    const ny = nor.getY(i);
    if (Math.abs(ny) < 0.5) continue;
    const u = pos.getX(i) / (2 * COIN_RADIUS) + 0.5;
    const v = (ny > 0 ? -pos.getZ(i) : pos.getZ(i)) / (2 * COIN_RADIUS) + 0.5;
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  return g;
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** The cloth bag: a lathe with folds that gather at the drawstring, open at the top. */
function bagGeometry(): THREE.LatheGeometry {
  const profile = new THREE.SplineCurve(
    [
      [0.0, 0.0],
      [0.72, 0.0],
      [1.08, 0.1],
      [1.3, 0.38],
      [1.38, 0.78],
      [1.3, 1.18],
      [1.08, 1.5],
      [0.86, 1.72],
      [0.8, 1.82],
      [0.88, 1.95],
      [1.0, 2.08],
      [1.06, 2.14],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
  ).getPoints(30);
  const g = new THREE.LatheGeometry(profile, 40);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const th = Math.atan2(z, x);
    const amp = 0.02 + 0.07 * smooth(1.25, 1.8, y) - 0.03 * smooth(1.9, 2.14, y);
    const f =
      1 +
      amp *
        (0.55 * Math.sin(7 * th + y * 3.1) +
          0.3 * Math.sin(13 * th - y * 5) +
          0.15 * Math.sin(23 * th + y * 9));
    pos.setXYZ(i, x * f, y + 0.015 * Math.sin(11 * th) * smooth(1.9, 2.1, y), z * f);
  }
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i += 1) {
    // the print follows the cloth, with the UV seam behind the bag.
    uv.setXY(i, Math.atan2(pos.getX(i), pos.getZ(i)) / (2 * Math.PI) + 0.5, pos.getY(i) / 2.14);
  }
  g.computeVertexNormals();
  return g;
}

/** A soft round table cloth so the coins have somewhere to land and cast shadows. */
function tableTexture(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  if (ctx !== null) {
    const g = ctx.createRadialGradient(256, 256, 20, 256, 256, 256);
    g.addColorStop(0, '#22343f');
    g.addColorStop(0.6, '#15222c');
    g.addColorStop(1, '#0a121a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  }
  return c;
}

/** A camera: where it is, what it looks at and its frustum at the near plane (which may be off centre). */
interface Frame {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  l: number;
  r: number;
  t: number;
  b: number;
}

const FOV = 34;
const NEAR = 0.1;
const FAR = 60;
/** How long the camera takes to pull back from the dock's bag to the draw (script seconds), and to return after. */
export const ZOOM_OUT = 0.9;
export const ZOOM_BACK = 0.45;

function frame(target: THREE.Vector3, elevDeg: number, d: number, aspect: number): Frame {
  const elev = THREE.MathUtils.degToRad(elevDeg);
  const pos = target.clone().addScaledVector(new THREE.Vector3(0, Math.sin(elev), Math.cos(elev)), d);
  const t = NEAR * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  return { pos, target: target.clone(), l: -t * aspect, r: t * aspect, t, b: -t };
}

/** The draw's framing: the bag and the landing row; on a tall phone it steps back so the row fits the width. */
function drawFrame(w: number, h: number): Frame {
  const aspect = w / h;
  const vHalf = THREE.MathUtils.degToRad(FOV / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  // a tall screen looks down more steeply, which spreads the bag and the row over its height
  const tall = aspect < 1;
  const target = new THREE.Vector3(0, tall ? 0.7 : 0.85, tall ? 1.15 : 1.1);
  const d = Math.max((tall ? 1.95 : 2.45) / Math.tan(vHalf), 2.3 / Math.tan(hHalf));
  return frame(target, tall ? 62 : 55, d, aspect);
}

/** The dock's framing: the bag alone, seen a little from above so its print faces the player. */
function dockFrame(w: number, h: number): Frame {
  const aspect = w / h;
  const vHalf = THREE.MathUtils.degToRad(FOV / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const d = Math.max(1.06 / Math.tan(vHalf), 1.5 / Math.tan(hHalf));
  return frame(new THREE.Vector3(0.05, 1.0, 0), 20, d, aspect);
}

/**
 * The dock's framing on a bigger canvas: the frustum is widened and shifted so the part of the canvas at `x, y, w, h`
 * (canvas pixels) shows exactly what the dock's own `w` x `h` canvas shows.
 */
function placed(f: Frame, x: number, y: number, w: number, h: number, W: number, H: number): Frame {
  const sx = (f.r - f.l) / w;
  const sy = (f.t - f.b) / h;
  const l = f.l - x * sx;
  const t = f.t + y * sy;
  return { pos: f.pos, target: f.target, l, r: l + W * sx, t, b: t - H * sy };
}

function mix(a: Frame, b: Frame, u: number): Frame {
  const k = (x: number, y: number): number => x + (y - x) * u;
  return {
    pos: a.pos.clone().lerp(b.pos, u),
    target: a.target.clone().lerp(b.target, u),
    l: k(a.l, b.l),
    r: k(a.r, b.r),
    t: k(a.t, b.t),
    b: k(a.b, b.b),
  };
}

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function apply(o: THREE.Object3D, p: Pose): void {
  o.position.set(p.x, p.y, p.z);
  o.rotation.set(p.rx, p.ry, p.rz, 'YXZ');
}

export function createBagScene(canvas: HTMLCanvasElement, opts: BagSceneOptions): BagScene {
  const rest = opts.view === 'rest';
  // a clear canvas: the dock's bag sits on the dock, and a draw from the dock fades its backdrop in over the table
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: rest ? 'low-power' : 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const lost = (e: Event): void => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    opts.onLost?.();
  };
  canvas.addEventListener('webglcontextlost', lost);
  const rate = opts.rate !== undefined && opts.rate > 0 ? opts.rate : 1;

  const scene = new THREE.Scene();
  const backdrop = new THREE.Color(opts.backdrop ?? '#0a121a');
  // Keep the fabric and print visible at the tall phone camera's farther distance.
  scene.fog = new THREE.Fog(opts.backdrop ?? '#0a121a', 20, 35);

  const camera = new THREE.PerspectiveCamera(FOV, 1, NEAR, FAR);

  // lights: a warm key with shadows, a cool rim from behind, a dim sky fill
  scene.add(new THREE.HemisphereLight('#9fc3d6', '#0b1218', 0.9));
  const key = new THREE.DirectionalLight('#fff1dc', 2.6);
  key.position.set(3.5, 7, 4.5);
  key.castShadow = true;
  // the bag at rest is small on screen: a smaller shadow map keeps its GPU memory down beside a draw's
  key.shadow.mapSize.set(rest ? 512 : 1024, rest ? 512 : 1024);
  key.shadow.camera.left = -3.5;
  key.shadow.camera.right = 3.5;
  key.shadow.camera.top = 3.5;
  key.shadow.camera.bottom = -3.5;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#7fd3c4', 1.4);
  rim.position.set(-4, 3, -5);
  scene.add(rim);

  const disposables: { dispose: () => void }[] = [];
  // set by dispose(): a face that arrives later allocates nothing (or is freed at once) and nothing renders again
  let disposed = false;
  // set when rendering threw after construction: the scene stops and reports it once (onError)
  let broken = false;
  const keep = <T extends { dispose: () => void }>(x: T): T => {
    if (disposed) x.dispose();
    else disposables.push(x);
    return x;
  };

  const tableTex = keep(new THREE.CanvasTexture(tableTexture()));
  tableTex.colorSpace = THREE.SRGBColorSpace;
  const tableMat = keep(
    new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.95, transparent: true }),
  );
  const table = new THREE.Mesh(keep(new THREE.CircleGeometry(9, 64)), tableMat);
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  table.visible = !rest;
  scene.add(table);

  // the bag (rocks about its base) holds the drawstring, its tail and the coins
  const bag = new THREE.Group();
  scene.add(bag);
  // the cloth is a little squat; the coins are not scaled with it
  const body = new THREE.Group();
  body.scale.set(1, 0.82, 1);
  bag.add(body);
  // a warm light just above the mouth so the pile inside reads
  const glow = new THREE.PointLight('#ffe2b8', 2.2, 3.2, 1.6);
  glow.position.set(0, 2.25, 0.35);
  bag.add(glow);
  const clothGeo = keep(bagGeometry());
  const weave = keep(new THREE.CanvasTexture(weaveCanvas()));
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  weave.repeat.set(18, 8);
  const exterior = keep(
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.86,
      bumpMap: weave,
      bumpScale: 0.018,
      side: THREE.FrontSide,
    }),
  );
  const artworkReady = exteriorCanvas(opts.exterior).then((c) => {
    if (disposed) return;
    const tex = keep(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    exterior.map = tex;
    exterior.needsUpdate = true;
  });
  const outside = new THREE.Mesh(clothGeo, exterior);
  outside.castShadow = true;
  const inside = new THREE.Mesh(
    clothGeo,
    keep(
      new THREE.MeshStandardMaterial({
        color: '#2a3a46',
        roughness: 1,
        flatShading: true,
        side: THREE.BackSide,
      }),
    ),
  );
  inside.receiveShadow = true;
  body.add(outside, inside);
  const gold = keep(new THREE.MeshStandardMaterial({ color: '#c9a85a', roughness: 0.45, metalness: 0.55 }));
  const string = new THREE.Mesh(keep(new THREE.TorusGeometry(0.84, 0.045, 10, 48)), gold);
  string.rotation.x = Math.PI / 2;
  string.position.y = 1.8;
  string.castShadow = true;
  body.add(string);
  const tail = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.62, 1.8, 0.58),
    new THREE.Vector3(0.95, 1.55, 0.95),
    new THREE.Vector3(1.12, 1.15, 1.02),
    new THREE.Vector3(1.18, 0.82, 1.0),
  ]);
  const tailMesh = new THREE.Mesh(keep(new THREE.TubeGeometry(tail, 24, 0.035, 8, false)), gold);
  tailMesh.castShadow = true;
  const knot = new THREE.Mesh(keep(new THREE.SphereGeometry(0.07, 12, 10)), gold);
  knot.position.copy(tail.getPoint(1));
  body.add(tailMesh, knot);

  // coins: blank until the faces are rasterised
  const coinGeo = keep(coinGeometry());
  const backTex = keep(new THREE.CanvasTexture(blankBack()));
  backTex.colorSpace = THREE.SRGBColorSpace;
  const backMat = keep(new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.6 }));
  const blankEdge = keep(
    new THREE.MeshStandardMaterial({ color: '#4b5864', roughness: 0.5, metalness: 0.3 }),
  );
  // where a coin lies is a seeded shuffle of the pile's places, independent of the contents' order and of the draw
  const n = opts.contents.length;
  const places = pileLayout(n);
  const rests = restOrder(n).map((p) => places[p]);
  // which coin rises is decided from the drawn defs alone (assignDraws), never from where a coin lies
  const picks = assignDraws(opts.contents, opts.drawn);
  const drawnCount = picks.filter((i) => i >= 0).length;
  const faces = [...opts.contents];
  const order = faces.map(() => -1);
  picks.forEach((i, k) => {
    if (i < 0) return;
    order[i] = k;
    faces[i] = opts.drawn[k] ?? faces[i] ?? '';
  });
  const coins = faces.map(() => {
    const m = new THREE.Mesh<THREE.BufferGeometry, THREE.Material[]>(coinGeo, [blankEdge, backMat, backMat]);
    m.castShadow = true;
    m.receiveShadow = true;
    bag.add(m);
    return m;
  });

  const unique = [...new Set(faces)];
  // the faces step down in size when the bag holds more kinds than the 32 MB texture budget allows at 512 px
  const size = budgetFaceSize(unique.length);
  const facesReady = Promise.all(
    unique.map(async (face) => {
      const c = await rasterise(opts.faceUrl(face), size);
      if (disposed) return null;
      const tex = keep(new THREE.CanvasTexture(c));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const front = keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.05 }));
      const edge = keep(
        new THREE.MeshStandardMaterial({ color: rimColour(c), roughness: 0.4, metalness: 0.35 }),
      );
      const set: THREE.Material[] = [edge, front, backMat];
      return [face, set] as const;
    }),
  ).then((all) => {
    if (disposed) return;
    const mats = all.filter((x) => x !== null);
    const byFace = new Map<string, THREE.Material[]>(mats.map(([f, m]) => [f, m]));
    coins.forEach((m, i) => {
      const mat = byFace.get(faces[i] ?? '');
      if (mat !== undefined) m.material = mat;
    });
    render();
  });

  const ready = Promise.all([facesReady, artworkReady]).then(() => render());

  // the camera: the dock's framing at rest; the draw's, or (from the dock) a pull back from the dock's bag to it
  let view = { w: 1, h: 1 };
  let dock: Frame | null = null;
  let back = 0;
  function fit(): void {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    view = { w, h };
    const at = opts.from?.() ?? null;
    if (at === null || at.width <= 0 || at.height <= 0) dock = null;
    else {
      const c = canvas.getBoundingClientRect();
      dock = placed(
        dockFrame(at.width, at.height),
        at.left - c.left,
        at.top - c.top,
        at.width,
        at.height,
        w,
        h,
      );
    }
  }
  function look(t: number): void {
    let f: Frame;
    let u = 1;
    if (rest) f = dockFrame(view.w, view.h);
    else {
      const to = drawFrame(view.w, view.h);
      if (dock === null) f = to;
      else {
        u = easeInOut(Math.min(1, Math.max(0, t / ZOOM_OUT))) * (1 - easeInOut(back));
        f = mix(dock, to, u);
      }
    }
    // the backdrop and the table fade in with the pull back (opaque, as before, when the draw is not from the dock)
    renderer.setClearColor(backdrop, rest ? 0 : dock === null ? 1 : 0.94 * u);
    tableMat.opacity = u;
    table.visible = !rest && u > 0.001;
    camera.position.copy(f.pos);
    camera.lookAt(f.target);
    camera.projectionMatrix.makePerspective(f.l, f.r, f.t, f.b, NEAR, FAR);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  const duration = totalDuration(drawnCount);
  let lastCount = -1;
  let shown = 0;
  function pose(t: number): void {
    shown = t;
    look(t);
    apply(bag, bagPose(t));
    coins.forEach((m, i) => {
      const r = rests[i];
      if (r !== undefined) apply(m, coinPose(r, order[i] ?? -1, drawnCount, t));
    });
    const left = bagCountAt(n, drawnCount, t);
    if (left !== lastCount) {
      lastCount = left;
      opts.onCount?.(left);
    }
  }
  let raf = 0;
  /** Stop and report a failure after construction, once (a throw during construction reaches the caller). */
  function fail(e: unknown): void {
    if (broken || disposed) return;
    broken = true;
    cancelAnimationFrame(raf);
    opts.onError?.(e);
  }
  /** Render unless the scene is disposed or broken; a throw becomes `fail`. */
  let renders = 0;
  function render(): void {
    if (disposed || broken) return;
    renders += 1;
    try {
      renderer.render(scene, camera);
    } catch (e) {
      fail(e);
    }
  }

  /** Read the canvas and the dock's place again (a throw becomes `fail`). */
  function refit(): void {
    if (disposed || broken) return;
    try {
      fit();
    } catch (e) {
      fail(e);
    }
  }

  const ro = new ResizeObserver(() => {
    if (disposed || broken) return;
    try {
      fit();
      look(shown);
    } catch (e) {
      fail(e);
      return;
    }
    render();
  });
  ro.observe(canvas);
  fit();
  pose(0);
  renderer.render(scene, camera); // a throw here reaches the caller: the scene never started

  let started = 0;
  let stats: FrameStats = { frames: 0, seconds: 0, fps: 0, worstFrameMs: 0 };
  let last = 0;
  let watch = fpsWatch();
  let slow = false;
  function frame(now: number): void {
    if (disposed || broken) return;
    try {
      step(now);
    } catch (e) {
      fail(e);
    }
  }
  function step(now: number): void {
    if (started === 0) {
      started = now;
      last = now;
    }
    const t = ((now - started) / 1000) * rate;
    const dt = now - last;
    last = now;
    stats = {
      frames: stats.frames + 1,
      seconds: (now - started) / 1000,
      fps: now > started ? (stats.frames * 1000) / (now - started) : 0,
      worstFrameMs: Math.max(stats.worstFrameMs, dt),
    };
    pose(Math.min(t, duration));
    render();
    if (broken) return;
    if (!slow && watch.frame(now)) {
      slow = true;
      opts.onSlow?.();
    }
    if (t < duration) raf = requestAnimationFrame(frame);
    else opts.onDone?.();
  }

  return {
    ready,
    duration,
    play: () => {
      cancelAnimationFrame(raf);
      // the dock may have moved or been mounted afresh (a warp's start) since the scene was made
      refit();
      started = 0;
      stats = { frames: 0, seconds: 0, fps: 0, worstFrameMs: 0 };
      watch = fpsWatch();
      slow = false;
      raf = requestAnimationFrame(frame);
    },
    back: () =>
      new Promise<void>((resolve) => {
        cancelAnimationFrame(raf);
        refit();
        if (dock === null || disposed || broken) {
          resolve();
          return;
        }
        let from = 0;
        const step = (now: number): void => {
          if (disposed || broken) {
            resolve();
            return;
          }
          from ||= now;
          back = Math.min(1, (((now - from) / 1000) * rate) / ZOOM_BACK);
          try {
            look(shown);
          } catch (e) {
            fail(e);
            resolve();
            return;
          }
          render();
          if (back < 1) raf = requestAnimationFrame(step);
          else resolve();
        };
        raf = requestAnimationFrame(step);
      }),
    finish: () => {
      cancelAnimationFrame(raf);
      if (!disposed && !broken) {
        try {
          pose(duration);
        } catch (e) {
          fail(e);
        }
        render();
      }
      // the draw ends whatever the renderer did
      opts.onDone?.();
    },
    faceSize: size,
    textureBytes: textureBytes(unique.length, size),
    seek: (t) => {
      cancelAnimationFrame(raf);
      if (disposed || broken) return;
      try {
        pose(t);
      } catch (e) {
        fail(e);
        return;
      }
      render();
    },
    stats: () => stats,
    renders: () => renders,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', lost);
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}
