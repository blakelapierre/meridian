import { cast, project } from "./cast.js";

export function paintFrame(scene, width, height, buffer) {
  const pixels = buffer ?? new Uint8ClampedArray(width * height * 4);
  const miss = scene.miss || [0, 0, 0, 1];
  let i = 0;
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const direction = project(u, v, scene.camera);
      const hit = cast(scene.camera.origin, direction, scene.objects, miss);
      pixels[i++] = hit.color[0] * 255;
      pixels[i++] = hit.color[1] * 255;
      pixels[i++] = hit.color[2] * 255;
      pixels[i++] = hit.color[3] * 255;
    }
  }
  return pixels;
}
