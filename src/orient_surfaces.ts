import { runShader } from "./webgpu";
import { WORKGROUP_SIZE } from "./constants";
import { Triangle } from "./constants";

const shaderCode = /* wgsl */ `
  struct Triangle {
    x: f32, y: f32, z: f32,
    u1: f32, u2: f32, u3: f32,
    v1: f32, v2: f32, v3: f32,
  }

  @group(0) @binding(0)
  var<storage, read> triangles: array<Triangle>;

  // TODO: these shouldn't really be floats.
  @group(0) @binding(1)
  var<storage, read_write> output: array<f32>;

  const INFINITY: f32 = 1e10;

  fn distanceTo(origin: vec3f, ray: vec3f, triangle: Triangle) -> f32 {
    let smallestPositiveNormal = 1.17549435082228750797e-38f;
    let eps = smallestPositiveNormal;
    let eps1 = 1 + eps;

    let edge1 = vec3f(triangle.u1, triangle.u2, triangle.u3);
    let edge2 = vec3f(triangle.v1, triangle.v2, triangle.v3);
    let offset = vec3f(origin.x - triangle.x, origin.y - triangle.y, origin.z - triangle.z);

    let ray_cross_e2 = cross(ray, edge2);
    let offset_cross_e1 = cross(offset, edge1);

    let det = dot(edge1, ray_cross_e2);
    let inv_det = 1.0 / det;

    let u = inv_det * dot(offset, ray_cross_e2);
    let v = inv_det * dot(ray, offset_cross_e1);

    let t = inv_det * dot(edge2, offset_cross_e1);

    if ((abs(det) < eps) || (u < -eps) || (v < -eps) || (u + v > eps1)) {
      // Ray missed the triangle.
    } else if (t > eps) {
      return t;
    }

    return INFINITY;
  }

  @compute @workgroup_size(${WORKGROUP_SIZE})
  fn main(
    @builtin(global_invocation_id)
    global_id : vec3u,
  ) {
    let index = global_id.x;
    
    let triangleCount = u32(arrayLength(&triangles));

    // Avoid accessing the buffer out of bounds - this could happen
    // if NUM_RAYS and WORKGROUP_SIZE don't line up.
    if (index >= triangleCount) {
      return;
    }

    let trgtTriangle = triangles[index];
    // https://discussions.unity.com/t/calculate-uv-at-center-of-triangle/69523/2
    let targetCentre = vec3(
      trgtTriangle.x * 3 + (trgtTriangle.u1 + trgtTriangle.v1),
      trgtTriangle.y * 3 + (trgtTriangle.u2 + trgtTriangle.v2),
      trgtTriangle.z * 3 + (trgtTriangle.u3 + trgtTriangle.v3)
    ) / 3;

    var origin = vec3(0.0, 0.0, 0.0);
    var ray = normalize(targetCentre - origin);
    var targetDistance = distanceTo(origin, ray, trgtTriangle);

    // Since the origin (0,0,0) might be aligned with the triangle, in this case move the origin to (0,0,1).
    if (targetDistance == INFINITY) {
      origin.z += 1.0;
      ray = normalize(targetCentre - origin);
      targetDistance = distanceTo(origin, ray, trgtTriangle);
    }
    if (targetDistance == INFINITY) {
      origin.x += 1.0;
      ray = normalize(targetCentre - origin);
      targetDistance = distanceTo(origin, ray, trgtTriangle);
    }
    if (targetDistance == INFINITY) {
      output[index] = INFINITY;
      return;
    }

    let target_edge_1 = vec3(trgtTriangle.u1, trgtTriangle.u2, trgtTriangle.u3);
    let target_edge_2 = vec3(trgtTriangle.v1, trgtTriangle.v2, trgtTriangle.v3);
    let currentRayNormalDirection = i32(dot(ray, cross(target_edge_1, target_edge_2)) > 0);

    var intersectionCount = 1;
    var intersectionsBeforeTargetCount = 0;

    for (var i: u32 = 0; i < triangleCount; i++) {
      let triangle = triangles[i];

      let distance = distanceTo(origin, ray, triangle);

      if (i != index && distance < INFINITY) {
        intersectionCount += 1;
        if (distance < targetDistance) {
          intersectionsBeforeTargetCount += 1;
        }
      }
    }

    var shouldFlip: i32 = currentRayNormalDirection * 2 - 1;

    // If the origin is outside the geometry, flip the sign.
    if (intersectionCount % 2 == 0) {
      shouldFlip *= -1;
    }

    // If the ray intersects an odd number of triangles before the current one,
    // flip the sign.
    if (intersectionsBeforeTargetCount % 2 == 1) {
      shouldFlip *= -1;
    }

    output[index] = f32(shouldFlip);
  }
`;

function removeZeroTriangles(triangles: Triangle[]) {
  const indicesToRemove: number[] = [];
  for (let i = 0; i < triangles.length; ++i) {
    const tri = triangles[i];
    const p1 = new Float32Array(tri.p1);
    const p2 = new Float32Array(tri.p2);
    const p3 = new Float32Array(tri.p3);
    if (
      (tri.p1[0] === tri.p2[0] &&
        tri.p1[1] === tri.p2[1] &&
        tri.p1[2] === tri.p2[2]) ||
      (tri.p2[0] === tri.p3[0] &&
        tri.p2[1] === tri.p3[1] &&
        tri.p2[2] === tri.p3[2]) ||
      (tri.p1[0] === tri.p3[0] &&
        tri.p1[1] === tri.p3[1] &&
        tri.p1[2] === tri.p3[2])
    ) {
      indicesToRemove.push(i);
    }
  }

  for (let j = 0; j < indicesToRemove.length; ++j) {
    const indexToRemove = indicesToRemove[j] - j;
    triangles.splice(indexToRemove, 1);
  }
}

/** Orient triangles so that their normal vectors point outwards.
 *
 * @param triangles triangles to orient - must form a closed surface.
 */
export async function orientTriangles(
  triangles: Triangle[],
): Promise<Triangle[]> {
  removeZeroTriangles(triangles);

  let result = await runShader(
    shaderCode,
    [
      {
        data: new Float32Array(
          triangles.flatMap((tri) => [
            ...tri.p1,
            ...tri.p2.map((p, i) => p - tri.p1[i]),
            ...tri.p3.map((p, i) => p - tri.p1[i]),
          ]),
        ),
        readonly: true,
        output: false,
      },
      {
        data: new Float32Array(triangles.length),
        readonly: false,
        output: true,
      },
    ],
    triangles.length,
  );

  let flips = result && result[0];

  if (flips) {
    for (let i = 0; i < flips.length; i++) {
      const sign = flips[i];
      if (sign !== 1 && sign !== -1) {
        console.error(
          `Received invalid output ${sign} from triangle orientation shader at index ${i}.`,
        );
      } else if (sign === -1) {
        // Swap the triangle direction.
        const p2 = triangles[i].p3;
        const p3 = triangles[i].p2;
        triangles[i].p2 = p2;
        triangles[i].p3 = p3;
      }
    }
  } else {
    throw new Error(
      "Did not receive shader output from triangle orientation shader.",
    );
  }

  return triangles;
}
