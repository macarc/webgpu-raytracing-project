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

export const materials: Material[] = [
  {
    name: "carpet",
    a125: 0.15,
    a250: 0.25,
    a500: 0.5,
    a1000: 0.6,
    a2000: 0.7,
    a4000: 0.7,
    scatter: 0.2,
  },
  {
    name: "concrete",
    a125: 0.12,
    a250: 0.09,
    a500: 0.07,
    a1000: 0.05,
    a2000: 0.05,
    a4000: 0.04,
    scatter: 0.1,
  },
  {
    name: "plaster",
    a125: 0.14,
    a250: 0.1,
    a500: 0.06,
    a1000: 0.05,
    a2000: 0.04,
    a4000: 0.04,
    scatter: 0.1,
  },
];

export function materialNameToIndex(name: string): number {
  for (let i = 0; i < materials.length; ++i) {
    if (materials[i].name === name) {
      return i;
    }
  }

  throw new Error(`Unknown material: '${name}'`);
}
