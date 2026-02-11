import { materialNameToIndex, Triangle, Material } from "./constants";

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
