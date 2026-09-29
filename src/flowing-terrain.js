import * as THREE from "three";
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";

// The caller supplies a seeded RNG once, never a new noise field per frame.
export class FlowingTerrain {
  constructor(random) {
    this.noise = new SimplexNoise({ random });
    this.travel = 0;
    this.geometry = new THREE.PlaneGeometry(55, 45, 45, 35);
    this.geometry.rotateX(-Math.PI / 2);
    this.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    // Fixed conservative bounds encompass every audio-driven deformation.
    this.geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-27.5, -4.1, -22.5), new THREE.Vector3(27.5, -1.5, 22.5));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -2.8, 0), 36);
    this.update(0, new THREE.Vector4());
  }

  heightAt(x, z, bass = 0, high = 0) {
    // Translate through a fixed 2D field: features travel toward the viewer
    // instead of random heights popping up at each vertex.
    const along = z - this.travel;
    const broad = this.noise.noise(x * .085, along * .085);
    const detail = this.noise.noise(x * .24 + 19.7, along * .24 - 8.3);
    return -2.8 + broad * (.45 + bass * .55) + detail * (.1 + high * .12);
  }

  // Audio is already exponentially smoothed by ProceduralScenes.
  update(delta, audio) {
    const dt = Math.max(0, Math.min(.05, delta));
    const bass = THREE.MathUtils.clamp(audio.x, 0, 1);
    const high = THREE.MathUtils.clamp(audio.z, 0, 1);
    const level = THREE.MathUtils.clamp(audio.w, 0, 1);
    this.travel += dt * (.55 + level * .45);
    const position = this.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      position.setY(i, this.heightAt(position.getX(i), position.getZ(i), bass, high));
    }
    position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}
