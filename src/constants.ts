export const FLOAT32_SIZE = 4; // bytes.

// The advice from https://webgpufundamentals.org/webgpu/lessons/webgpu-compute-shaders.html
// is to always use a workgroup size of 64, as this is what most GPUs are best at.
export const WORKGROUP_SIZE = 64;

export const SAMPLE_RATE = 48000;
export const SPEED_OF_SOUND = 340;

/**
 * A 3D vector.
 */
export type Vec3 = [number, number, number];

/**
 * Calculate a + b.
 * @param a
 * @param b
 * @returns a + b.
 */
export function vAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Calculate b - a.
 * @param b
 * @param a
 * @returns b - a as a Vec3
 */
export function vSubtract(b: Vec3, a: Vec3): Vec3 {
  return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
}

/**
 * Calculate cross product.
 * @param a
 * @param b
 * @returns a x b
 */
export function vCross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function vDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vNormalise(a: Vec3): Vec3 {
  const magnitude = Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2);
  return [a[0] / magnitude, a[1] / magnitude, a[2] / magnitude];
}

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

/**
 * Convert material name into an index into the materials array.
 * @param materials the array of materials.
 * @param name the name of the material.
 * @returns the index of the material in materials.
 */
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

// Regular expression to match against user-agent to test if the device is mobile.
const mobileNames = [
  /Android/i,
  /webOS/i,
  /iPhone/i,
  /iPad/i,
  /iPod/i,
  /BlackBerry/i,
  /Windows Phone/i,
];

// Detect if on mobile by matching against the user-agent.
// Source: https://stackoverflow.com/a/11381730
export const isOnMobile = mobileNames.some((name) => {
  return navigator.userAgent.match(name);
});

// From PipeScore: https://github.com/macarc/PipeScore/blob/main/src/common/file.ts
export async function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.readAsText(file, "UTF-8");
    reader.addEventListener("error", rej);
    reader.addEventListener("load", (e) => {
      const data = e.target?.result;
      if (data) res(data.toString());
    });
  });
}

export function saveFile(
  name: string,
  contents: string | ArrayBuffer,
  type: string,
) {
  const blob = new Blob([contents], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}
