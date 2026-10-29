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
      const color = shade(scene, hit, miss);
      pixels[i++] = color[0] * 255;
      pixels[i++] = color[1] * 255;
      pixels[i++] = color[2] * 255;
      pixels[i++] = color[3] * 255;
    }
  }
  return pixels;
}

function shade(scene, hit, miss) {
  if (!scene.sun || !hit.object || !hit.point) return hit.color || miss;
  const origin = [
    hit.point[0] + scene.sun[0] * 0.08,
    hit.point[1] + scene.sun[1] * 0.08,
    hit.point[2] + scene.sun[2] * 0.08,
  ];
  const blocked = cast(origin, scene.sun, scene.objects, miss);
  if (!blocked.object || blocked.t > 80) return hit.color;
  return [hit.color[0] * 0.45, hit.color[1] * 0.45, hit.color[2] * 0.45, hit.color[3]];
}
