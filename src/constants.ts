// Constants and type definitions for Ray/Triangle/Material.

import { Vec3 } from "./vectors";

export const FLOAT32_SIZE = 4; // bytes.

// The advice from https://webgpufundamentals.org/webgpu/lessons/webgpu-compute-shaders.html
// is to always use a workgroup size of 64, as this is what most GPUs are best at.
export const WORKGROUP_SIZE = 64;

// From WebGPU specification
export const STANDARD_MAX_STORAGE_BUFFER_SIZE = 134217728; // bytes
export const STANDARD_MAX_UNIFORM_BUFFER_SIZE = 65536; // bytes

// This is smaller than WebGPU since having full-size buffers would
// exceed WASM's supported memory size (2^16 * 64KiB)
// https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory/Memory#exceptions
export const WASM_MAX_STORAGE_BUFFER_SIZE = 134217728 / 2; // bytes
export const WASM_MAX_UNIFORM_BUFFER_SIZE = 65536; // bytes
export const WEBASSEMBLY_PAGE_SIZE = 65536;

export const SPEED_OF_SOUND = 340;

// NOTE: if SAMPLE_RATE is changed, then the filter coefficients in dsp.ts must be updated!
export const SAMPLE_RATE = 48000;

export const FLAG_ESCAPED = 0.0;
export const FLAG_ALIVE = 1.0;

/**
 * Represents a ray.
 */
export type Ray = {
  position: Vec3;
  direction: Vec3;
  intensity: number;
};

/**
 * Represents a triangle, in terms of its vertices' coordinates.
 */
export type Triangle = {
  material: string;
  p1: Vec3;
  p2: Vec3;
  p3: Vec3;
};

/**
 * Represents a surface material, with absorption coefficent for each frequency band.
 */
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

// https://sashamaps.net/docs/resources/20-colors/
export const MATERIAL_COLOURS = [
  "#e6194B",
  "#3cb44b",
  "#ffe119",
  "#4363d8",
  "#f58231",
  "#911eb4",
  "#42d4f4",
  "#f032e6",
  "#bfef45",
  "#fabed4",
  "#469990",
  "#dcbeff",
  "#9A6324",
  "#fffac8",
  "#800000",
  "#aaffc3",
  "#808000",
  "#ffd8b1",
  "#000075",
  "#a9a9a9",
  "#ffffff",
  "#000000",
];
