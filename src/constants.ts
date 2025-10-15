export const FLOAT32_SIZE = 4; // bytes.

// The advice from https://webgpufundamentals.org/webgpu/lessons/webgpu-compute-shaders.html
// is to always use a workgroup size of 64, as this is what most GPUs are best at.
export const WORKGROUP_SIZE = 64;

export type Ray = {
  position: [number, number, number];
  direction: [number, number, number];
};

export type Triangle = {
  p1: [number, number, number];
  p2: [number, number, number];
  p3: [number, number, number];
};
