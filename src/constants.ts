export const FLOAT32_SIZE = 4; // bytes.

// The advice from https://webgpufundamentals.org/webgpu/lessons/webgpu-compute-shaders.html
// is to always use a workgroup size of 64, as this is what most GPUs are best at.
export const WORKGROUP_SIZE = 64;

export const SAMPLE_RATE = 48000;
export const SPEED_OF_SOUND = 340;

export type Vec3 = [number, number, number];

export type Ray = {
  position: [number, number, number];
  direction: [number, number, number];
};

export type Triangle = {
  material: string;
  p1: [number, number, number];
  p2: [number, number, number];
  p3: [number, number, number];
};

export type Material = {
  name: string;
  a125: number;
  a250: number;
  a500: number;
  a1000: number;
  a2000: number;
  a4000: number;
  scatter: number;
};

export function materialNameToIndex(
  materials: Material[],
  name: string,
): number {
  const index = materials.findIndex((material) => material.name === name);
  if (index === -1) {
    throw new Error(`Unknown material: '${name}'`);
  }
  return index;
}
