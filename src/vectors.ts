// Vector definition and helper functions.

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

/**
 * Calculate dot product.
 * @param a
 * @param b
 * @returns a . b
 */
export function vDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Normalise a vector.
 * @param a
 * @returns |a|
 */
export function vNormalise(a: Vec3): Vec3 {
  const magnitude = Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2);
  return [a[0] / magnitude, a[1] / magnitude, a[2] / magnitude];
}

/**
 * Multiply a vector by a scalar.
 * @param c
 * @param a
 * @returns c * a
 */
export function vScale(c: number, a: Vec3): Vec3 {
  return [c * a[0], c * a[1], c * a[2]];
}

/**
 * Check if vectors are equal.
 * @param a
 * @param b
 * @returns true if the vectors are equal.
 */
export function vEquals(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
