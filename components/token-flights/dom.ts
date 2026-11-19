// K447: port of Warp's Edge src/ui/tokens3d look.ts endRect and scene.ts isSoftwareGl.

/** The element's rect once its running animations have ended (their clocks are put back). */
export function endRect(node: HTMLElement): DOMRect {
  const animations = node.getAnimations();
  const times = animations.map((a) => a.currentTime);
  animations.forEach((a) => {
    const end = a.effect?.getComputedTiming().endTime;
    if (typeof end === 'number' && Number.isFinite(end)) a.currentTime = end;
  });
  const rect = node.getBoundingClientRect();
  animations.forEach((a, i) => {
    a.currentTime = times[i] ?? null;
  });
  return rect;
}

/** The WebGL implementation rasterises on the CPU (SwiftShader, llvmpipe/softpipe, Windows' WARP). Without `gl` a probe
 * canvas is tried and lost again; no WebGL at all counts as software (keep the 2D tokens). */
export function isSoftwareGl(gl?: WebGLRenderingContext | WebGL2RenderingContext | null, doc?: Document): boolean {
  let probe = false;
  if (!gl) {
    const canvas = (doc ?? document).createElement('canvas');
    gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
    if (!gl) return true;
    probe = true;
  }
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  if (probe) gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}
