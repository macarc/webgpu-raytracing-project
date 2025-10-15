export const FLOAT32_SIZE = 4; // bytes.

// The advice from https://webgpufundamentals.org/webgpu/lessons/webgpu-compute-shaders.html
// is to always use a workgroup size of 64, as this is what most GPUs are best at.
export const WORKGROUP_SIZE = 64;
