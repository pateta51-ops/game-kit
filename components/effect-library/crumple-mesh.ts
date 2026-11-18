export interface CrumpleMeshSettings {
  seed?: number;
  grid?: readonly [number, number];
  creases?: number;
  jitter?: number;
  creaseReach?: number;
  creaseSlope?: readonly [number, number];
  creaseWidth?: readonly [number, number];
  creaseStart?: readonly [number, number, number];
  creaseRamp?: number;
  creasePull?: number;
  footprint?: number;
  cornerPull?: readonly [number, number];
  edgeDepth?: number;
  dent?: readonly [number, number];
  depthCap?: number;
  perspective?: number;
  radius?: number;
  back?: readonly [number, number, number];
  backGradient?: number;
  light?: readonly [number, number, number];
  diffuse?: readonly [number, number];
  shine?: readonly [number, number];
  alphaCutoff?: number;
}

export const clamp = (v: number, a = 0, b = 1): number => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
export const smooth = (a: number, b: number, x: number): number => {
  const u = clamp((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Vert {
  x: number;
  y: number;
  u: number;
  v: number;
  nx: number;
  ny: number;
  nz: number;
}
interface Crease {
  nx: number;
  ny: number;
  c: number;
  m: number;
  s: number;
  L: number;
  a: number;
}
interface Mesh {
  w: number;
  h: number;
  verts: Vert[];
  tris: Uint16Array;
  creases: Crease[];
  grid: readonly [number, number];
}

function makeMesh(w: number, h: number, o: CrumpleMeshSettings): Mesh {
  const grid = o.grid ?? [16, 22];
  const [cols, rows] = grid;
  const count = o.creases ?? 9;
  const [slope, slopeRange] = o.creaseSlope ?? [0.55, 0.75];
  const [width, widthRange] = o.creaseWidth ?? [0.07, 0.13];
  const [start, stagger, startJitter] = o.creaseStart ?? [0.02, 0.5, 0.06];
  const R = rng(o.seed ?? 7);
  const verts: Vert[] = [];
  const tris: number[] = [];
  for (let j = 0; j <= rows; j += 1)
    for (let i = 0; i <= cols; i += 1) {
      let x = (i / cols - 0.5) * w;
      let y = (j / rows - 0.5) * h;
      // interior vertices are jittered so that the facets are irregular, not a grid (the texture follows: no stretching)
      if (i > 0 && i < cols) x += (R() - 0.5) * (o.jitter ?? 0.7) * (w / cols);
      if (j > 0 && j < rows) y += (R() - 0.5) * (o.jitter ?? 0.7) * (h / rows);
      verts.push({ x, y, u: x / w + 0.5, v: y / h + 0.5, nx: R() * 2 - 1, ny: R() * 2 - 1, nz: R() * 2 - 1 });
    }
  const id = (i: number, j: number): number => j * (cols + 1) + i;
  for (let j = 0; j < rows; j += 1)
    for (let i = 0; i < cols; i += 1) {
      const a = id(i, j);
      const b = id(i + 1, j);
      const c = id(i + 1, j + 1);
      const d = id(i, j + 1);
      if (R() < 0.5) tris.push(a, b, c, a, c, d);
      else tris.push(a, b, d, b, c, d);
    }
  // creases: a line across the card; each is a valley or a ridge with flat shoulders, coming in one after another
  const creases: Crease[] = [];
  for (let k = 0; k < count; k += 1) {
    const ang = R() * Math.PI;
    const nx = Math.cos(ang);
    const ny = Math.sin(ang);
    const reach = (Math.abs(nx) * w + Math.abs(ny) * h) / 2;
    creases.push({
      nx,
      ny,
      c: (R() - 0.5) * (o.creaseReach ?? 1.1) * reach,
      m: slope + R() * slopeRange,
      s: R() < 0.5 ? -1 : 1,
      L: (width + R() * widthRange) * h,
      a: start + (k / count) * stagger + R() * startJitter,
    });
  }
  return { w, h, grid, verts, tris: new Uint16Array(tris), creases };
}

/** The vertex positions at crumple progress p (0 flat .. 1 crumpled), centred on the card, z towards the viewer. */
function shape(M: Mesh, p: number, out: Float32Array, o: CrumpleMeshSettings): void {
  const { w, h, verts, creases, grid: [cols, rows] } = M;
  const [basePull, edgePull] = o.cornerPull ?? [0.8, 0.4];
  const [depthDent, planeDent] = o.dent ?? [0.035, 0.12];
  const e = smooth(0, 1, p);
  let zs = 0;
  for (let i = 0; i < verts.length; i += 1) {
    const v = verts[i];
    if (v === undefined) continue;
    let x = v.x;
    let y = v.y;
    let z = 0;
    for (const k of creases) {
      const f = smooth(k.a, k.a + (o.creaseRamp ?? 0.42), p);
      if (f <= 0) continue;
      const d = v.x * k.nx + v.y * k.ny - k.c;
      const ad = Math.min(Math.abs(d), k.L);
      const mm = k.m * f;
      z += k.s * mm * ad;
      const pull = Math.sign(d) * ad * (1 - 1 / Math.sqrt(1 + mm * mm)); // the fold takes up paper: the card shrinks across it
      x -= k.nx * pull * (o.creasePull ?? 0.55);
      y -= k.ny * pull * (o.creasePull ?? 0.55);
    }
    const r2 = ((v.x / (w / 2)) ** 2 + (v.y / (h / 2)) ** 2) / 2;
    const g = 1 - e * (1 - (o.footprint ?? 0.56)) * (basePull + edgePull * r2); // corners are pulled in more than the middle
    x *= g;
    y *= g;
    z -= e * (o.edgeDepth ?? 0.3) * h * r2; // the edges fold back: a wad, but with the face still towards you
    z += e * e * v.nz * depthDent * h; // small random dents: more, smaller facets
    x += e * e * v.nx * planeDent * (w / cols);
    y += e * e * v.ny * planeDent * (h / rows);
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
    zs += z;
  }
  const zm = zs / verts.length;
  let za = 0;
  for (let i = 0; i < verts.length; i += 1) {
    out[i * 3 + 2] = (out[i * 3 + 2] ?? 0) - zm;
    za = Math.max(za, Math.abs(out[i * 3 + 2] ?? 0));
  }
  const cap = (o.depthCap ?? 0.42) * h * p + 1e-6; // the wad's depth stays plausible
  if (za > cap) for (let i = 0; i < verts.length; i += 1) out[i * 3 + 2] = (out[i * 3 + 2] ?? 0) * (cap / za);
}

const VS = `#version 300 es
in vec3 aPos; in vec2 aUV; uniform vec2 uSize; uniform vec2 uC; uniform float uF; out vec3 vP; out vec2 vUV;
void main() { vec3 p = aPos; float k = uF / (uF - p.z); vec2 s = uC + (p.xy - uC) * k; vP = p; vUV = aUV;
  gl_Position = vec4(s.x / uSize.x * 2.0 - 1.0, 1.0 - s.y / uSize.y * 2.0, -p.z / 4000.0, 1.0); }`;
const FS = `#version 300 es
precision highp float; in vec3 vP; in vec2 vUV; uniform sampler2D uT; uniform float uAlpha; uniform vec3 uBack; uniform float uGradient; uniform vec3 uLight;
uniform vec2 uDiffuse; uniform vec2 uShine; uniform float uCutoff; out vec4 o;
void main() {
  vec4 t = texture(uT, vUV); if (t.a < uCutoff) discard;
  vec3 n = normalize(cross(dFdx(vP), dFdy(vP))); if (n.z < 0.0) n = -n;
  vec3 L = normalize(uLight);
  float d = max(dot(n, L), 0.0), flat0 = L.z;
  float shade = (uDiffuse.x + uDiffuse.y * d) / (uDiffuse.x + uDiffuse.y * flat0);
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), uShine.x) * uShine.y;
  bool front = !gl_FrontFacing;
  vec3 col = front ? t.rgb : uBack + uGradient * vUV.y;
  col = col * shade + spec;
  o = vec4(col * uAlpha, uAlpha);
}`;

function rotate(x: number, y: number, z: number, rx: number, ry: number, rz: number): [number, number, number] {
  let c = Math.cos(rx);
  let s = Math.sin(rx);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ry);
  s = Math.sin(ry);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(rz);
  s = Math.sin(rz);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}

export interface Pose {
  /** Crumple progress, 0 flat .. 1 crumpled. */
  p: number;
  /** The card's centre in canvas pixels, and its scale (sx, sy: the squash). */
  cx: number;
  cy: number;
  sx: number;
  sy: number;
  rx: number;
  ry: number;
  rz: number;
  alpha: number;
}

export function crumpleMesh(
  gl: WebGL2RenderingContext, image: TexImageSource, w: number, h: number,
  settings: CrumpleMeshSettings, cleanup: (release: () => void) => void,
): (pose: Pose, width: number, height: number) => void {
  const sh = (type: number, text: string): WebGLShader => {
    const s = gl.createShader(type);
    if (s === null) throw new Error('no shader');
    cleanup(() => { gl.deleteShader(s); });
    gl.shaderSource(s, text);
    gl.compileShader(s);
    if (!(gl.getShaderParameter(s, gl.COMPILE_STATUS) as boolean)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const prog = gl.createProgram();
  if (!prog) throw new Error('no program');
  cleanup(() => { gl.deleteProgram(prog); });
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!(gl.getProgramParameter(prog, gl.LINK_STATUS) as boolean)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link failed');
  const mesh = makeMesh(w, h, settings);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const uvBuf = gl.createBuffer();
  const posBuf = gl.createBuffer();
  const idxBuf = gl.createBuffer();
  const tex = gl.createTexture();
  cleanup(() => {
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(uvBuf);
    gl.deleteBuffer(posBuf);
    gl.deleteBuffer(idxBuf);
    gl.deleteTexture(tex);
  });
  if (!vao || !uvBuf || !posBuf || !idxBuf || !tex) throw new Error('no mesh buffers');
  const uv = new Float32Array(mesh.verts.flatMap((v) => [v.u, v.v]));
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
  const aUV = gl.getAttribLocation(prog, 'aUV');
  gl.enableVertexAttribArray(aUV);
  gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.verts.length * 12, gl.DYNAMIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.tris, gl.STATIC_DRAW);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const local = new Float32Array(mesh.verts.length * 3);
  const world = new Float32Array(mesh.verts.length * 3);
  return (pose, width, height) => {
    if (pose.alpha <= 0 || width <= 0 || height <= 0) return;
    shape(mesh, pose.p, local, settings);
    for (let i = 0; i < mesh.verts.length; i += 1) {
      const [x, y, z] = rotate(
        (local[i * 3] ?? 0) * pose.sx,
        (local[i * 3 + 1] ?? 0) * pose.sy,
        (local[i * 3 + 2] ?? 0) * Math.min(pose.sx, pose.sy),
        pose.rx,
        pose.ry,
        pose.rz,
      );
      world[i * 3] = pose.cx + x;
      world[i * 3 + 1] = pose.cy + y;
      world[i * 3 + 2] = z;
    }
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, world);
    gl.uniform2f(gl.getUniformLocation(prog, 'uSize'), width, height);
    gl.uniform2f(gl.getUniformLocation(prog, 'uC'), pose.cx, pose.cy);
    gl.uniform1f(gl.getUniformLocation(prog, 'uF'), mesh.h * (settings.perspective ?? 5));
    gl.uniform1f(gl.getUniformLocation(prog, 'uAlpha'), pose.alpha);
    gl.uniform3f(gl.getUniformLocation(prog, 'uBack'), ...(settings.back ?? [0.25, 0.25, 0.25]));
    gl.uniform1f(gl.getUniformLocation(prog, 'uGradient'), settings.backGradient ?? 0);
    gl.uniform3f(gl.getUniformLocation(prog, 'uLight'), ...(settings.light ?? [-0.5, -0.6, 0.8]));
    gl.uniform2f(gl.getUniformLocation(prog, 'uDiffuse'), ...(settings.diffuse ?? [0.5, 0.6]));
    gl.uniform2f(gl.getUniformLocation(prog, 'uShine'), ...(settings.shine ?? [28, 0.18]));
    gl.uniform1f(gl.getUniformLocation(prog, 'uCutoff'), settings.alphaCutoff ?? 0.5);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(prog, 'uT'), 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElements(gl.TRIANGLES, mesh.tris.length, gl.UNSIGNED_SHORT, 0);
  };
}
