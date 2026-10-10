import { Scene, PerspectiveCamera, WebGLRenderer } from 'three';

export function renderOneFrame(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera
): HTMLCanvasElement {
  renderer.render(scene, camera);
  return renderer.domElement;
}
