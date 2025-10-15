import { Ray, Triangle } from "./constants";

export function raysToFloatArray(rays: Ray[]): Float32Array<ArrayBuffer> {
  return new Float32Array(
    rays.flatMap((ray) => [...ray.position, ...ray.direction]),
  );
}

export function trianglesToFloatArray(
  triangles: Triangle[],
): Float32Array<ArrayBuffer> {
  return new Float32Array(
    triangles.flatMap((triangle) => [
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

// Create the result data - this is initially infinity (i.e. no intersection).
export function initialIntersectionsFloatArray(
  count: number,
): Float32Array<ArrayBuffer> {
  return new Float32Array(count).fill(Infinity);
}
