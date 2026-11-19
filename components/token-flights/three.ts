// K447: Warp's Edge tokens3d scene.ts screen-to-table mapping, for the caller's own camera. Imports three.js.
import { Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three';
import type { ToWorld } from './flight3d.ts';

export * from './flight3d.ts';
export { endRect, isSoftwareGl } from './dom.ts';

/** Screen px (in the canvas box `size()`) to the table plane z = 0, scaled 1:1 with px where the camera's view is h px tall. */
export function tableMapper(camera: PerspectiveCamera, size: () => { width: number; height: number }): ToWorld {
  const ray = new Raycaster(), screen = new Vector2(), point = new Vector3(), plane = new Plane(new Vector3(0, 0, 1), 0);
  return (x, y, radius) => {
    const { width: w, height: h } = size();
    ray.setFromCamera(screen.set((x / w) * 2 - 1, 1 - (y / h) * 2), camera);
    ray.ray.intersectPlane(plane, point);
    const distance = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    return { x: point.x, y: point.y, z: 0, scale: (radius * camera.position.distanceTo(point)) / distance };
  };
}
