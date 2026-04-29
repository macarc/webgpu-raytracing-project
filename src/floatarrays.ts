import { Triangle, Material, Ray, FLOAT32_SIZE } from "./constants";
import { materialNameToIndex } from "./helpers/common";

export const SIZEOF_RAY = 16 * FLOAT32_SIZE; // 16 floats per ray.
export const SIZEOF_MATERIAL = 8 * FLOAT32_SIZE; // 8 floats per material.

export function raysToFloatArray(rays: Ray[]): Float32Array<ArrayBuffer> {
  return new Float32Array(
    rays.flatMap((ray) => [
      ...ray.position,
      ...ray.direction,
      ...[0, 0, 0],
      0,
      ray.intensity,
      ray.intensity,
      ray.intensity,
      ray.intensity,
      ray.intensity,
      ray.intensity,
    ]),
  );
}

/**
 * Convert triangles to a Float32Array to be passed to a shader.
 * @param triangles
 * @param materials
 * @returns the triangles mapped into a Float32Array, in the format required by the shader.
 */
export function trianglesToFloatArray(
  triangles: Triangle[],
  materials: Material[],
): Float32Array<ArrayBuffer> {
  return new Float32Array(
    triangles.flatMap((triangle) => [
      materialNameToIndex(materials, triangle.material),
      ...triangle.p1,
      triangle.p2[0] - triangle.p1[0],
      triangle.p2[1] - triangle.p1[1],
      triangle.p2[2] - triangle.p1[2],
      triangle.p3[0] - triangle.p1[0],
      triangle.p3[1] - triangle.p1[1],
      triangle.p3[2] - triangle.p1[2],
    ]),
  );
}

/**
 * Convert materials to a Float32Array to be passed to a shader.
 * @param materials
 * @returns the materials mapped into a Float32Array, in the format required by the shader.
 */
export function materialsToFloatArray(materials: Material[]) {
  return new Float32Array(
    materials.flatMap((material) => [
      1 - material.a125,
      1 - material.a250,
      1 - material.a500,
      1 - material.a1000,
      1 - material.a2000,
      1 - material.a4000,
      material.scatter,
      0, // padding
    ]),
  );
}
