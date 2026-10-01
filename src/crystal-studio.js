import * as THREE from "three";

// Procedural HDR softboxes inspired by GeometryPainterThreeJS's studio rig.
// One 512x256 half-float texture per Crystals scene; Three caches its PMREM.
// No asset downloads, dynamic cube cameras, or per-frame lighting-map updates.
export function createCrystalEnvironment() {
  const width = 512, height = 256;
  const panels = [
    { direction: [-2, 4, 3], size: [.7, .35], color: [1, .94, .86], power: 6 },
    { direction: [1, 3, -2], size: [.8, .075], color: [.8, .9, 1], power: 12 },
    { direction: [-4, .5, 1], size: [.12, .85], color: [.12, .8, 1], power: 7 },
    { direction: [4, 1, 2], size: [.1, .7], color: [1, .12, .55], power: 6 },
    { direction: [0, 1, -4], size: [.6, .5], color: [.4, .18, 1], power: 4 },
    { direction: [0, -4, 1], size: [.8, .4], color: [.3, .55, 1], power: 1.2 },
  ].map(panel => {
    const normal = new THREE.Vector3(...panel.direction).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal).normalize();
    return { ...panel, normal, right, up: new THREE.Vector3().crossVectors(normal, right) };
  });
  const data = new Uint16Array(width * height * 4), direction = new THREE.Vector3();
  for (let y = 0; y < height; y++) {
    const latitude = ((y + .5) / height - .5) * Math.PI;
    for (let x = 0; x < width; x++) {
      const longitude = ((x + .5) / width - .5) * Math.PI * 2;
      direction.set(Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude));
      let r = .006, g = .008, b = .016;
      for (const panel of panels) {
        const facing = direction.dot(panel.normal);
        if (facing <= 0) continue;
        const px = Math.abs(direction.dot(panel.right) / facing) / panel.size[0];
        const py = Math.abs(direction.dot(panel.up) / facing) / panel.size[1];
        const light = (1 - THREE.MathUtils.smoothstep(Math.max(px, py), .82, 1)) * panel.power;
        r += panel.color[0] * light; g += panel.color[1] * light; b += panel.color[2] * light;
      }
      const offset = (y * width + x) * 4;
      data[offset] = THREE.DataUtils.toHalfFloat(r);
      data[offset + 1] = THREE.DataUtils.toHalfFloat(g);
      data[offset + 2] = THREE.DataUtils.toHalfFloat(b);
      data[offset + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.name = "Crystals / procedural neon studio";
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
